package dev.rdlabo.capacitor.nativeui

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class EngineConsumerTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private fun main(block: () -> Unit) = instrumentation.runOnMainSync(block)
    @Test fun realCapacitorBridgePreservesTranslucentComposePixelsAcrossRepeatedHandoffs() {
        val activity = instrumentation.startActivitySync(Intent(instrumentation.targetContext, EngineConsumerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as EngineConsumerActivity
        fun js(code: String): String {
            val done=CountDownLatch(1); var value=""
            main { activity.bridge.webView.evaluateJavascript(code) { value=it; done.countDown() } }
            assertTrue(done.await(5,TimeUnit.SECONDS)); return value
        }
        fun awaitJS(code: String) {
            js("window.done=false;window.failure=null;($code).then(()=>window.done=true).catch(e=>{window.failure=String(e);window.done=true})")
            val deadline=System.currentTimeMillis()+10000
            while(js("window.done")!="true" && System.currentTimeMillis()<deadline) Thread.sleep(20)
            assertEquals("true",js("window.done"));assertEquals("null",js("window.failure"))
        }
        val running=AtomicBoolean(false)
        try {
            val deadline=System.currentTimeMillis()+10000
            while(js("typeof prepare")!="\"function\"" && System.currentTimeMillis()<deadline) Thread.sleep(20)
            awaitJS("prepare()")
            val samples=java.util.Collections.synchronizedList(mutableListOf<Bitmap>())
            val handler=Handler(Looper.getMainLooper());val pending=java.util.concurrent.atomic.AtomicInteger()
            lateinit var sample:Runnable
            sample=Runnable {
                if(running.get()) {
                    val web=activity.bridge.webView;val scale=web.width/jsWidth
                    val origin=IntArray(2);web.getLocationInWindow(origin)
                    val rect=Rect(origin[0]+(22*scale).toInt(),origin[1]+(102*scale).toInt(),origin[0]+(178*scale).toInt(),origin[1]+(162*scale).toInt())
                    val image=Bitmap.createBitmap(rect.width(),rect.height(),Bitmap.Config.ARGB_8888)
                    pending.incrementAndGet()
                    PixelCopy.request(activity.window,rect,image,{ result ->
                        if(result==PixelCopy.SUCCESS)samples.add(image) else image.recycle()
                        pending.decrementAndGet()
                        if(running.get())handler.postDelayed(sample,16)
                    },handler)
                }
            }
            jsWidth=js("innerWidth").toFloat();running.set(true);main{handler.post(sample)}
            Thread.sleep(120)
            for(delay in listOf(0,80)) repeat(3){awaitJS("roundTrip($delay)")}
            running.set(false);main{handler.removeCallbacks(sample)}
            val deadline2=System.currentTimeMillis()+2000
            while(pending.get()>0 && System.currentTimeMillis()<deadline2)Thread.sleep(10)
            assertEquals(0,pending.get());assertTrue("Only ${samples.size} frames",samples.size>=12)
            var delta=0;val baseline=samples.first();var worst=baseline;var difference=""
            samples.forEachIndexed { index,image ->
                for(y in 0 until image.height)for(x in 0 until image.width) {
                    val a=baseline.getPixel(x,y);val b=image.getPixel(x,y)
                    for(shift in listOf(0,8,16)) {
                        val change=kotlin.math.abs(((a shr shift) and 255)-((b shr shift) and 255))
                        if(change>delta){delta=change;worst=image;difference="frame=$index x=$x y=$y baseline=${Integer.toHexString(a)} actual=${Integer.toHexString(b)}"}
                    }
                }
            }
            if(delta>2) {
                val directory=java.io.File(instrumentation.targetContext.cacheDir,"projection-failure").apply{mkdirs()}
                java.io.File(directory,"baseline.png").outputStream().use{baseline.compress(Bitmap.CompressFormat.PNG,100,it)}
                java.io.File(directory,"actual.png").outputStream().use{worst.compress(Bitmap.CompressFormat.PNG,100,it)}
                android.util.Log.e("EngineConsumerTest","$difference artifacts=$directory")
            }
            // A uniform/blank Web background could make an incorrect capture look stable.
            // Check both known stripes underneath the 50% translucent Compose surface.
            val scale=activity.bridge.webView.width/jsWidth
            val stripePixels=listOf(baseline.getPixel(0,0) to 0xffc85f46.toInt(), baseline.getPixel((20*scale).toInt(),0) to 0xff823764.toInt())
            val backgroundMatches=stripePixels.all { (actual,expected) ->
                listOf(0,8,16).all { shift -> kotlin.math.abs(((actual shr shift) and 255)-((expected shr shift) and 255))<=2 }
            }
            samples.forEach{it.recycle()}
            assertTrue("Expected composited Web background stripes",backgroundMatches)
            android.util.Log.i("EngineConsumerTest","Capacitor/Compose handoff: ${samples.size} frames, max channel delta $delta")
            assertTrue("Color changed: $delta",delta<=2)
            awaitJS("teardown()")
        } finally {running.set(false);main{activity.finish()}}
    }
    private var jsWidth=1f
}
