# RPCS3 (PS3), build officielle Windows, sans firmware ni jeux.
$ProgressPreference = 'SilentlyContinue'
$d = 'C:\EnLocal\emu\rpcs3'
$url = 'https://github.com/RPCS3/rpcs3-binaries-win/releases/download/build-e53ac18f8ddd4cfd0e92a57d15740d4170c1e744/rpcs3-v0.0.43-20372-e53ac18f_win64_msvc.7z'
if (-not (Test-Path "$d\rpcs3.exe")) {
  Invoke-WebRequest $url -OutFile C:\EnLocal\rpcs3.7z
  Invoke-WebRequest "$url.sha256" -OutFile C:\EnLocal\rpcs3.sha256
  $attendu = ((Get-Content C:\EnLocal\rpcs3.sha256 -Raw).Trim() -split '\s+')[0]
  $vrai = (Get-FileHash C:\EnLocal\rpcs3.7z -Algorithm SHA256).Hash
  if ($attendu -ne $vrai) { throw "SHA-256 différent : $attendu / $vrai" }
  & C:\EnLocal\emu\7zip\7z.exe x C:\EnLocal\rpcs3.7z "-o$d" -y | Out-Null
  Remove-Item C:\EnLocal\rpcs3.7z, C:\EnLocal\rpcs3.sha256
}
Get-ChildItem $d | Select-Object -ExpandProperty Name
