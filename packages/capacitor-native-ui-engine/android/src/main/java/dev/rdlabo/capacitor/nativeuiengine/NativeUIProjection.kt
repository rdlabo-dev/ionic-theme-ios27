package dev.rdlabo.capacitor.nativeuiengine

import android.graphics.RectF
import android.view.View
import android.view.ViewTreeObserver
import android.view.Window
import android.webkit.WebView
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Plugin-owned registration; uses the plugin's existing events without wrapping its methods. */
class NativeUIProjection(
    private val window: Window,
    private val webView: WebView,
    plugin: String,
    projectionSelector: String,
    receiveListeners: ReceiveListeners = ReceiveListeners(),
    allowedOrigins: Set<String> = setOf("https://localhost", "http://localhost"),
    private val canCapture: () -> Boolean = { true },
    view: () -> View?
) : AutoCloseable {
    data class ReceiveListeners(
        val update: List<String> = emptyList(),
        val projection: Projection = Projection(),
        val match: Map<String, Any> = emptyMap()
    ) {
        data class Projection(
            val native: List<String> = emptyList(),
            val web: List<String> = emptyList(),
            val none: List<String> = emptyList()
        )
        internal fun configuration() = JSONObject()
            .put("update", JSONArray(update))
            .put("projection", JSONObject()
                .put("native", JSONArray(projection.native))
                .put("web", JSONArray(projection.web))
                .put("none", JSONArray(projection.none)))
            .put("match", JSONObject(match))
    }
    private val sourceView = view
    private fun views() = sourceView()?.let { mapOf("view" to it) } ?: emptyMap()
    private val id = "nativeUI" + UUID.randomUUID().toString().replace("-", "")
    private val snapshots = NativeUISnapshots(File(webView.context.cacheDir, "native-ui-engine/$id"))
    private data class Anchor(val native: RectF, val image: RectF)
    private val anchors = mutableMapOf<String, Map<String, Anchor>>()
    private val captured = mutableMapOf<String, Map<String, View>>()
    private var destination = "native"
    private var connected = false
    private var restoreAccepted = true
    private val hiddenByProjection = mutableSetOf<View>()
    private var visible = true
    private var closed = false
    private var documentID: String? = null
    private val script: ScriptHandler
    init {
        check(android.os.Looper.myLooper() == android.os.Looper.getMainLooper())
        require(projectionSelector.isNotBlank())
        require(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) { "WebView document-start messaging is required" }
        val config = JSONObject().put("id", id).put("plugin", plugin).put("projectionSelector", projectionSelector)
            .put("receiveListeners", receiveListeners.configuration())
        val runtime = webView.context.assets.open("native-ui-engine.js").bufferedReader().use { it.readText() }
        val source = "if (!globalThis.CapacitorNativeUIEngineRuntime) { $runtime } CapacitorNativeUIEngineRuntime.start($config).catch(console.error);"
        WebViewCompat.addWebMessageListener(webView, id, allowedOrigins) { _, message, _, mainFrame, _ ->
            if (mainFrame && !closed) {
                runCatching { JSONObject(message.data ?: "") }.getOrNull()?.let(::receive)
            }
        }
        script = WebViewCompat.addDocumentStartJavaScript(webView, source, allowedOrigins)
        // Also support initialization after the current page has loaded.
        val allowed = JSONArray(allowedOrigins)
        webView.evaluateJavascript("if ($allowed.includes(location.origin)) { $source }", null)
    }
    private fun frame(view: View): RectF {
        val a = IntArray(2); val b = IntArray(2)
        view.getLocationInWindow(a); webView.getLocationInWindow(b)
        return RectF((a[0]-b[0]).toFloat(), (a[1]-b[1]).toFloat(), (a[0]-b[0]+view.width).toFloat(), (a[1]-b[1]+view.height).toFloat())
    }
    private fun receive(message: JSONObject) {
        val key = message.optString("key")
        if (!key.startsWith("$id:")) return
        val page = key.split(":").getOrNull(1)
        if (documentID != page) { snapshots.reset(); captured.clear(); anchors.clear(); documentID = page }
        val request = message.optJSONObject("request") ?: return
        val token = request.optString("token")
        val complete: (JSONObject) -> Unit = { value -> if (!closed && documentID == page) reply(key, value) }
        when (request.optString("action")) {
            "connect" -> {
                if (!connected) { destination = if (views().values.any { it.visibility == View.VISIBLE }) "native" else "none"; connected = true }
                complete(JSONObject().put("destination", destination))
            }
            "destination" -> {
                request.optString("destination").takeIf { it in listOf("native", "web", "none") }?.let { destination = it; connected = true }
                complete(JSONObject())
            }
            "track" -> complete(JSONObject().put("tracked", false))
            "prepare" -> {
                val ids = request.optJSONArray("ids")?.let { array -> (0 until array.length()).map { array.optString(it) } } ?: emptyList()
                val selected = views().filterKeys { it in ids }
                if (!visible || !canCapture() || ids.isEmpty() || selected.size != ids.size) { complete(JSONObject()); return }
                snapshots.prepare(window, webView, request.optDouble("viewportWidth"), {
                    val current = views()
                    if (!visible || !canCapture() || selected.any { (id, view) -> current[id] !== view || !view.isShown || view.isLayoutRequested }) emptyMap()
                    else selected.mapValues { frame(it.value) }
                }) { result ->
                    result.optString("token").takeIf { it.isNotEmpty() }?.let { token ->
                        captured[token] = selected
                        val scale = (webView.width/request.optDouble("viewportWidth")).toFloat()
                        val parts = result.optJSONArray("parts") ?: JSONArray()
                        val entries = mutableMapOf<String, Anchor>()
                        for (index in 0 until parts.length()) {
                            val part = parts.getJSONObject(index)
                            val x = part.getDouble("x").toFloat()*scale; val y = part.getDouble("y").toFloat()*scale
                            val image = RectF(x,y,x+part.getDouble("width").toFloat()*scale,y+part.getDouble("height").toFloat()*scale)
                            val ids = part.getJSONArray("ids")
                            for (i in 0 until ids.length()) { val id = ids.getString(i); selected[id]?.let { entries[id] = Anchor(frame(it),image) } }
                        }
                        anchors[token] = entries
                    }
                    complete(result)
                }
            }
            "cover" -> {
                val selected = captured[token] ?: emptyMap(); val current = views()
                val valid = visible && canCapture() && selected.isNotEmpty() && selected.all { (id, view) -> current[id] === view }
                restoreAccepted = true
                complete(JSONObject().put("shown", valid && snapshots.cover(token, window, webView, selected.values.distinct(), true)))
            }
            "restore" -> {
                restoreAccepted = false
                val parts = request.optJSONArray("parts") ?: JSONArray()
                val width = request.optDouble("viewportWidth")
                if (!width.isFinite() || width <= 0 || parts.length() == 0) { complete(JSONObject().put("shown", false)); return }
                val scale = (webView.width / width).toFloat()
                val frames = mutableMapOf<String, RectF>()
                for (index in 0 until parts.length()) {
                    val part = parts.optJSONObject(index) ?: return
                    val x = part.optDouble("x"); val y = part.optDouble("y"); val w = part.optDouble("width"); val h = part.optDouble("height")
                    if (!listOf(x,y,w,h).all { it.isFinite() } || w <= 0 || h <= 0) { complete(JSONObject().put("shown", false)); return }
                    val ids = part.optJSONArray("ids") ?: return
                    for (i in 0 until ids.length()) frames[ids.getString(i)] = RectF((x*scale).toFloat(), (y*scale).toFloat(), ((x+w)*scale).toFloat(), ((y+h)*scale).toFloat())
                }
                if (frames.isEmpty() || frames.keys != snapshots.identifiers(token)) { complete(JSONObject().put("shown", false)); return }
                val current = views()
                for ((id, target) in frames) {
                    val view = current[id]
                    val anchor = anchors[token]?.get(id)
                    if (view == null || captured[token]?.get(id) !== view || anchor == null) { complete(JSONObject().put("shown", false)); return }
                    val old = frame(view)
                    if (kotlin.math.abs(old.width()-anchor.native.width()) >= 0.1f || kotlin.math.abs(old.height()-anchor.native.height()) >= 0.1f ||
                        kotlin.math.abs(target.width()-anchor.image.width()) >= 0.1f || kotlin.math.abs(target.height()-anchor.image.height()) >= 0.1f) {
                        complete(JSONObject().put("shown", false)); return
                    }
                }
                for ((id, target) in frames) {
                    val view = current.getValue(id); val old = frame(view)
                    val anchor = anchors.getValue(token).getValue(id)
                    view.translationX += anchor.native.left+target.left-anchor.image.left-old.left
                    view.translationY += anchor.native.top+target.top-anchor.image.top-old.top
                }
                restoreAccepted = snapshots.restore(token, window, webView, frames)
                complete(JSONObject().put("shown", restoreAccepted))
            }
            "resume" -> {
                if (!restoreAccepted) { reply(key, JSONObject(), "Native UI geometry changed"); return }
                snapshots.restoreViews(); snapshots.finishCovering()
                val root = window.decorView
                val observer = root.viewTreeObserver
                lateinit var listener: ViewTreeObserver.OnDrawListener
                var done = false
                val finish = Runnable {
                    if (!done) {
                        done = true
                        if (observer.isAlive) observer.removeOnDrawListener(listener)
                        complete(JSONObject())
                    }
                }
                listener = ViewTreeObserver.OnDrawListener { root.post(finish) }
                observer.addOnDrawListener(listener)
                root.invalidate()
                // A detached window must not report successful drawing.
                root.postDelayed({ if (!done) {
                    done = true
                    if (observer.isAlive) observer.removeOnDrawListener(listener)
                    reply(key, JSONObject(), "Native UI did not draw")
                } }, 250)
            }
            "visibility" -> {
                visible = request.optBoolean("visible")
                snapshots.restoreViews()
                if (visible) {
                    hiddenByProjection.forEach { if (it.visibility == View.INVISIBLE) it.visibility = View.VISIBLE }
                    hiddenByProjection.clear()
                } else {
                    views().values.filter { it.visibility == View.VISIBLE }.forEach { hiddenByProjection.add(it); it.visibility = View.INVISIBLE }
                }
                complete(JSONObject())
            }
            "painted" -> { snapshots.retireCopy(token); complete(JSONObject()) }
            "restored" -> { snapshots.retireCopy(token, false); complete(JSONObject()) }
            "release" -> { snapshots.release(token); captured.remove(token); anchors.remove(token); complete(JSONObject()) }
            "reset" -> { snapshots.reset(); captured.clear(); anchors.clear(); complete(JSONObject()) }
            else -> complete(JSONObject())
        }
    }
    private fun reply(key: String?, value: JSONObject, error: String? = null) {
        if (closed) return
        val args = JSONArray().put(id).put(key ?: JSONObject.NULL).put(value).put(error ?: JSONObject.NULL)
        webView.evaluateJavascript("globalThis.CapacitorNativeUIEngineRuntime?.receive(...$args)", null)
    }
    override fun close() {
        if (closed) return
        closed = true
        webView.evaluateJavascript("globalThis.CapacitorNativeUIEngineRuntime?.stop('$id')", null)
        script.remove()
        WebViewCompat.removeWebMessageListener(webView, id)
        snapshots.close(); captured.clear(); anchors.clear()
        if (destination != "none") hiddenByProjection.forEach { if (it.visibility == View.INVISIBLE) it.visibility = View.VISIBLE }
        hiddenByProjection.clear()
    }
}
