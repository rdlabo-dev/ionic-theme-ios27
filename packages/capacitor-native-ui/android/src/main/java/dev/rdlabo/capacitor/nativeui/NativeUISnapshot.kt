package dev.rdlabo.capacitor.nativeui

import org.json.JSONObject

internal data class ExtensionNode(
    val id: String,
    val frame: NativeUIFrame,
    val dark: Boolean,
    val rtl: Boolean,
    val name: String,
    val props: String,
    val actions: Map<String, String>,
)

internal data class NativeUISnapshot(val revision: Long, val viewportWidth: Double, val nodes: List<ExtensionNode>, val rejected: List<String>) {
    companion object {
        fun parse(json: JSONObject): NativeUISnapshot {
            val revisionValue = json.getDouble("revision")
            require(revisionValue.isFinite() && revisionValue >= 0 && revisionValue % 1.0 == 0.0 && revisionValue <= 9007199254740991.0)
            val width = json.getDouble("viewportWidth")
            require(width.isFinite() && width > 0)
            val controls = json.getJSONArray("controls")
            require(controls.length() <= 1000)
            val ids = mutableSetOf<String>()
            val nodes = mutableListOf<ExtensionNode>()
            val rejected = mutableListOf<String>()
            for (index in 0 until controls.length()) {
                val item = controls.getJSONObject(index)
                val id = item.getString("id")
                require(id.isNotBlank() && ids.add(id))
                if (item.getString("kind") != "extension") {
                    rejected.add(id)
                    continue
                }
                val extension = item.getJSONObject("extension")
                if (!extension.isNull("tabBarId") || item.optString("placement") == "vertical-bars") {
                    rejected.add(id)
                    continue
                }
                val frame = NativeUIFrame(item.getDouble("x"), item.getDouble("y"), item.getDouble("width"), item.getDouble("height"))
                require(listOf(frame.x, frame.y, frame.width, frame.height).all { it.isFinite() })
                require(frame.width > 0 && frame.height > 0)
                val props = extension.getString("props")
                require(props.length <= 65536)
                JSONObject(props)
                val rawActions = extension.getJSONObject("actions")
                require(rawActions.length() <= 30)
                val actions = rawActions.keys().asSequence().associateWith { key ->
                    require(key.isNotBlank())
                    rawActions.getString(key).also { require(it.isNotBlank()) }
                }
                nodes.add(ExtensionNode(id, frame, item.optBoolean("dark"), item.optBoolean("rtl"), extension.getString("name"), props, actions))
            }
            return NativeUISnapshot(revisionValue.toLong(), width, nodes, rejected)
        }
    }
}
