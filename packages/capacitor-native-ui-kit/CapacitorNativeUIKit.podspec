require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
Pod::Spec.new do |s|
 s.name = 'CapacitorNativeUIKit'
 s.version = package['version']
 s.summary = 'Native UI infrastructure for Capacitor plugin maintainers.'
 s.homepage = 'https://github.com/rdlabo-dev/ionic-theme-ios27'
 s.license = { :type => 'Zlib', :file => 'LICENSE' }
 s.preserve_paths = 'LICENSE', 'NOTICE'
 s.author = { 'rdlabo' => 'sakakibara@rdlabo.jp' }
 s.source = { :git => 'https://github.com/rdlabo-dev/ionic-theme-ios27.git', :tag => "ios27-v#{s.version}" }
 s.source_files = 'ios/Sources/CapacitorNativeUIKit/**/*.swift'
 s.ios.deployment_target = '15.0'
 s.swift_version = '5.9'
 s.frameworks = 'UIKit', 'WebKit'
end
