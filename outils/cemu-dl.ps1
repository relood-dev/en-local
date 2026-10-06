$ProgressPreference = 'SilentlyContinue'
$d = 'C:\EnLocal\emu\cemu'
if (-not (Test-Path "$d\Cemu.exe")) {
  Invoke-WebRequest 'https://github.com/cemu-project/Cemu/releases/download/v2.6/cemu-2.6-windows-x64.zip' -OutFile C:\EnLocal\cemu.zip
  Expand-Archive C:\EnLocal\cemu.zip C:\EnLocal\cemu-x -Force
  Remove-Item C:\EnLocal\cemu.zip
  $exe = Get-ChildItem C:\EnLocal\cemu-x -Recurse -Filter Cemu.exe | Select-Object -First 1
  if (Test-Path $d) { Remove-Item $d -Recurse -Force }
  Move-Item $exe.DirectoryName $d
  Remove-Item C:\EnLocal\cemu-x -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force "$d\portable" | Out-Null
Get-ChildItem $d | Select-Object -ExpandProperty Name
