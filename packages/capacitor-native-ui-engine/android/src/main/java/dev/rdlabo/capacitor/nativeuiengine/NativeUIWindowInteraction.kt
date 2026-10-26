package dev.rdlabo.capacitor.nativeuiengine

import android.view.MotionEvent
import android.view.Window
import java.lang.ref.WeakReference
import java.util.WeakHashMap

/** One non-consuming observer per window; preserve the application's callback chain. */
internal class NativeUIWindowInteraction private constructor(
    private val previous: Window.Callback
) : Window.Callback by previous {
    private val listeners = linkedSetOf<(Boolean) -> Unit>()
    private var active = false

    private fun changed(value: Boolean) {
        if (active == value) return
        active = value
        listeners.toList().forEach { it(value) }
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) changed(true)
        var handled = false
        try {
            handled = previous.dispatchTouchEvent(event)
            return handled
        } finally {
            if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL ||
                (event.actionMasked == MotionEvent.ACTION_DOWN && !handled)) changed(false)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        if (!hasFocus) changed(false)
        previous.onWindowFocusChanged(hasFocus)
    }

    companion object {
        private val observers = WeakHashMap<Window, WeakReference<NativeUIWindowInteraction>>()
        fun observe(window: Window, listener: (Boolean) -> Unit): () -> Unit {
            check(android.os.Looper.myLooper() == android.os.Looper.getMainLooper())
            val observer = observers[window]?.get() ?: NativeUIWindowInteraction(requireNotNull(window.callback)).also {
                observers[window] = WeakReference(it)
                window.callback = it
            }
            observer.listeners.add(listener)
            listener(observer.active)
            return {
                observer.listeners.remove(listener)
                if (observer.listeners.isEmpty()) {
                    if (window.callback === observer) window.callback = observer.previous
                    if (observers[window]?.get() === observer) observers.remove(window)
                }
            }
        }
    }
}
