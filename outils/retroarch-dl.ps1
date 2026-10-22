# RetroArch (anciennes Nintendo, PS1, PS2) : build officielle de libretro, sans menus graphiques ni jeux, et ses cœurs.
$ProgressPreference = 'SilentlyContinue'
$d = 'C:\EnLocal\emu\retroarch'
$tmp = 'C:\EnLocal\retroarch-dl'
$7z = 'C:\EnLocal\emu\7zip\7z.exe'
New-Item -ItemType Directory -Force $tmp | Out-Null
if (-not (Test-Path "$d\retroarch.exe")) {
  Invoke-WebRequest 'https://buildbot.libretro.com/stable/1.22.2/windows/x86_64/RetroArch.7z' -OutFile "$tmp\ra.7z"
  & $7z x "$tmp\ra.7z" "-o$tmp\ra" -y | Out-Null
  $racine = (Get-ChildItem -Recurse -Filter retroarch.exe "$tmp\ra" | Select-Object -First 1).DirectoryName
  New-Item -ItemType Directory -Force $d | Out-Null
  # Pas de menus (assets), de shaders ni de surcouches : En Local fait l'interface.
  robocopy $racine $d /E /XD assets shaders overlays database cheats downloads thumbnails playlists /NFL /NDL /NJH /NJS /NP | Out-Null
}
New-Item -ItemType Directory -Force "$d\cores" | Out-Null
foreach ($c in 'mesen', 'snes9x', 'mupen64plus_next', 'gambatte', 'mgba', 'pcsx_rearmed', 'pcsx2') {
  if (-not (Test-Path "$d\cores\${c}_libretro.dll")) {
    Invoke-WebRequest "https://buildbot.libretro.com/nightly/windows/x86_64/latest/${c}_libretro.dll.zip" -OutFile "$tmp\$c.zip"
    Expand-Archive -Force "$tmp\$c.zip" "$d\cores"
  }
}
Remove-Item -Recurse -Force $tmp
'{0:N0} Mo' -f ((Get-ChildItem -Recurse -File $d | Measure-Object Length -Sum).Sum / 1MB)
Get-ChildItem $d | Select-Object -ExpandProperty Name
Get-ChildItem "$d\cores" | ForEach-Object { $_.Name + ' ' + [math]::Round($_.Length / 1MB, 1) + ' Mo' }
