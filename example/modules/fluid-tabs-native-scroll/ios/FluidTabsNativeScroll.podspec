Pod::Spec.new do |s|
  s.name = 'FluidTabsNativeScroll'
  s.version = '1.0.0'
  s.summary = 'Native header scrolling for react-native-collapsible-fluid-tabs (iOS example)'
  s.description = 'Hosts the active UIScrollView pan on a shared ancestor while preserving UIKit scrolling.'
  s.author = 'rileysay'
  s.homepage = 'https://github.com/rileysay/react-native-collapsible-fluid-tabs'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'RNGestureHandler', '3.2.1'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20' }
  s.source_files = '**/*.{h,m,mm,swift}'
  s.public_header_files = 'FTNSScrollCoordinator.h'
end
