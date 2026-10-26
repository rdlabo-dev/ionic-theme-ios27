package dev.rdlabo.capacitor.nativeuikit

import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.net.URI

/** Optional fast path for coordinates only. Lifecycle and actions keep the host's bridge. */
class NativeUIPlacementChannel(
    private val webView: WebView,
    private val name: String,
    private val session: PlacementSession,
    private val apply: (JSONObject) -> Unit,
) : AutoCloseable {
    private var attached = false
    fun attach(origins: Set<String>): Boolean {
        require(name.matches(Regex("[A-Za-z_$][A-Za-z0-9_$]*")))
        require(origins.isNotEmpty() && origins.all {
            val uri = URI(it)
            uri.scheme in listOf("http", "https") && !uri.host.isNullOrEmpty() && !it.contains('*') &&
                uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null && uri.rawPath.isNullOrEmpty()
        }) { "Provide exact trusted app origins, never wildcard origins" }
        if (attached) return true
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return false
        return try {
            WebViewCompat.addWebMessageListener(webView, name, origins) { _, message, _, mainFrame, _ ->
                if (mainFrame) receive(message.data)
            }
            attached = true; true
        } catch (_: RuntimeException) { false }
    }
    /** Also usable from the regular plugin bridge; returns whether the batch was accepted. */
    fun receive(raw: String?): Boolean {
        if (raw == null || raw.length > 1_000_000) return false
        return try {
            val batch = JSONObject(raw)
            if (!batch.has("placements") || batch.optJSONArray("placements") == null) return false
            if (!session.accept(batch.optString("sessionId"), batch.optLong("sequence", -1))) return false
            apply(batch); true
        } catch (_: Exception) { false }
    }
    override fun close() {
        if (attached && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) WebViewCompat.removeWebMessageListener(webView, name)
        attached = false; session.close()
    }
}
