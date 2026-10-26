package dev.rdlabo.capacitor.nativeuiengine

import android.os.Handler
import android.os.Looper
import android.webkit.WebView

/** Confirm the Web draw after prepared pixels are shown or retired.
 * The caller keeps its temporary native copy until completion; overlay startup need not wait.
 * Success means ready for a subsequent WebView draw, not displayed on screen.
 */
object NativeUIWebReadiness {
    fun prepare(webView: WebView, current: () -> Boolean, completed: (Boolean) -> Unit) {
        check(Looper.myLooper() == Looper.getMainLooper())
        val handler = Handler(Looper.getMainLooper())
        var pending = true
        lateinit var timeout: Runnable
        fun finish(ready: Boolean) {
            if (!pending) return
            pending = false
            handler.removeCallbacks(timeout)
            val valid = ready && webView.isAttachedToWindow && webView.isShown && current()
            if (valid) webView.invalidate()
            completed(valid)
        }
        timeout = Runnable { finish(false) }
        if (!webView.isAttachedToWindow || !webView.isShown || !current()) {
            finish(false)
            return
        }
        handler.postDelayed(timeout, 2000)
        try {
            webView.postVisualStateCallback(0, object : WebView.VisualStateCallback() {
                override fun onComplete(requestId: Long) = finish(true)
            })
        } catch (_: RuntimeException) { finish(false) }
    }
}
