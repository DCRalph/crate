Pod::Spec.new do |s|
  s.name           = 'Car'
  s.version        = '1.0.0'
  s.summary        = 'Crate in CarPlay: the library as lists, and the system Now Playing screen.'
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
