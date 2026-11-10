# Starts the TCG Boogie test phone (an Android emulator with the Play Store) in its own window.
# Made once with Google's command-line tools in Bubblewrap's Android folder; see README.md.
$sdk = "$env:USERPROFILE\.bubblewrap\android_sdk"
$env:ANDROID_SDK_ROOT = $sdk
$env:ANDROID_HOME = $sdk
& "$sdk\emulator\emulator.exe" -avd TCGBoogie_Test -camera-back emulated -netdelay none -netspeed full
