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
final class ProbeController: UIViewController, WKScriptMessageHandler {
 var web: WKWebView!
 override func viewDidLoad() {
  super.viewDidLoad()
  let config = WKWebViewConfiguration()
  config.userContentController.add(self, name: "metrics")
  web = WKWebView(frame: view.bounds, configuration: config)
  web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
  view.addSubview(web)
  let root = Bundle.main.url(forResource: "www", withExtension: nil)!
  web.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
 }
 func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
  if let json = message.body as? String {
   let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("metrics.json")
   try? json.write(to: file, atomically: true, encoding: .utf8)
  }
 }
}
