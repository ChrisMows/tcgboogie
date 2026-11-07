# Makes a new upload key for a Google Play "upload key reset", and the certificate file Play asks for.
# Keeps the old key file and never overwrites anything. The password you choose isn't saved or shown.
$keytool = "$env:USERPROFILE\.bubblewrap\jdk\jdk-17.0.11+9\bin\keytool.exe"
$key = "$env:USERPROFILE\.tcgboogie\android-upload-2.jks"
$cert = "$env:USERPROFILE\.tcgboogie\upload_certificate.pem"

if (Test-Path $key) {
    Write-Host "A new key already exists at $key, so nothing was changed." -ForegroundColor Yellow
    exit 1
}

Write-Host "Save the new password in your password manager BEFORE typing it here." -ForegroundColor Yellow
Write-Host "It asks twice. Nothing shows as you type, and it needs at least 6 characters."
Write-Host ""
& $keytool -genkeypair -storetype PKCS12 -alias upload -keyalg RSA -keysize 2048 -validity 10000 -keystore $key -dname "CN=TCG Boogie, O=TCG Boogie, C=US"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $key)) {
    Write-Host "The key wasn't created. Run this again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Now type the same password once more, to make the certificate file." -ForegroundColor Yellow
& $keytool -export -rfc -keystore $key -alias upload -file $cert
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $cert)) {
    Write-Host "The key was made, but the certificate wasn't. The password was probably mistyped: tell Claude." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done. Upload this file to Play Console:" -ForegroundColor Green
Write-Host $cert
& explorer.exe "/select,$cert"
