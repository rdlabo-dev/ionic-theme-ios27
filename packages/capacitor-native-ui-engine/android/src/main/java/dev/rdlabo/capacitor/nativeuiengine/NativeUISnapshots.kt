package dev.rdlabo.capacitor.nativeuiengine

import android.graphics.Canvas
import android.graphics.Bitmap
import android.graphics.Rect
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.ImageView
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.ceil
import kotlin.math.floor

/** Prepared composited pixels. No capture or encoding is performed by cover/restore. Main-thread API. */
class NativeUISnapshots(private val directory: File) : AutoCloseable {
    private data class Part(val id: String, val frame: RectF, val bitmap: Bitmap, val file: File)
    private data class Capture(val width: Int, val height: Int, val origin: List<Int>, val referenceWidth: Int, val referenceHeight: Int, val parts: List<Part>)
    private data class Copy(val token: String, val entry: Boolean, val root: ViewGroup, val views: List<ImageView>)
    private val main = Handler(Looper.getMainLooper())
    private val encoder = Executors.newSingleThreadExecutor()
    private val captures = mutableMapOf<String, Capture>()
    private data class ViewCache(val revision: Long, val views: Map<String, View>, val parts: List<Part>)
    private var viewCache: ViewCache? = null
    private val expiredEntries = mutableSetOf<String>()
    private var copy: Copy? = null
    private var hidden: Pair<String, List<Pair<View, Int>>>? = null
    private var generation = 0L
    private var touching = false
    private var pending = false
    private var closed = false
    var coveringToken: String? = null; private set
    val hidesNativeViews get() = hidden != null
    internal fun hidesNativeViews(token: String): Boolean { onMain(); return hidden?.first == token }
    @get:androidx.annotation.ChecksSdkIntAtLeast(api = 26)
    val supported get() = Build.VERSION.SDK_INT >= 26
    private fun onMain() = check(Looper.myLooper() == Looper.getMainLooper())
    private fun origin(view: View): List<Int> = IntArray(2).also { view.getLocationInWindow(it) }.toList()
    fun changed() { onMain(); generation++ }
    fun interaction(active: Boolean) { onMain(); touching = active; generation++ }

