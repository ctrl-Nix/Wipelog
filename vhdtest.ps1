$vhd = "C:\dev\testdisk.vhd"
$py  = ".venv\Scripts\python.exe"

function Dp($lines) {
  $f = Join-Path $env:TEMP ("dp_" + [guid]::NewGuid().ToString("N") + ".txt")
  Set-Content -Path $f -Value $lines -Encoding ascii
  diskpart /s $f | Out-Null
  Remove-Item $f -ErrorAction SilentlyContinue
}
function Detach { Dp @("select vdisk file=`"$vhd`"", "detach vdisk"); Start-Sleep 3 }
function Attach {
  Dp @("select vdisk file=`"$vhd`"", "attach vdisk"); Start-Sleep 3
  if (-not (Test-Path V:\)) {
    Dp @("select vdisk file=`"$vhd`"", "select partition 1", "assign letter=V"); Start-Sleep 3
  }
  if (-not (Test-Path V:\)) { throw "V: not available" }
}
function Search($label) {
  Write-Host ("[$label] " + (& $py python\vhd_search.py $vhd hunter2)) -ForegroundColor Cyan
}

Attach
Copy-Item C:\Windows\Web\Wallpaper\Windows\*.jpg V:\ -ErrorAction SilentlyContinue
1..3000 | ForEach-Object { "PASSWORD=hunter2 user$_@example.com" } | Set-Content V:\secret.txt
Write-Host ("secret.txt size: " + (Get-Item V:\secret.txt).Length)

Detach; Search "CONTROL: file still present (expect many hits)"; Attach

Remove-Item V:\secret.txt
Detach; Search "BEFORE: file deleted normally (expect many hits)"; Attach

& $py python\volwipe.py V --allow-fixed --yes

Detach; Search "AFTER: wiped (expect 0 hits)"; Attach
