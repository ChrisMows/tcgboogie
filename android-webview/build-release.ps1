# Builds the signed file for Google Play. Asks for the upload key's password, which isn't saved or shown.
Set-Location $PSScriptRoot
$env:JAVA_HOME = "$env:USERPROFILE\.bubblewrap\jdk\jdk-17.0.11+9"
Remove-Item Env:NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue

$secure = Read-Host "Upload key password (nothing shows as you type, then press Enter)" -AsSecureString
$env:TCG_KEY_PASSWORD = [Net.NetworkCredential]::new("", $secure).Password
& .\gradlew.bat ":app:bundleRelease"
$built = $LASTEXITCODE
Remove-Item Env:TCG_KEY_PASSWORD

$file = "app\build\outputs\bundle\release\app-release.aab"
Write-Host ""
if ($built -ne 0) {
    Write-Host "The build failed. If it mentions the keystore or password, run this again and check the password." -ForegroundColor Red
    exit 1
}
$check = & "$env:JAVA_HOME\bin\jarsigner.exe" -verify $file
if (($check -join " ") -match "jar verified") {
    Write-Host "Signed and ready to upload:" -ForegroundColor Green
    Write-Host (Resolve-Path $file)
    & explorer.exe "/select,$(Resolve-Path $file)"
} else {
    Write-Host "The build finished, but the file isn't signed." -ForegroundColor Red
    exit 1
}
