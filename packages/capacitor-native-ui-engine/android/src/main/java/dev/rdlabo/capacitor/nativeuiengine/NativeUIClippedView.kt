package dev.rdlabo.capacitor.nativeuiengine

import android.graphics.RectF
import android.os.Looper
import android.view.View
import android.widget.FrameLayout
import kotlin.math.ceil

/** Full-size native content; only its visible container bounds change on clipping. */
// Constructed with renderer-owned content, never inflated from XML.
@android.annotation.SuppressLint("ViewConstructor")
class NativeUIClippedView(val content: View) : FrameLayout(content.context) {
    /** Observes renderer gestures without consuming or redirecting SDK actions. */
    var interaction: ((Boolean) -> Unit)? = null
    override fun dispatchTouchEvent(event: android.view.MotionEvent): Boolean {
        when (event.actionMasked) {
            android.view.MotionEvent.ACTION_DOWN -> interaction?.invoke(true)
            android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> interaction?.invoke(false)
        }
        val handled = super.dispatchTouchEvent(event)
        if (event.actionMasked == android.view.MotionEvent.ACTION_DOWN && !handled) interaction?.invoke(false)
        return handled
    }
    init { clipChildren = true; clipToPadding = true; addView(content) }
    fun place(frame: RectF, clip: RectF): Boolean {
        check(Looper.myLooper() == Looper.getMainLooper())
        val visible = RectF(frame)
        if (!frame.valid() || !clip.valid() || !visible.intersect(clip)) { visibility = View.INVISIBLE; return false }
        val width = ceil(visible.width().toDouble()).toInt(); val height = ceil(visible.height().toDouble()).toInt()
        val params = layoutParams ?: LayoutParams(width, height)
        if (layoutParams == null || params.width != width || params.height != height) {
            params.width = width; params.height = height; layoutParams = params
        }
        x = visible.left; y = visible.top
        val contentWidth = ceil(frame.width().toDouble()).toInt(); val contentHeight = ceil(frame.height().toDouble()).toInt()
        val child = content.layoutParams
        if (child.width != contentWidth || child.height != contentHeight) {
            child.width = contentWidth; child.height = contentHeight; content.layoutParams = child
        }
        content.x = frame.left - visible.left; content.y = frame.top - visible.top
        visibility = View.VISIBLE
        return true
    }
}

internal fun RectF.valid(): Boolean = listOf(left, top, right, bottom).all { it.isFinite() && it in -1_000_000f..1_000_000f } && width() > 0 && height() > 0
