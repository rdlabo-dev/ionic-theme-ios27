package dev.rdlabo.capacitor.nativeui

import android.os.Bundle
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.getcapacitor.BridgeActivity

class EngineConsumerActivity : BridgeActivity() {
    override fun onCreate(state: Bundle?) {
        if (!NativeUI.renderers.containsKey("engine.fixture")) NativeUI.register("engine.fixture", { it }) { _, _, _ ->
            Box(Modifier.fillMaxSize().background(Color(0x80DC1E50)))
        }
        registerPlugin(NativeUIPlugin::class.java)
        super.onCreate(state)
    }
}