    /** frames() returns current native bounds in reference-view physical pixels. */
    fun prepare(window: Window, reference: View, viewportWidth: Double, frames: () -> Map<String, RectF>, sourceViews: (() -> Map<String, View>)? = null, contentRevision: Long = 0, complete: (JSONObject) -> Unit) {
        onMain()
        if (!supported || closed || pending || touching || viewportWidth <= 0 || !viewportWidth.isFinite() || reference.width <= 0) { complete(JSONObject()); return }
        pending = true
        val stamp = generation
        val started = android.os.SystemClock.uptimeMillis()
        fun fail() { pending = false; complete(JSONObject()) }
        fun sample(previous: Map<String, RectF>, stable: Int) {
            if (closed || generation != stamp || touching || android.os.SystemClock.uptimeMillis() - started >= 1000) { fail(); return }
            val current = try { frames().mapValues { RectF(it.value) } } catch (_: Exception) { fail(); return }
            if (current.isEmpty() || current.any { it.key.isEmpty() || !it.value.valid() }) { fail(); return }
            val count = if (current == previous) stable + 1 else 0
            if (count < 3) { main.postDelayed({ sample(current, count) }, 16); return }
            capture(window, reference, viewportWidth, current, stamp, sourceViews?.invoke(), contentRevision) { pending = false; complete(it) }
        }
        // Stable native bounds do not imply that the Web background has painted.
        // Prepare the Web draw before measuring/capturing the composited window.
        if (reference is WebView) {
            NativeUIWebReadiness.prepare(reference, { !closed && generation == stamp && !touching }) { ready ->
                if (ready) sample(emptyMap(), 0) else fail()
            }
        } else sample(emptyMap(), 0)
    }
    private fun capture(window: Window, reference: View, viewportWidth: Double, frames: Map<String, RectF>, stamp: Long, sourceViews: Map<String, View>?, contentRevision: Long, complete: (JSONObject) -> Unit) {
        if (Build.VERSION.SDK_INT < 26) { complete(JSONObject()); return }
        val root = window.decorView
        val location = origin(reference)
        val ratio = viewportWidth / reference.width
        val width = root.width; val height = root.height
        val referenceWidth = reference.width; val referenceHeight = reference.height
        fun deliver(parts: List<Part>) {
            val token = UUID.randomUUID().toString()
            captures[token] = Capture(width, height, location, referenceWidth, referenceHeight, parts)
            complete(JSONObject().put("token", token).put("parts", JSONArray(parts.map { part ->
                JSONObject().put("ids", JSONArray(listOf(part.id))).put("url", Uri.fromFile(part.file).toString())
                    .put("x", part.frame.left * ratio).put("y", part.frame.top * ratio)
                    .put("width", part.frame.width() * ratio).put("height", part.frame.height() * ratio)
            })))
        }
        val cached = viewCache
        if (sourceViews != null && cached != null && cached.revision == contentRevision && cached.views == sourceViews &&
            cached.parts.all { part -> frames[part.id]?.let { it.width() == part.frame.width() && it.height() == part.frame.height() } == true }) {
            deliver(cached.parts.map { it.copy(frame = RectF(frames.getValue(it.id))) })
            return
        }
        val regions = frames.mapValues { (_, frame) ->
            if (sourceViews != null) Rect(floor(frame.left + location[0].toDouble()).toInt(), floor(frame.top + location[1].toDouble()).toInt(),
                ceil(frame.right + location[0].toDouble()).toInt(), ceil(frame.bottom + location[1].toDouble()).toInt())
            else Rect(floor(frame.left + location[0] - 12.0).toInt().coerceAtLeast(0), floor(frame.top + location[1] - 12.0).toInt().coerceAtLeast(0),
                ceil(frame.right + location[0] + 12.0).toInt().coerceAtMost(width), ceil(frame.bottom + location[1] + 12.0).toInt().coerceAtMost(height))
        }
        if (regions.any { it.value.isEmpty }) { complete(JSONObject()); return }
        val union = Rect().also { rect -> regions.values.forEach { rect.union(it) } }
        if (union.width().toLong() * union.height() > 8_000_000 || regions.values.sumOf { it.width().toLong() * it.height() } > 8_000_000) { complete(JSONObject()); return }
        val pixels = try { Bitmap.createBitmap(union.width(), union.height(), Bitmap.Config.ARGB_8888) } catch (_: RuntimeException) { complete(JSONObject()); return }
        try {
            val acceptPixels: (Int) -> Unit = accept@ { result ->
                if (result != PixelCopy.SUCCESS || closed || generation != stamp || touching) { pixels.recycle(); complete(JSONObject()); return@accept }
                val token = UUID.randomUUID().toString()
                encoder.execute {
                    val parts = mutableListOf<Part>()
                    try {
                        directory.mkdirs()
                        for ((id, rect) in regions) {
                            val image = Bitmap.createBitmap(pixels, rect.left - union.left, rect.top - union.top, rect.width(), rect.height())
                            val file = File(directory, "$token-${parts.size}.png")
                            try {
                                check(file.outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) })
                            } catch (error: Exception) { if (image !== pixels) image.recycle(); file.delete(); throw error }
                            parts.add(Part(id, RectF(rect.left - location[0].toFloat(), rect.top - location[1].toFloat(), rect.right - location[0].toFloat(), rect.bottom - location[1].toFloat()), image, file))
                        }
                    } catch (_: Exception) { parts.forEach { it.file.delete(); if (it.bitmap !== pixels) it.bitmap.recycle() }; parts.clear() }
                    main.post {
                        if (closed || generation != stamp || touching || root.width != width || root.height != height || origin(reference) != location || reference.width != referenceWidth || reference.height != referenceHeight || parts.size != regions.size) {
                            parts.forEach { it.file.delete(); if (it.bitmap !== pixels) it.bitmap.recycle() }
                            pixels.recycle(); complete(JSONObject()); return@post
                        }
                        // A full-bounds crop may share pixels; keep that bitmap until token release.
                        if (parts.none { it.bitmap === pixels }) pixels.recycle()
                        val previous = viewCache
                        if (sourceViews != null) viewCache = ViewCache(contentRevision, sourceViews.toMap(), parts)
                        previous?.parts?.forEach(::releasePixelsIfUnused)
                        deliver(parts)
                    }
                }
            }
            if (sourceViews == null) PixelCopy.request(window, union, pixels, acceptPixels, main)
            else {
                check(sourceViews.keys == frames.keys)
                val canvas = Canvas(pixels)
                for ((id, view) in sourceViews) {
                    val rect = regions.getValue(id)
                    val save = canvas.save()
                    canvas.translate((rect.left-union.left).toFloat(), (rect.top-union.top).toFloat())
                    canvas.clipRect(0,0,view.width,view.height)
                    view.draw(canvas)
                    canvas.restoreToCount(save)
                }
                acceptPixels(PixelCopy.SUCCESS)
            }
        } catch (_: RuntimeException) { pixels.recycle(); complete(JSONObject()) }
    }
    private fun valid(token: String, window: Window, reference: View): Capture? = captures[token]?.takeIf {
        window.decorView.width == it.width && window.decorView.height == it.height && origin(reference) == it.origin && reference.width == it.referenceWidth && reference.height == it.referenceHeight
    }
    fun cover(token: String, window: Window, reference: View, views: List<View>, transient: Boolean = false, clips: Map<String, RectF>? = null, frames: Map<String, RectF>? = null): Boolean {
        onMain()
        // Composite pixels cover both the live translucent view and its Web replacement.
        // Install the entry copy before changing native visibility in the same UI turn.
        expiredEntries.remove(token)
        if (!restore(token, window, reference, frames = frames, entry = true, clips = clips)) return false
        if (!transient) coveringToken = token
        hide(token, views)
        return true
    }
    /** Opaque pixels already painted in Web need no composited native overlay. */
    internal fun discardViewBitmaps(token: String) {
        onMain()
        check(copy == null) { "Composited handoff pixels are still in use" }
        captures[token]?.parts?.forEach { if (!it.bitmap.isRecycled) it.bitmap.recycle() }
    }
    fun coverView(token: String, window: Window, reference: View, views: List<View>): Boolean {
        onMain()
        if (valid(token, window, reference) == null) return false
        hide(token, views)
        return true
    }
    private fun hide(token: String, views: List<View>) {
        onMain(); restoreViews(); generation++
        hidden = token to views.map { it to it.visibility }.also { saved -> saved.forEach { it.first.visibility = View.INVISIBLE } }
    }
    fun restoreViews() { onMain(); hidden?.second?.forEach { (view, visibility) -> view.visibility = visibility }; hidden = null }
    fun identifiers(token: String): Set<String> = captures[token]?.parts?.map { it.id }?.toSet() ?: emptySet()
    fun restore(token: String, window: Window, reference: View, frames: Map<String, RectF>? = null, entry: Boolean = false, clips: Map<String, RectF>? = null): Boolean {
        onMain(); val capture = valid(token, window, reference) ?: return false
        if (frames != null && capture.parts.any { part ->
            val frame = frames[part.id]
            frame?.valid() != true || kotlin.math.abs(frame.width() - part.frame.width()) > 0.1f || kotlin.math.abs(frame.height() - part.frame.height()) > 0.1f
        }) return false
        clearCopy()
        val root = window.decorView as? ViewGroup ?: return false
        val rootLocation = origin(root); val sourceLocation = origin(reference)
        val views = capture.parts.map { part ->
            val frame = RectF(part.frame)
            frames?.get(part.id)?.let { current ->
                val original = part.frame
                frame.offset(current.left - original.left, current.top - original.top)
            }
            frame.offset((sourceLocation[0]-rootLocation[0]).toFloat(), (sourceLocation[1]-rootLocation[1]).toFloat())
            ImageView(reference.context).also { view ->
                view.setImageBitmap(part.bitmap); view.scaleType = ImageView.ScaleType.FIT_XY
                view.isClickable = false; view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                view.layout(floor(frame.left.toDouble()).toInt(), floor(frame.top.toDouble()).toInt(), ceil(frame.right.toDouble()).toInt(), ceil(frame.bottom.toDouble()).toInt())
                clips?.get(part.id)?.let { clip ->
                    val clipInRoot = RectF(clip)
                    clipInRoot.offset((sourceLocation[0]-rootLocation[0]).toFloat(), (sourceLocation[1]-rootLocation[1]).toFloat())
                    view.clipBounds = Rect(ceil(clipInRoot.left-frame.left.toDouble()).toInt().coerceAtLeast(0),
                        ceil(clipInRoot.top-frame.top.toDouble()).toInt().coerceAtLeast(0),
                        floor(clipInRoot.right-frame.left.toDouble()).toInt().coerceAtMost(view.width),
                        floor(clipInRoot.bottom-frame.top.toDouble()).toInt().coerceAtMost(view.height))
                }
                root.overlay.add(view)
            }
        }
        val current = Copy(token, entry, root, views); copy = current
        main.postDelayed({ if (copy === current) {
            if (current.entry) { expiredEntries.add(token); restoreViews() }
            clearCopy()
        } }, 500)
        return true
    }
    fun retireCopyAfterWebDraw(token: String, webView: WebView, complete: (Boolean) -> Unit) {
        onMain()
        if (token in expiredEntries) { complete(false); return }
        val expected = copy
        if (expected == null || expected.token != token || !expected.entry) { complete(true); return }
        NativeUIWebReadiness.prepare(webView, { !closed && copy === expected }) { ready ->
            if (!ready) { complete(token !in expiredEntries && copy !== expected); return@prepare }
            val observer = webView.viewTreeObserver
            var done = false
            lateinit var listener: android.view.ViewTreeObserver.OnDrawListener
            fun finish(success: Boolean) {
                if (done) return
                done = true
                if (observer.isAlive) observer.removeOnDrawListener(listener)
                if (success && copy === expected) retireCopy(token)
                complete(token !in expiredEntries && (success || copy !== expected))
            }
            listener = android.view.ViewTreeObserver.OnDrawListener { webView.post { finish(true) } }
            observer.addOnDrawListener(listener)
            webView.invalidate()
            webView.postDelayed({ finish(false) }, 250)
        }
    }
    fun retireCopy(token: String, entry: Boolean = true) { onMain(); if (copy?.token == token && copy?.entry == entry) clearCopy() }
    private fun clearCopy() { copy?.let { current -> current.views.forEach { current.root.overlay.remove(it) } }; copy = null }
    fun dismiss() { onMain(); generation++; clearCopy(); restoreViews(); coveringToken = null }
    fun finishCovering() { onMain(); coveringToken = null }
    private fun releasePixelsIfUnused(part: Part) {
        if (viewCache?.parts?.any { it.bitmap === part.bitmap } == true || captures.values.any { capture -> capture.parts.any { it.bitmap === part.bitmap } }) return
        part.file.delete(); if (!part.bitmap.isRecycled) part.bitmap.recycle()
    }
    fun release(token: String) {
        expiredEntries.remove(token)
        onMain(); if (hidden?.first == token) restoreViews(); if (coveringToken == token) coveringToken = null
        if (copy?.token == token) clearCopy()
        captures.remove(token)?.parts?.forEach(::releasePixelsIfUnused)
    }
    fun reset() { onMain(); generation++; touching = false; val previous = viewCache; viewCache = null; restoreViews(); captures.keys.toList().forEach(::release); previous?.parts?.forEach(::releasePixelsIfUnused) }
    override fun close() { onMain(); closed = true; val previous = viewCache; viewCache = null; reset(); previous?.parts?.forEach(::releasePixelsIfUnused); encoder.shutdown() }
}
