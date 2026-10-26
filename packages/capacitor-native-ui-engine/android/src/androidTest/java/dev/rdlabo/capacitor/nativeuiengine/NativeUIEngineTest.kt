package dev.rdlabo.capacitor.nativeuiengine
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.RectF
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class NativeUIEngineTest {
 private val instrumentation get()=InstrumentationRegistry.getInstrumentation()
 private fun main(action:()->Unit)=instrumentation.runOnMainSync(action)
 private fun activity():EngineTestActivity {
  val context=instrumentation.targetContext
  val activity=instrumentation.startActivitySync(Intent(context,EngineTestActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as EngineTestActivity
  instrumentation.waitForIdleSync()
  val deadline=System.currentTimeMillis()+5000
  var ready=false
  while(!ready && System.currentTimeMillis()<deadline) {
   val done=CountDownLatch(1)
   main{activity.web.evaluateJavascript("document.readyState==='complete' && document.body?.textContent.includes('Web content')"){ready=it=="true";done.countDown()}}
   assertTrue(done.await(2,TimeUnit.SECONDS))
   if(!ready)Thread.sleep(10)
  }
  assertTrue("Web fixture did not finish loading",ready)
  return activity
 }
 @Test fun placementChangesPositionWithoutResettingDimensionsAndClipsInput() {
  val activity=activity()
  try {main {
   val child=TextView(activity);val container=NativeUIClippedView(child)
   activity.root.addView(container,FrameLayout.LayoutParams(1,1))
   assertTrue(container.place(RectF(20f,20f,180f,100f),RectF(0f,60f,300f,500f)))
   assertEquals(40,container.layoutParams.height);assertEquals(80,child.layoutParams.height)
   assertEquals(-40f,child.y,0.1f)
   val containerParams=container.layoutParams;val contentParams=child.layoutParams
   assertTrue(container.place(RectF(20f,30f,180f,110f),RectF(0f,70f,300f,500f)))
   assertSame(containerParams,container.layoutParams);assertSame(contentParams,child.layoutParams)
   val touches=mutableListOf<Boolean>();container.interaction={touches.add(it)}
   val down=android.view.MotionEvent.obtain(0,0,android.view.MotionEvent.ACTION_DOWN,1f,1f,0)
   assertFalse(container.dispatchTouchEvent(down));down.recycle()
   assertEquals(listOf(true,false),touches)
   assertFalse(container.place(RectF(20f,-100f,180f,-20f),RectF(0f,0f,300f,500f)))
   assertEquals(View.INVISIBLE,container.visibility)
  }} finally {main{activity.finish()}}
 }
 @Test fun compositedPixelsArePreparedThenCoveredAndRestoredWithoutRecapture() {
  val activity=activity();lateinit var snapshots:NativeUISnapshots;lateinit var native:View
  try {
   main {
    native=View(activity);native.setBackgroundColor(Color.RED)
    activity.root.addView(native,FrameLayout.LayoutParams(160,64).apply {leftMargin=20;topMargin=120})
    snapshots=NativeUISnapshots(File(activity.cacheDir,"engine-${System.nanoTime()}"))
   }
   instrumentation.waitForIdleSync();Thread.sleep(100)
   val ready=CountDownLatch(1);var result=JSONObject()
   main{snapshots.prepare(activity.window,activity.web,activity.web.width.toDouble(),{mapOf("button" to RectF(20f,120f,180f,184f))}){result=it;ready.countDown()}}
   assertTrue(ready.await(10,TimeUnit.SECONDS));assertTrue(result.has("token"))
   val token=result.getString("token");val part=result.getJSONArray("parts").getJSONObject(0)
   val file=File(java.net.URI(part.getString("url")));assertTrue(file.exists())
   val image=BitmapFactory.decodeFile(file.path);assertEquals(Color.RED,image.getPixel(14,14));image.recycle()
   val foregroundReady=CountDownLatch(1);var foreground=""
   main{snapshots.prepare(activity.window,activity.web,activity.web.width.toDouble(),{mapOf("button" to RectF(20f,120f,180f,184f))}){foreground=it.optString("token");foregroundReady.countDown()}}
   assertTrue(foregroundReady.await(10,TimeUnit.SECONDS));assertTrue(foreground.isNotEmpty())
   main {
    assertFalse(snapshots.cover("missing",activity.window,activity.web,listOf(native)))
    assertEquals(View.VISIBLE,native.visibility)
    assertTrue(snapshots.cover(token,activity.window,activity.web,listOf(native)))
    assertTrue(snapshots.cover(foreground,activity.window,activity.web,listOf(native),transient=true))
    assertEquals(token,snapshots.coveringToken)
    snapshots.release(foreground)
    assertEquals(token,snapshots.coveringToken)
    assertTrue(snapshots.cover(token,activity.window,activity.web,listOf(native)))
    assertEquals(View.INVISIBLE,native.visibility)
    snapshots.retireCopy("stale");assertTrue(snapshots.hidesNativeViews)
    snapshots.retireCopy(token);snapshots.restoreViews();assertEquals(View.VISIBLE,native.visibility)
    assertFalse(snapshots.restore(token,activity.window,activity.web,mapOf("button" to RectF(20f,120f,190f,184f))))
    assertTrue(snapshots.restore(token,activity.window,activity.web,mapOf("button" to RectF(8f,108f,192f,196f))));snapshots.retireCopy(token,entry=false)
    snapshots.release(token);assertFalse(file.exists());assertFalse(snapshots.cover(token,activity.window,activity.web,listOf(native)))
    snapshots.interaction(true);snapshots.reset()
   }
   val recovered=CountDownLatch(1);var recoveredToken:String?=null
   main{snapshots.prepare(activity.window,activity.web,activity.web.width.toDouble(),{mapOf("button" to RectF(20f,120f,180f,184f))}){recoveredToken=it.optString("token").takeIf(String::isNotEmpty);recovered.countDown()}}
   assertTrue(recovered.await(5,TimeUnit.SECONDS));assertNotNull(recoveredToken)
   main{snapshots.close()}
  } finally {main{activity.finish()}}
 }
 @Test fun translucentContentKeepsCompositedPixelsAcrossWebHandoffAndReturn() {
  val activity=activity();lateinit var native:View;lateinit var snapshots:NativeUISnapshots
  fun script(code:String):String {
   val done=CountDownLatch(1);var value=""
   main{activity.web.evaluateJavascript(code){value=it;done.countDown()}}
   assertTrue(done.await(5,TimeUnit.SECONDS));return value
  }
  fun webReady() {
   val done=CountDownLatch(1);var accepted=false
   main{NativeUIWebReadiness.prepare(activity.web,{true}){accepted=it;done.countDown()}}
   assertTrue(done.await(5,TimeUnit.SECONDS));assertTrue(accepted)
  }
  try {
   script("document.body.style.background='repeating-linear-gradient(90deg, rgb(40,80,120) 0px 20px, rgb(180,160,60) 20px 40px)'")
   webReady()
   main {
    native=View(activity);native.setBackgroundColor(Color.argb(128,220,30,80))
    activity.root.addView(native,FrameLayout.LayoutParams(160,64).apply{leftMargin=20;topMargin=120})
    snapshots=NativeUISnapshots(File(activity.cacheDir,"translucent-${System.nanoTime()}"))
   }
   instrumentation.waitForIdleSync();Thread.sleep(100)
   val viewport=script("innerWidth").toDouble()
   val prepared=CountDownLatch(1);var response=JSONObject()
   main{snapshots.prepare(activity.window,activity.web,viewport,{mapOf("control" to RectF(20f,120f,180f,184f))}){response=it;prepared.countDown()}}
   assertTrue(prepared.await(5,TimeUnit.SECONDS));assertTrue(response.has("token"))
   val token=response.getString("token");val part=response.getJSONArray("parts").getJSONObject(0)
   val file=File(java.net.URI(part.getString("url")))
   val baseline=BitmapFactory.decodeFile(file.path)
   val data=android.util.Base64.encodeToString(file.readBytes(),android.util.Base64.NO_WRAP)
   script("""window.proxy=document.createElement('img');proxy.src='data:image/png;base64,$data';proxy.style.cssText='position:fixed;visibility:hidden;pointer-events:none;left:${part.getDouble("x")}px;top:${part.getDouble("y")}px;width:${part.getDouble("width")}px;height:${part.getDouble("height")}px';document.body.append(proxy);window.decoded=false;proxy.decode().then(()=>window.decoded=true)""")
   repeat(50){if(script("window.decoded")!="true") Thread.sleep(10)}
   assertEquals("true",script("window.decoded"));webReady()
   // Sample actual composited window frames throughout both transfers, not just endpoints.
   val samples=java.util.Collections.synchronizedList(mutableListOf<android.graphics.Bitmap>())
   val running=java.util.concurrent.atomic.AtomicBoolean(true)
   val handler=android.os.Handler(android.os.Looper.getMainLooper())
   val pending=java.util.concurrent.atomic.AtomicInteger()
   lateinit var capture:Runnable
   capture=Runnable {
    if(running.get()) {
     val origin=IntArray(2);activity.web.getLocationInWindow(origin)
     val rect=android.graphics.Rect(origin[0]+8,origin[1]+108,origin[0]+192,origin[1]+196)
     val pixels=android.graphics.Bitmap.createBitmap(184,88,android.graphics.Bitmap.Config.ARGB_8888)
     pending.incrementAndGet()
     android.view.PixelCopy.request(activity.window,rect,pixels,{result->
      if(result==android.view.PixelCopy.SUCCESS)samples.add(pixels) else pixels.recycle()
      pending.decrementAndGet()
      if(running.get())handler.postDelayed(capture,16)
     },handler)
    }
   }
   main{handler.post(capture)}
   repeat(3) {
    main{assertTrue(snapshots.cover(token,activity.window,activity.web,listOf(native)))}
    script("proxy.style.visibility='visible'");webReady()
    main{snapshots.retireCopy(token)}
    Thread.sleep(120)
    main{assertTrue(snapshots.restore(token,activity.window,activity.web,mapOf("control" to RectF(8f,108f,192f,196f))));snapshots.restoreViews()}
    script("proxy.style.visibility='hidden'");webReady()
    main{snapshots.retireCopy(token,entry=false);snapshots.finishCovering()}
    Thread.sleep(120)
   }
   running.set(false);main{handler.removeCallbacks(capture)}
   repeat(50){if(pending.get()>0)Thread.sleep(10)}
   assertEquals(0,pending.get());assertTrue("Expected continuous samples, got ${samples.size}",samples.size>=12)
   var maxDelta=0
   for(image in samples) {
    // Interior + surrounding background; skip only the outer PixelCopy crop edge.
    for(y in 2 until 86)for(x in 2 until 182) {
     val expected=baseline.getPixel(x,y);val actual=image.getPixel(x,y)
     for(shift in listOf(0,8,16))maxDelta=maxOf(maxDelta,kotlin.math.abs(((expected shr shift) and 255)-((actual shr shift) and 255)))
    }
    image.recycle()
   }
   android.util.Log.i("NativeUIEngineTest","Translucent handoff: ${samples.size} frames, max channel delta $maxDelta")
   baseline.recycle()
   assertTrue("Composited color changed: max channel delta $maxDelta",maxDelta<=2)
   main{snapshots.close()}
  } finally {main{activity.finish()}}
 }
 @Test fun webReadinessRejectsInvalidatedPreparation() {
  val activity=activity()
  try {
   val ready=CountDownLatch(1);var accepted=false
   main{NativeUIWebReadiness.prepare(activity.web,{true}){accepted=it;ready.countDown()}}
   assertTrue(ready.await(5,TimeUnit.SECONDS));assertTrue(accepted)
   val stale=CountDownLatch(1);var current=true;var staleAccepted=true
   main {
    NativeUIWebReadiness.prepare(activity.web,{current}){staleAccepted=it;stale.countDown()}
    current=false
   }
   assertTrue(stale.await(5,TimeUnit.SECONDS));assertFalse(staleAccepted)
  } finally {main{activity.finish()}}
 }
 @Test fun nativeInitializationOwnsImagesEventsAndTeardown() {
  val activity=activity(); lateinit var registration:NativeUIProjection; lateinit var native:View
  fun js(expression:String):String {
   val done=CountDownLatch(1);var result=""
   main{activity.web.evaluateJavascript(expression){result=it;done.countDown()}}
   assertTrue(done.await(3,TimeUnit.SECONDS)); return result
  }
  fun waitFor(expression:String) {
   val deadline=System.currentTimeMillis()+10000
   while(System.currentTimeMillis()<deadline) { if(js(expression)=="true") return; Thread.sleep(20) }
   fail("Timed out: $expression")
  }
  try {
   main {
    val density=activity.resources.displayMetrics.density
    native=View(activity);native.setBackgroundColor(Color.RED)
    activity.root.addView(native,FrameLayout.LayoutParams((100*density).toInt(),(40*density).toInt()).apply {leftMargin=(20*density).toInt();topMargin=(100*density).toInt()})
    activity.web.webViewClient=object:android.webkit.WebViewClient(){
     override fun shouldInterceptRequest(view:android.webkit.WebView,request:android.webkit.WebResourceRequest):android.webkit.WebResourceResponse? {
      val path=request.url.path ?: return null
      if(!path.startsWith("/_capacitor_file_"))return null
      val file=File(path.removePrefix("/_capacitor_file_"))
      if(!file.canonicalPath.startsWith(activity.cacheDir.canonicalPath+"/"))return null
      return runCatching {android.webkit.WebResourceResponse("image/png",null,file.inputStream())}.getOrNull()
     }
    }
    registration=NativeUIProjection(activity.window,activity.web,"Fixture","#slot",
     receiveListeners=NativeUIProjection.ReceiveListeners(
      update=listOf("updated"),
      projection=NativeUIProjection.ReceiveListeners.Projection(native=listOf("shown"),web=listOf("moving"),none=listOf("hidden"))),
     view={native})
    activity.web.loadDataWithBaseURL("https://localhost", """
     <meta name='viewport' content='width=device-width,initial-scale=1'><script>
     window.testEvents={};window.Capacitor={
      addListener:(plugin,name,fn)=>{testEvents[name]=fn;return{remove:async()=>{delete testEvents[name]}}},
      convertFileSrc:url=>'https://localhost/_capacitor_file_'+url.replace('file://','')
     };</script><body><div id='slot' style='position:absolute;left:20px;top:100px;width:100px;height:40px'>Fallback</div></body>
    """.trimIndent(),"text/html","utf-8",null)
   }
   waitFor("document.querySelector('#slot')?.hasAttribute('data-native-ui-snapshot')===true")
   repeat(2) { iteration ->
    waitFor("document.querySelector('#slot').hasAttribute('data-native-ui-snapshot')")
    js("testEvents.moving({})")
    waitFor("document.querySelector('#slot').hasAttribute('data-native-ui-snapshot-visible')")
    main{assertEquals(View.INVISIBLE,native.visibility)}
    js("document.querySelector('#slot').style.top='${120+iteration*20}px'")
    js("testEvents.shown({})")
    waitFor("!document.querySelector('#slot').hasAttribute('data-native-ui-snapshot-visible')")
    val cssWidth=js("innerWidth").toFloat()
    main{
     assertEquals(View.VISIBLE,native.visibility)
     assertEquals((20+iteration*20)*activity.web.width/cssWidth,native.translationY,0.01f)
    }
   }
   js("testEvents.hidden({})")
   waitFor("document.querySelector('#slot').getAttributeNames().some(n=>n.startsWith('data-native-ui-session-')&&document.querySelector('#slot').getAttribute(n)==='none')")
   main{assertEquals(View.INVISIBLE,native.visibility);registration.close()}
   waitFor("Object.keys(testEvents).length===0")
  } finally {main{activity.finish()}}
 }

}
