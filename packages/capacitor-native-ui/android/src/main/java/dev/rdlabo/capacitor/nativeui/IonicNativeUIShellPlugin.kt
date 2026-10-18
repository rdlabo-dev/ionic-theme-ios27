package dev.rdlabo.capacitor.nativeui

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.unit.LayoutDirection
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.roundToInt

@CapacitorPlugin(name = "IonicNativeUIShell")
class IonicNativeUIShellPlugin : Plugin() {
    private val handler = Handler(Looper.getMainLooper())
    private var host: FrameLayout? = null
    private var revision = 0L
    private var sequence = 0L
    private var paused = false
    private val entries = linkedMapOf<String, Entry>()
    private val pending = mutableMapOf<String, (Boolean) -> Unit>()
    private val layoutListener = View.OnLayoutChangeListener { _, l, t, r, b, oldL, oldT, oldR, oldB ->
        if (l != oldL || t != oldT || r != oldR || b != oldB) {
            host?.visibility = View.INVISIBLE
            failActions()
            notifyListeners("webViewMetricsChange", JSObject().put("radius", 0))
        }
    }

    private class Entry(val view: ComposeView, var node: ExtensionNode) {
        val content = mutableStateOf<(@Composable () -> Unit)?>(null)
    }

    override fun load() {
        activity.runOnUiThread { bridge.webView.addOnLayoutChangeListener(layoutListener) }
    }

    @PluginMethod
    fun configure(call: PluginCall) = onMain(call) {
        clearViews()
        revision = 0
        sequence = 0
        call.resolve(JSObject().put("supported", true).put("extensions", JSArray(NativeUIShell.renderers.keys.toList())))
    }

    @PluginMethod
    fun getWebViewMetrics(call: PluginCall) = call.resolve(JSObject().put("radius", 0))

    @PluginMethod
    fun update(call: PluginCall) = onMain(call) {
        val snapshot = ShellSnapshot.parse(call.data)
        require(snapshot.revision > revision) { "Stale Native UI snapshot" }
        val web = bridge.webView
        val parent = web.parent as? ViewGroup ?: error("WebView has no host")
        require(web.width > 0 && web.height > 0 && web.scaleX == 1f && web.scaleY == 1f) { "WebView geometry unavailable" }
        val scale = web.width / snapshot.viewportWidth
        val dpScale = scale / web.resources.displayMetrics.density
        val accepted = linkedMapOf<String, Pair<ExtensionNode, @Composable () -> Unit>>()
        val rejected = snapshot.rejected.toMutableList()
        for (node in snapshot.nodes) {
            val renderer = NativeUIShell.renderers[node.name]
            if (renderer == null || paused) {
                rejected.add(node.id)
                continue
            }
            try {
                val f = node.frame
                require(listOf(f.x * scale, f.y * scale, f.width * scale, f.height * scale).all { it in -1_000_000.0..1_000_000.0 })
                val context = NativeUIContext(node.id, f, NativeUIFrame(f.x * dpScale, f.y * dpScale, f.width * dpScale, f.height * dpScale), snapshot.viewportWidth, dpScale, node.dark, node.rtl)
                val actions = NativeUIActions(node.actions.keys) { action -> activate(node, action) }
                accepted[node.id] = node to renderer(JSONObject(node.props), actions, context)
            } catch (_: Exception) {
                rejected.add(node.id)
            }
        }
        revision = snapshot.revision
        val container = host ?: FrameLayout(activity).also {
            it.clipChildren = true
            it.clipToPadding = true
            parent.addView(it, ViewGroup.LayoutParams(web.width, web.height))
            host = it
        }
        container.layoutParams = container.layoutParams.apply { width = web.width; height = web.height }
        container.x = web.x
        container.y = web.y
        for (id in entries.keys.toList()) if (id !in accepted) removeEntry(id)
        for ((id, pair) in accepted) {
            val (node, content) = pair
            val entry = entries[id] ?: Entry(ComposeView(activity), node).also { entry ->
                entry.view.setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
                container.addView(entry.view)
                entry.view.setContent { entry.content.value?.invoke() }
                entries[id] = entry
            }
            entry.node = node
            entry.content.value = {
                CompositionLocalProvider(LocalLayoutDirection provides if (node.rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) { content() }
            }
            entry.view.layoutParams = FrameLayout.LayoutParams((node.frame.width * scale).roundToInt().coerceAtLeast(1), (node.frame.height * scale).roundToInt().coerceAtLeast(1)).apply {
                leftMargin = (node.frame.x * scale).roundToInt()
                topMargin = (node.frame.y * scale).roundToInt()
            }
        }
        container.visibility = if (paused) View.INVISIBLE else View.VISIBLE
        call.resolve(JSObject().put("revision", revision).put("rejectedControls", JSArray(rejected)))
    }

    private suspend fun activate(node: ExtensionNode, name: String): Unit = withContext(Dispatchers.Main.immediate) {
        check(!paused && host?.visibility == View.VISIBLE && entries[node.id]?.node == node) { "Native UI action is stale" }
        val target = node.actions[name] ?: error("Native UI action is unavailable")
        suspendCancellableCoroutine { continuation ->
            val request = UUID.randomUUID().toString()
            val timeout = Runnable { pending.remove(request)?.invoke(false) }
            pending[request] = { accepted ->
                handler.removeCallbacks(timeout)
                if (continuation.isActive) {
                    if (accepted) continuation.resume(Unit)
                    else continuation.resumeWithException(IllegalStateException("Native UI action was not accepted"))
                }
            }
            continuation.invokeOnCancellation { handler.post { pending.remove(request); handler.removeCallbacks(timeout) } }
            handler.postDelayed(timeout, 5000)
            notifyListeners("activate", JSObject().put("revision", revision).put("id", target).put("sequence", ++sequence).put("requestId", request))
        }
    }

    @PluginMethod
    fun completeExtensionAction(call: PluginCall) = onMain(call) {
        val request = call.getString("requestId") ?: error("Missing requestId")
        pending.remove(request)?.invoke(call.getBoolean("accepted", false) == true)
        call.resolve()
    }

    @PluginMethod
    fun clear(call: PluginCall) = onMain(call) {
        val next = call.data.getLong("revision")
        require(next > revision) { "Stale Native UI clear" }
        revision = next
        clearViews()
        call.resolve()
    }

    private fun onMain(call: PluginCall, block: () -> Unit) {
        activity.runOnUiThread {
            try { block() } catch (error: Exception) { call.reject(error.message ?: "Native UI failed", error) }
        }
    }
    private fun failActions() {
        val callbacks = pending.values.toList()
        pending.clear()
        callbacks.forEach { it(false) }
    }
    private fun removeEntry(id: String) {
        entries.remove(id)?.let { it.view.disposeComposition(); host?.removeView(it.view) }
    }
    private fun clearViews() {
        failActions()
        entries.keys.toList().forEach(::removeEntry)
        (host?.parent as? ViewGroup)?.removeView(host)
        host = null
    }
    override fun handleOnPause() {
        paused = true
        host?.visibility = View.INVISIBLE
        failActions()
    }
    override fun handleOnResume() {
        paused = false
        notifyListeners("webViewMetricsChange", JSObject().put("radius", 0))
    }
    override fun handleOnDestroy() {
        bridge.webView.removeOnLayoutChangeListener(layoutListener)
        clearViews()
    }
}
