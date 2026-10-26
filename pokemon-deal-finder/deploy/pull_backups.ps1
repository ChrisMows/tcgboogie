# Copy the website database's backups from the bot server to this PC (a second copy off the server).
# Run by the Windows scheduled task "TCG Boogie backup copy" (daily and at logon); safe to run by hand:
#   powershell -ExecutionPolicy Bypass -File pull_backups.ps1
#
# Copies only backups this PC doesn't have yet, checks each one's size, and never deletes anything here
# (the server keeps 30 nightly + 12 monthly; this folder keeps every copy). Results go to pull_backups.log.
$ErrorActionPreference = "Stop"
$Dest = "D:\TCG Boogie backups"
$Key = "$env:USERPROFILE\.ssh\tcgboogie_vps"
$Server = "root@2.24.77.223"
$Log = Join-Path $Dest "pull_backups.log"
New-Item -ItemType Directory -Force $Dest | Out-Null
function Say($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm') $msg" | Add-Content $Log }

try {
  # name and size of every backup on the server
  $list = & ssh -i $Key -o BatchMode=yes -o ConnectTimeout=20 $Server "cd /var/backups/tcgboogie && stat -c '%n %s' *.dump"
  if ($LASTEXITCODE -ne 0) { throw "couldn't list the server's backups" }
  $copied = 0
  foreach ($line in $list) {
    $name, $size = $line -split " "
    $local = Join-Path $Dest $name
    if ((Test-Path $local) -and (Get-Item $local).Length -eq [long]$size) { continue }
    & scp -q -i $Key -o BatchMode=yes "${Server}:/var/backups/tcgboogie/$name" "$local.part"
    if ($LASTEXITCODE -ne 0 -or (Get-Item "$local.part").Length -ne [long]$size) { throw "copy of $name failed or is incomplete" }
    Move-Item -Force "$local.part" $local
    $copied++
  }
  Say "OK: $copied new, $(@(Get-ChildItem $Dest -Filter *.dump).Count) backups on this PC"
} catch {
  Say "FAILED: $_"
  exit 1
}
