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
    private val receiveListeners: ReceiveListeners = ReceiveListeners(),
    allowedOrigins: Set<String> = setOf("https://localhost", "http://localhost"),
    failedFallback: FailedFallback,
    private val captureMode: CaptureMode = CaptureMode.COMPOSITED,
    private val canCapture: () -> Boolean = { true },
    private val beforeNativeReveal: () -> Unit = {},
    private val updatePlacement: ((JSONObject) -> Unit)?,
    view: () -> View?
) : AutoCloseable {
    /** Preserve the pre-placement-handoff constructor, including Kotlin default arguments. */
    constructor(
        window: Window,
        webView: WebView,
        plugin: String,
        projectionSelector: String,
        receiveListeners: ReceiveListeners = ReceiveListeners(),
        allowedOrigins: Set<String> = setOf("https://localhost", "http://localhost"),
        failedFallback: FailedFallback,
        captureMode: CaptureMode = CaptureMode.COMPOSITED,
        canCapture: () -> Boolean = { true },
        beforeNativeReveal: () -> Unit = {},
        view: () -> View?
    ) : this(window, webView, plugin, projectionSelector, receiveListeners, allowedOrigins,
        failedFallback, captureMode, canCapture, beforeNativeReveal, null, view)

    /** Preserve the original source and JVM constructor contracts for existing plugin binaries. */
    constructor(
        window: Window,
        webView: WebView,
        plugin: String,
        projectionSelector: String,
        receiveListeners: ReceiveListeners = ReceiveListeners(),
        allowedOrigins: Set<String> = setOf("https://localhost", "http://localhost"),
        canCapture: () -> Boolean = { true },
        view: () -> View?
    ) : this(window, webView, plugin, projectionSelector, receiveListeners, allowedOrigins,
        FailedFallback.WEB, CaptureMode.COMPOSITED, canCapture, {}, null, view)

    /** True only after an opaque VIEW handoff hid native pixels. Main-thread access only. */
    var isProjecting: Boolean = false
        private set
    private fun prepareNativeReveal() {
        isProjecting = false
        if (captureMode == CaptureMode.VIEW && !suspended && visible) beforeNativeReveal()
    }

    /** VIEW is for opaque software-renderable views; SurfaceView/video requires COMPOSITED. */
    enum class CaptureMode { COMPOSITED, VIEW }
    enum class FailedFallback(val value: String) { WEB("web"), NATIVE("native") }

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
    companion object {
        private val registrations = java.util.WeakHashMap<WebView, MutableMap<String, java.lang.ref.WeakReference<NativeUIProjection>>>()
        private val origins = java.util.WeakHashMap<WebView, Set<String>>()
        /** Call during plugin load, before navigation. Later SDK views reuse this channel. */
        @JvmStatic
        @JvmOverloads
        fun install(webView: WebView, allowedOrigins: Set<String> = setOf("https://localhost", "http://localhost")) {
            check(android.os.Looper.myLooper() == android.os.Looper.getMainLooper())
            if (registrations.containsKey(webView)) {
                require(origins[webView] == allowedOrigins) { "Native UI channel origins cannot change" }
                return
            }
            check(webView.url == null || webView.url == "about:blank") {
                "Install NativeUIProjection during plugin load, before WebView navigation"
            }
            val owners = mutableMapOf<String, java.lang.ref.WeakReference<NativeUIProjection>>()
            WebViewCompat.addWebMessageListener(webView, "nativeUIEngine", allowedOrigins) { _, message, _, mainFrame, _ ->
                if (mainFrame) runCatching { JSONObject(message.data ?: "") }.getOrNull()?.let {
                    owners[it.optString("key").substringBefore(":")]?.get()?.let { owner -> if (!owner.closed) owner.receive(it) }
                }
            }
            registrations[webView] = owners
            origins[webView] = allowedOrigins.toSet()
        }
    }
    @Volatile private var notificationDestination: String? = null
    /** Observe an existing notification; retain state without replaying or emitting events. */
    fun receive(eventName: String, data: JSONObject? = null) {
        if (!receiveListeners.match.all { (key, expected) ->
            val actual = data?.opt(key)
            if (actual is Number && expected is Number) actual.toDouble() == expected.toDouble()
            else actual == expected
        }) return
        val routes = receiveListeners.projection
        val matches = listOf("native" to routes.native, "web" to routes.web, "none" to routes.none)
            .filter { eventName in it.second }
        if (matches.size == 1) notificationDestination = matches.single().first
    }
    private val sourceView = view
    private fun views() = sourceView()?.let { mapOf("view" to it) } ?: emptyMap()
    private val id = "nativeUI" + UUID.randomUUID().toString().replace("-", "")
    private val snapshots = NativeUISnapshots(File(webView.context.cacheDir, "native-ui-engine/$id"))
    private data class Anchor(val native: RectF, val image: RectF)
    private val anchors = mutableMapOf<String, Map<String, Anchor>>()
    private val webReadyTokens = mutableSetOf<String>()
    private val captured = mutableMapOf<String, Map<String, View>>()
    private var destination = "native"
    private var connected = false
    private var restoreAccepted = true
    private val hiddenByProjection = mutableSetOf<View>()
    private var coverGeneration = 0L
    internal var awaitWebDraw: (WebView, () -> Boolean, (Boolean) -> Unit) -> Unit = NativeUIWebReadiness::draw
    private var suspended = false
    private var visible = true
    private var closed = false
    private var documentID: String? = null
    private val script: ScriptHandler
    private val stopInteraction: () -> Unit
    private var windowInteracting = false
    private fun resetSnapshots() {
        snapshots.reset()
        snapshots.interaction(windowInteracting)
    }
    init {
        check(android.os.Looper.myLooper() == android.os.Looper.getMainLooper())
        require(updatePlacement == null || captureMode == CaptureMode.VIEW) { "Placement handoff requires VIEW capture mode" }
        require(projectionSelector.isNotBlank())
        require(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) { "WebView document-start messaging is required" }
        val config = JSONObject().put("id", id).put("plugin", plugin).put("projectionSelector", projectionSelector)
            .put("receiveListeners", receiveListeners.configuration()).put("failedFallback", failedFallback.value).put("captureMode", if (captureMode == CaptureMode.VIEW) "view" else "composited")
        if (updatePlacement != null) config.put("placementHandoff", true)
        val runtime = webView.context.assets.open("native-ui-engine.js").bufferedReader().use { it.readText() }
        val source = "if (!globalThis.CapacitorNativeUIEngineRuntime) { $runtime } CapacitorNativeUIEngineRuntime.start($config).catch(console.error);"
        install(webView, allowedOrigins)
        registrations.getValue(webView)[id] = java.lang.ref.WeakReference(this)
        var installedScript: ScriptHandler? = null
        try {
            val created = WebViewCompat.addDocumentStartJavaScript(webView, source, allowedOrigins)
            installedScript = created
            // Also support initialization after the current page has loaded.
            val allowed = JSONArray(allowedOrigins)
            webView.evaluateJavascript("if ($allowed.includes(location.origin)) { $source }", null)
            script = created
        } catch (error: Exception) {
            installedScript?.remove()
            registrations[webView]?.remove(id)
            snapshots.close()
            throw error
        }
        stopInteraction = NativeUIWindowInteraction.observe(window) { active ->
            windowInteracting = active
            snapshots.interaction(active)
            reply(null, JSONObject().put("active", active))
        }

    }
    private fun frame(view: View): RectF {
        val a = IntArray(2); val b = IntArray(2)
        view.getLocationInWindow(a); webView.getLocationInWindow(b)
        return RectF((a[0]-b[0]).toFloat(), (a[1]-b[1]).toFloat(), (a[0]-b[0]+view.width).toFloat(), (a[1]-b[1]+view.height).toFloat())
    }
    private fun clips(selected: Map<String, View>): Map<String, RectF>? {
        if (captureMode != CaptureMode.VIEW) return null
        return selected.mapValues { (_, view) ->
            val clip = frame(view)
            var parent = view.parent
            while (parent is android.view.ViewGroup) {
                if (parent.clipChildren) {
                    val bounds = frame(parent)
                    if (parent.clipToPadding) {
                        bounds.left += parent.paddingLeft; bounds.top += parent.paddingTop
                        bounds.right -= parent.paddingRight; bounds.bottom -= parent.paddingBottom
                    }
                    if (!clip.intersect(bounds)) clip.setEmpty()
                }
                parent = parent.parent
            }
            clip
        }
    }
    private fun receive(message: JSONObject) {
        if (closed) return
        val key = message.optString("key")
        if (!key.startsWith("$id:")) return
        val page = key.split(":").getOrNull(1)
        if (documentID != page) { coverGeneration++; prepareNativeReveal(); resetSnapshots(); webReadyTokens.clear(); captured.clear(); anchors.clear(); documentID = page }
        val request = message.optJSONObject("request") ?: return
        val token = request.optString("token")
        val complete: (JSONObject) -> Unit = { value -> if (!closed && documentID == page) reply(key, value) }
        fun applyPlacement(): Boolean {
            if (closed || suspended || !visible) return false
            val placement = request.optJSONObject("placement") ?: return true
            val selected = captured[token]
            val current = views()
            if (!snapshots.hidesNativeViews(token) || selected.isNullOrEmpty() || selected.any { (id, view) -> current[id] !== view }) {
                reply(key, JSONObject(), "Native placement token is no longer active")
                return false
            }
            return try {
                updatePlacement?.invoke(placement)
                !closed && !suspended && visible
            } catch (error: Exception) {
                reply(key, JSONObject(), error.message ?: "Native placement update failed")
                false
            }
        }
        fun ownsHiddenToken(): Boolean {
            val selected = captured[token] ?: return false
            val current = views()
            return snapshots.hidesNativeViews(token) && selected.isNotEmpty() && selected.all { (id, view) -> current[id] === view }
        }
        when (request.optString("action")) {
            "connect" -> {
                if (!connected) { destination = (if (views().values.any { it.visibility == View.VISIBLE }) "native" else "none"); connected = true }
                complete(JSONObject().put("destination", notificationDestination ?: destination))
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
                }, sourceViews = if (captureMode == CaptureMode.VIEW) ({ selected }) else null, contentRevision = request.optLong("revision")) { result ->
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
                        if (captureMode == CaptureMode.VIEW) snapshots.discardViewBitmaps(token)
                    }
                    complete(result)
                }
            }
            "prepared" -> {
                awaitWebDraw(webView, { !closed && !suspended && visible && captured.containsKey(token) }) { ready ->
                    if (ready) webReadyTokens.add(token)
                    complete(JSONObject())
                }
            }
            "cover" -> {
                val generation = ++coverGeneration
                val selected = captured[token] ?: emptyMap(); val current = views()
                val valid = visible && canCapture() && selected.isNotEmpty() && selected.all { (id, view) -> current[id] === view }
                restoreAccepted = true
                if (captureMode == CaptureMode.VIEW && valid) {
                    fun coverView() = snapshots.coverView(token, window, webView, selected.values.distinct()).also { if (it) isProjecting = true }
                    if (token in webReadyTokens) complete(JSONObject().put("shown", coverView()))
                    else {
                        val current = { !closed && generation == coverGeneration && !suspended && visible &&
                            captured[token] == selected && selected.all { (id, view) -> views()[id] === view } && canCapture() }
                        awaitWebDraw(webView, current) { ready ->
                            val accepted = ready && current()
                            if (accepted) webReadyTokens.add(token)
                            complete(JSONObject().put("shown", accepted && coverView()))
                        }
                    }
                } else complete(JSONObject().put("shown", valid && snapshots.cover(token, window, webView, selected.values.distinct(), true, clips(selected))))
            }
            "restore" -> {
                coverGeneration++
                restoreAccepted = false
                if (suspended || !visible) { complete(JSONObject().put("shown", false)); return }
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
                if (!applyPlacement()) return
                prepareNativeReveal()
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
                // A successful plugin placement is newer than the image's return frame.
                // Only legacy consumers need the captured anchor to position native views.
                if (updatePlacement == null || request.optJSONObject("placement") == null) {
                    for ((id, target) in frames) {
                        val view = current.getValue(id); val old = frame(view)
                        val anchor = anchors.getValue(token).getValue(id)
                        view.translationX += anchor.native.left+target.left-anchor.image.left-old.left
                        view.translationY += anchor.native.top+target.top-anchor.image.top-old.top
                    }
                }
                restoreAccepted = captureMode == CaptureMode.VIEW || snapshots.restore(token, window, webView, frames, clips = clips(current.filterKeys { it in frames }))
                complete(JSONObject().put("shown", restoreAccepted))
            }
            "resume" -> {
                coverGeneration++
                if (!restoreAccepted || suspended) { reply(key, JSONObject(), "Native UI geometry changed or hidden"); return }
                prepareNativeReveal()
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
                listener = ViewTreeObserver.OnDrawListener { root.postOnAnimation { root.post(finish) } }
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
                coverGeneration++
                visible = request.optBoolean("visible") && !suspended
                if (visible) { if (!applyPlacement()) return; prepareNativeReveal(); snapshots.restoreViews() } else { isProjecting = false; snapshots.dismiss() }
                if (visible) {
                    hiddenByProjection.forEach { if (it.visibility == View.INVISIBLE) it.visibility = View.VISIBLE }
                    hiddenByProjection.clear()
                } else {
                    views().values.filter { it.visibility == View.VISIBLE }.forEach { hiddenByProjection.add(it); it.visibility = View.INVISIBLE }
                }
                complete(JSONObject())
            }
            "painted" -> if (captureMode == CaptureMode.VIEW) complete(JSONObject()) else snapshots.retireCopyAfterWebDraw(token, webView) { ready ->
                if (ready) complete(JSONObject()) else reply(key, JSONObject(), "Web image did not draw")
            }
            "restored" -> { snapshots.retireCopy(token, false); complete(JSONObject()) }
            "release" -> { if (ownsHiddenToken()) { if (!applyPlacement()) return; prepareNativeReveal() }; snapshots.release(token); webReadyTokens.remove(token); captured.remove(token); anchors.remove(token); complete(JSONObject()) }
            "reset" -> { coverGeneration++; if (!suspended && visible && !applyPlacement()) return; prepareNativeReveal(); resetSnapshots(); webReadyTokens.clear(); captured.clear(); anchors.clear(); complete(JSONObject()) }
            else -> complete(JSONObject())
        }
    }
    private fun reply(key: String?, value: JSONObject, error: String? = null) {
        if (closed) return
        val args = JSONArray().put(id).put(key ?: JSONObject.NULL).put(value).put(error ?: JSONObject.NULL)
        webView.evaluateJavascript("globalThis.CapacitorNativeUIEngineRuntime?.receive(...$args)", null)
    }
    /** Hide pixels immediately; completion confirms the Web proxy has also been retired. */
    fun hide(complete: (Boolean) -> Unit = {}) {
        check(android.os.Looper.myLooper() == android.os.Looper.getMainLooper())
        coverGeneration++
        isProjecting = false
        suspended = true; visible = false; destination = "none"; notificationDestination = "none"; connected = true
        snapshots.dismiss(); webReadyTokens.clear()
        views().values.filter { it.visibility == View.VISIBLE }.forEach { hiddenByProjection.add(it); it.visibility = View.INVISIBLE }
        var done = false
        val timeout = Runnable { if (!done) { done = true; complete(false) } }
        webView.postDelayed(timeout, 5000)
        webView.evaluateJavascript("globalThis.CapacitorNativeUIEngineRuntime?.hide('$id') === true") { result ->
            if (!done) { done = true; webView.removeCallbacks(timeout); complete(result == "true") }
        }
    }
    /** Permit subsequent native presentation after a completed hide. */
    fun show() {
        check(android.os.Looper.myLooper() == android.os.Looper.getMainLooper())
        suspended = false; destination = "native"; notificationDestination = "native"; connected = true
        webView.evaluateJavascript("globalThis.CapacitorNativeUIEngineRuntime?.show('$id')", null)
    }
    override fun close() {
        if (closed) return
        closed = true
        isProjecting = false
        coverGeneration++
        stopInteraction()
        webView.evaluateJavascript("globalThis.CapacitorNativeUIEngineRuntime?.stop('$id')", null)
        script.remove()
        registrations[webView]?.remove(id)
        snapshots.close(); webReadyTokens.clear(); captured.clear(); anchors.clear()
        if (destination != "none") hiddenByProjection.forEach { if (it.visibility == View.INVISIBLE) it.visibility = View.VISIBLE }
        hiddenByProjection.clear()
    }
}
