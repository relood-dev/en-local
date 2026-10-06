# Range C:\EnLocal après les essais, sans toucher aux jeux, aux sauvegardes ni aux sources.
$ErrorActionPreference = 'Continue'
$R = 'C:\EnLocal'
if (Get-Process en-local-proto, 'En Local', azahar, Dolphin, eden, Cemu -ErrorAction SilentlyContinue) { 'Un émulateur ou En Local tourne : rien n''est fait.'; exit 1 }

# 1. Restes du test d'installation.
$ti = "$R\test-installation"
if (Test-Path "$ti\data\captures") {
  Get-ChildItem "$ti\data\captures" -Recurse -File | ForEach-Object {
    $dest = Join-Path "$R\data\captures" ($_.FullName.Substring("$ti\data\captures\".Length))
    New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
    if (-not (Test-Path $dest)) { Move-Item $_.FullName $dest; "capture gardée : $dest" }
  }
}
if (Test-Path $ti) { Remove-Item -Recurse -Force $ti; 'supprimé : test-installation' }

# 2. Scripts de compilation dans outils\.
$outils = "$R\outils"
New-Item -ItemType Directory -Force $outils | Out-Null
$garder = 'azplusbuild.ps1', 'msvc-cheats.py', 'dolbuild.ps1', 'dolclone.ps1', 'dolphin-embed.py', 'edenbuild.ps1', 'edenbuild22.ps1', 'edeninc.ps1', 'edeninstall.ps1', 'eden-embed.py', 'cemu-dl.ps1', 'zlib.ps1', 'azdeps.ps1', 'clone-plus.ps1', 'install-azplus.ps1', 'azaharplus-embed.patch', 'azahar-embed.patch', 'sdl2guid.ps1'
foreach ($f in $garder) { if (Test-Path "$R\$f") { Move-Item -Force "$R\$f" "$outils\$f" } }
foreach ($f in Get-ChildItem $outils -Filter *.ps1) {
  $t = Get-Content -Raw $f.FullName
  $n = $t -replace 'C:\\EnLocal\\(msvc-cheats\.py|eden-embed\.py|azahar-embed\.patch|dolphin-embed\.py)', 'C:\EnLocal\outils\$1'
  if ($n -ne $t) { Set-Content -NoNewline -Encoding UTF8 $f.FullName $n }
}
'scripts de compilation -> outils\'

# 3. Journaux et scripts d'essai.
$jetables = '*.log', 'anim.ps1', 'app3ds.cmd', 'botw.ps1', 'cemu-embed-test.ps1', 'cemu-test.txt', 'cmp.ps1', 'dbg.*', 'go.ps1', 'inv*.ps1', 'inv*.txt', 'jt.*', 'kids.ps1', 'lien.ps1', 'log-*.txt', 'mv.*', 'p.ps1', 'pfs0.ps1', 'range.ps1', 'rl.ps1', 'room.*', 'shot.png', 'shot.ps1', 't.ps1', 't.txt', 't2.ps1', 'wins.*', 'wt.ps1', 'azahar-embed.git.patch', 'rect.ps1'
$n = 0
foreach ($m in $jetables) { Get-ChildItem $R -File -Filter $m | ForEach-Object { Remove-Item -Force $_.FullName; $n++ } }
"$n fichiers d'essai supprimés à la racine"
Remove-Item -Force "$R\data\rect.txt", "$R\data\app-err.txt", "$R\data\app-out.txt" -ErrorAction SilentlyContinue
if (Test-Path "$R\data\eden-contenu") { cmd /c rmdir /s /q "$R\data\eden-contenu"; 'supprimé : data\eden-contenu (liens)' }

# 4. Tâches planifiées d'essai.
Get-ScheduledTask -TaskName 'EnLocal-*' -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -ne 'EnLocal-app' } | ForEach-Object { Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false; "tâche retirée : $($_.TaskName)" }

# 5. Fichiers temporaires.
Get-ChildItem $env:TEMP -Force | Where-Object { $_.Name -like 'enlocal-*' } | ForEach-Object { Remove-Item -Recurse -Force $_.FullName }
'temporaires enlocal-* supprimés'

"--- C:\EnLocal maintenant"
Get-ChildItem $R -Force | ForEach-Object { $_.Name + $(if ($_.PSIsContainer) { '\' } else { '' }) }
