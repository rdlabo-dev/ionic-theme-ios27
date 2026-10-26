package dev.rdlabo.capacitor.nativeuikit

/** A channel and the regular plugin bridge share this single sequence authority. */
class PlacementSession(val id: String) {
    private var sequence = -1L
    private var paused = false
    private var closed = false
    init { require(id.isNotEmpty()) }
    fun accept(session: String, next: Long): Boolean {
        if (closed || paused || session != id || next < 0 || next <= sequence) return false
        sequence = next
        return true
    }
    /** Lifecycle messages carry their sequence, rejecting in-flight older coordinates. */
    fun pause(next: Long): Boolean {
        if (closed || next < 0 || next <= sequence) return false
        sequence = next; paused = true; return true
    }
    fun resume(next: Long): Boolean {
        if (closed || next < 0 || next <= sequence) return false
        sequence = next; paused = false; return true
    }
    fun close() { closed = true }
}
