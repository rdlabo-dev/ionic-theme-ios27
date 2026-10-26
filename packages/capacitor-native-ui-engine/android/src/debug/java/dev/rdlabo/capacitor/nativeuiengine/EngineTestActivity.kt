package dev.rdlabo.capacitor.nativeuiengine
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView
import android.widget.FrameLayout
class EngineTestActivity : Activity() {
 lateinit var root: FrameLayout
 lateinit var web: WebView
 override fun onCreate(state: Bundle?) {
  super.onCreate(state)
  root=FrameLayout(this);root.setBackgroundColor(Color.WHITE)
  web=WebView(this);web.settings.javaScriptEnabled=true
  root.addView(web,FrameLayout.LayoutParams(-1,-1));setContentView(root)
  web.loadDataWithBaseURL("https://localhost", "<body style='margin:0'><div style='height:1800px'>Web content</div></body>","text/html","utf-8",null)
 }
 override fun onDestroy() { root.removeView(web);web.destroy();super.onDestroy() }
}
