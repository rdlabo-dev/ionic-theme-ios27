package dev.rdlabo.capacitor.nativeui

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeUISnapshotTest {
    private fun node() = JSONObject("""{"id":"counter","kind":"extension","x":12,"y":24,"width":100,"height":44,"extension":{"name":"app.counter","props":"{\"count\":1}","actions":{"increment":"button"}}}""")
    private fun snapshot(vararg nodes: JSONObject) = JSONObject().put("revision", 1).put("viewportWidth", 360).put("controls", JSONArray(nodes.toList()))

    @Test fun readsGeometryPropsAndActionTargets() {
        val parsed = NativeUISnapshot.parse(snapshot(node())).nodes.single()
        assertEquals(NativeUIFrame(12.0, 24.0, 100.0, 44.0), parsed.frame)
        assertEquals(1, JSONObject(parsed.props).getInt("count"))
        assertEquals("button", parsed.actions["increment"])
    }

    @Test fun rejectsStandardControlsAndTabAccessories() {
        val standard = JSONObject().put("id", "button").put("kind", "button")
        val accessory = node().apply { getJSONObject("extension").put("tabBarId", "tabs") }
        val parsed = NativeUISnapshot.parse(snapshot(standard, accessory))
        assertTrue(parsed.nodes.isEmpty())
        assertEquals(listOf("button", "counter"), parsed.rejected)
    }

    @Test fun invalidSnapshotsDoNotPartiallyApply() {
        assertThrows(IllegalArgumentException::class.java) { NativeUISnapshot.parse(snapshot(node(), node())) }
        assertThrows(IllegalArgumentException::class.java) { NativeUISnapshot.parse(snapshot(node()).put("viewportWidth", 0)) }
        assertThrows(IllegalArgumentException::class.java) { NativeUISnapshot.parse(snapshot(node()).put("revision", 1.5)) }
        assertThrows(IllegalArgumentException::class.java) { NativeUISnapshot.parse(snapshot(node().put("width", -1))) }
    }
}
