Pod::Spec.new do |s|
  s.name           = 'CarDisplay'
  s.version        = '1.0.0'
  s.summary        = 'Now playing, drawn on a car screen, with the track as a waveform.'
  s.author         = 'Crate'
  s.homepage       = 'https://github.com/DCRalph/crate'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CarPlay'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
