package dev.rdlabo.capacitor.nativeui

import android.os.Looper
import androidx.compose.runtime.Composable
import org.json.JSONObject
import java.util.Collections

/**
 * App-local Compose renderers. Register on the main thread before starting the shell.
 * Experimental API: registration interfaces and behavior may change in future releases.
 */
object NativeUIShell {
    internal val renderers = linkedMapOf<String, (JSONObject, NativeUIActions, NativeUIContext) -> (@Composable () -> Unit)>()

    fun <Props> register(
        name: String,
        decode: (JSONObject) -> Props,
        content: @Composable (Props, NativeUIActions, NativeUIContext) -> Unit,
    ) {
        check(Looper.myLooper() == Looper.getMainLooper()) { "Register Native UI on the main thread" }
        require(name.isNotBlank() && !renderers.containsKey(name)) { "Native UI names must be nonempty and unique" }
        renderers[name] = { json, actions, context ->
            val props = decode(json)
            val view: @Composable () -> Unit = { content(props, actions, context) }
            view
        }
    }
}

data class NativeUIFrame(val x: Double, val y: Double, val width: Double, val height: Double)

/** Source geometry, not screen coordinates. Android currently supports element placement only. */
data class NativeUIContext(
    val sourceID: String,
    val sourceFrame: NativeUIFrame,
    val sourceFrameInDp: NativeUIFrame,
    val viewportWidth: Double,
    val dpPerCSSPixel: Double,
    val dark: Boolean,
    val rtl: Boolean,
)

/** Completion acknowledges the DOM click dispatch, not the application's asynchronous work. */
class NativeUIActions internal constructor(names: Set<String>, private val dispatch: suspend (String) -> Unit) {
    val availableNames: Set<String> = Collections.unmodifiableSet(names.toSet())
    fun isAvailable(name: String): Boolean = name in availableNames
    suspend fun activate(name: String) {
        check(isAvailable(name)) { "Native UI action is unavailable" }
        dispatch(name)
    }
}
