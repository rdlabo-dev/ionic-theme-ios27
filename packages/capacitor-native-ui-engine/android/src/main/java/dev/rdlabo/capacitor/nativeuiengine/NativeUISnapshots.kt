package dev.rdlabo.capacitor.nativeuiengine

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
    private var copy: Copy? = null
    private var hidden: Pair<String, List<Pair<View, Int>>>? = null
    private var generation = 0L
    private var touching = false
    private var pending = false
    private var closed = false
    var coveringToken: String? = null; private set
    val hidesNativeViews get() = hidden != null
    @get:androidx.annotation.ChecksSdkIntAtLeast(api = 26)
    val supported get() = Build.VERSION.SDK_INT >= 26
    private fun onMain() = check(Looper.myLooper() == Looper.getMainLooper())
    private fun origin(view: View): List<Int> = IntArray(2).also { view.getLocationInWindow(it) }.toList()
    fun changed() { onMain(); generation++ }
    fun interaction(active: Boolean) { onMain(); touching = active; generation++ }

    /** frames() returns current native bounds in reference-view physical pixels. */
    fun prepare(window: Window, reference: View, viewportWidth: Double, frames: () -> Map<String, RectF>, complete: (JSONObject) -> Unit) {
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
            capture(window, reference, viewportWidth, current, stamp) { pending = false; complete(it) }
        }
        // Stable native bounds do not imply that the Web background has painted.
        // Prepare the Web draw before measuring/capturing the composited window.
        if (reference is WebView) {
            NativeUIWebReadiness.prepare(reference, { !closed && generation == stamp && !touching }) { ready ->
                if (ready) sample(emptyMap(), 0) else fail()
            }
        } else sample(emptyMap(), 0)
    }
    private fun capture(window: Window, reference: View, viewportWidth: Double, frames: Map<String, RectF>, stamp: Long, complete: (JSONObject) -> Unit) {
        if (Build.VERSION.SDK_INT < 26) { complete(JSONObject()); return }
        val root = window.decorView
        val location = origin(reference)
        val ratio = viewportWidth / reference.width
        val width = root.width; val height = root.height
        val referenceWidth = reference.width; val referenceHeight = reference.height
        val regions = frames.mapValues { (_, frame) ->
            Rect(floor(frame.left + location[0] - 12.0).toInt().coerceAtLeast(0), floor(frame.top + location[1] - 12.0).toInt().coerceAtLeast(0),
                ceil(frame.right + location[0] + 12.0).toInt().coerceAtMost(width), ceil(frame.bottom + location[1] + 12.0).toInt().coerceAtMost(height))
        }
        if (regions.any { it.value.isEmpty }) { complete(JSONObject()); return }
        val union = Rect().also { rect -> regions.values.forEach { rect.union(it) } }
        if (union.width().toLong() * union.height() > 8_000_000 || regions.values.sumOf { it.width().toLong() * it.height() } > 8_000_000) { complete(JSONObject()); return }
        val pixels = try { Bitmap.createBitmap(union.width(), union.height(), Bitmap.Config.ARGB_8888) } catch (_: RuntimeException) { complete(JSONObject()); return }
        try {
            PixelCopy.request(window, union, pixels, { result ->
                if (result != PixelCopy.SUCCESS || closed || generation != stamp || touching) { pixels.recycle(); complete(JSONObject()); return@request }
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
                        captures[token] = Capture(width, height, location, referenceWidth, referenceHeight, parts)
                        complete(JSONObject().put("token", token).put("parts", JSONArray(parts.map { part ->
                            JSONObject().put("ids", JSONArray(listOf(part.id))).put("url", Uri.fromFile(part.file).toString())
                                .put("x", part.frame.left * ratio).put("y", part.frame.top * ratio)
                                .put("width", part.frame.width() * ratio).put("height", part.frame.height() * ratio)
                        })))
                    }
                }
            }, main)
        } catch (_: RuntimeException) { pixels.recycle(); complete(JSONObject()) }
    }
    private fun valid(token: String, window: Window, reference: View): Capture? = captures[token]?.takeIf {
        window.decorView.width == it.width && window.decorView.height == it.height && origin(reference) == it.origin && reference.width == it.referenceWidth && reference.height == it.referenceHeight
    }
    fun cover(token: String, window: Window, reference: View, views: List<View>, transient: Boolean = false): Boolean {
        onMain()
        // Composite pixels cover both the live translucent view and its Web replacement.
        // Install the entry copy before changing native visibility in the same UI turn.
        if (!restore(token, window, reference, entry = true)) return false
        if (!transient) coveringToken = token
        hide(token, views)
        return true
    }
    private fun hide(token: String, views: List<View>) {
        onMain(); restoreViews(); generation++
        hidden = token to views.map { it to it.visibility }.also { saved -> saved.forEach { it.first.visibility = View.INVISIBLE } }
    }
    fun restoreViews() { onMain(); hidden?.second?.forEach { (view, visibility) -> view.visibility = visibility }; hidden = null }
    fun identifiers(token: String): Set<String> = captures[token]?.parts?.map { it.id }?.toSet() ?: emptySet()
    fun restore(token: String, window: Window, reference: View, frames: Map<String, RectF>? = null, entry: Boolean = false): Boolean {
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
                root.overlay.add(view)
            }
        }
        val current = Copy(token, entry, root, views); copy = current
        main.postDelayed({ if (copy === current) clearCopy() }, 500)
        return true
    }
    fun retireCopy(token: String, entry: Boolean = true) { onMain(); if (copy?.token == token && copy?.entry == entry) clearCopy() }
    private fun clearCopy() { copy?.let { current -> current.views.forEach { current.root.overlay.remove(it) } }; copy = null }
    fun finishCovering() { onMain(); coveringToken = null }
    fun release(token: String) {
        onMain(); if (hidden?.first == token) restoreViews(); if (coveringToken == token) coveringToken = null
        if (copy?.token == token) clearCopy()
        captures.remove(token)?.parts?.forEach { it.file.delete(); if (!it.bitmap.isRecycled) it.bitmap.recycle() }
    }
    fun reset() { onMain(); generation++; touching = false; restoreViews(); captures.keys.toList().forEach(::release) }
    override fun close() { onMain(); closed = true; reset(); encoder.shutdown() }
}
