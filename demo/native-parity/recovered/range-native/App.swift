import UIKit
@main class App: UIResponder, UIApplicationDelegate {
 func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
  let config=UISceneConfiguration(name:nil,sessionRole:connectingSceneSession.role);config.delegateClass=Scene.self;return config
 }
}
class Scene: UIResponder, UIWindowSceneDelegate {
 var window: UIWindow?
 func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
  guard let ws=scene as? UIWindowScene else { return }
  let w=UIWindow(windowScene:ws); let vc=UIViewController()
  vc.view.backgroundColor = .systemGroupedBackground
  for (i,color) in [UIColor.systemBlue, UIColor.systemGreen].enumerated() {
   let label=UILabel(frame:CGRect(x:80,y:100+i*180,width:700,height:40));label.text="iOS 27 UISlider — \(i == 0 ? "Blue" : "Green")";label.font = .systemFont(ofSize:22,weight:.semibold);vc.view.addSubview(label)
   let s=UISlider(frame:CGRect(x:80,y:160+i*180,width:600,height:44));s.value=0.5;s.tintColor=color;s.accessibilityIdentifier="slider-\(i)";vc.view.addSubview(s)
  }
  w.rootViewController=vc;w.makeKeyAndVisible();window=w
 }
}
