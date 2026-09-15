import UIKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Probe", sessionRole: session.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        window = UIWindow(windowScene: scene)
        window?.rootViewController = ProbeController()
        window?.makeKeyAndVisible()
    }
}
final class ProbeController: UIViewController {
 var buttons: [UIButton] = []
 var rows: [[String: Any]] = []
 var start = CACurrentMediaTime()
 var display: CADisplayLink!
 override func viewDidLoad() {
  super.viewDidLoad()
  view.backgroundColor = UIColor(red:0.91,green:0.93,blue:0.96,alpha:1)
  for (i,title) in ["Glass", "Prominent"].enumerated() {
   var c: UIButton.Configuration = i == 0 ? .glass() : .prominentGlass()
   c.title = title
   c.cornerStyle = .capsule
   let b=UIButton(configuration:c)
   b.frame=CGRect(x:130,y:220+i*150,width:140,height:44)
   b.accessibilityIdentifier=title
   b.addTarget(self, action:#selector(down(_:)), for:.touchDown)
   b.addTarget(self, action:#selector(up(_:)), for:[.touchUpInside,.touchUpOutside,.touchCancel])
   view.addSubview(b);buttons.append(b)
  }
  display=CADisplayLink(target:self,selector:#selector(tick))
  display.add(to:.main,forMode:.common)
 }
 @objc func down(_ b:UIButton) { rows.append(["event":"down","button":b.accessibilityIdentifier!,"t":CACurrentMediaTime()-start]) }
 @objc func up(_ b:UIButton) {
  rows.append(["event":"up","button":b.accessibilityIdentifier!,"t":CACurrentMediaTime()-start])
  DispatchQueue.main.asyncAfter(deadline:.now()+0.8) { self.save() }
 }
 @objc func tick() {
  var layers:[[String:Any]]=[]
  func visit(_ layer:CALayer,_ path:String) {
   let p=layer.presentation() ?? layer
   let t=p.transform
   layers.append(["path":path,"sx":sqrt(t.m11*t.m11+t.m12*t.m12),"sy":sqrt(t.m21*t.m21+t.m22*t.m22),"w":p.bounds.width,"h":p.bounds.height,"animations":layer.animationKeys() ?? []])
   for (i,l) in (layer.sublayers ?? []).enumerated(){visit(l,path+"/\(i):\(type(of:l))")}
  }
  for b in buttons {visit(b.layer,b.accessibilityIdentifier!)}
  rows.append(["t":CACurrentMediaTime()-start,"layers":layers])
 }
 func save() {
  let url=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("native.json")
  if let data=try? JSONSerialization.data(withJSONObject:rows) {try? data.write(to:url)}
 }
}
