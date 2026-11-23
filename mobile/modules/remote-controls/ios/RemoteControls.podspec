Pod::Spec.new do |s|
  s.name           = 'RemoteControls'
  s.version        = '1.0.0'
  s.summary        = 'Next and Previous from the lock screen, headphones and a car.'
  s.author         = 'Crate'
  s.homepage       = 'https://github.com/DCRalph/crate'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MediaPlayer'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
