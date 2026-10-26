package dev.rdlabo.capacitor.nativeuikit
import org.junit.Assert.*
import org.junit.Test
class PlacementSessionTest {
 @Test fun staleMessagesCannotResurrectPausedOrClosedViews() {
  val session=PlacementSession("current")
  assertFalse(session.accept("old",1)); assertTrue(session.accept("current",1)); assertFalse(session.accept("current",1))
  assertTrue(session.pause(3)); assertFalse(session.accept("current",4)); assertFalse(session.resume(2))
  assertTrue(session.resume(5)); assertFalse(session.accept("current",4)); assertTrue(session.accept("current",6))
  session.close(); assertFalse(session.accept("current",7)); assertFalse(session.resume(8))
 }
 @Test fun ownersNeverShareTheirSequence() {
  val a=PlacementSession("a");val b=PlacementSession("b")
  assertTrue(a.accept("a",10));assertTrue(b.accept("b",1));assertFalse(a.accept("b",11))
 }
}
