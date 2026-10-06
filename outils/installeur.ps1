# Construit l'installeur d'En Local.
# 1. Copie les émulateurs sans aucune donnée de joueur (clés, firmware, sauvegardes, caches).
# 2. Vérifie que rien de tout ça n'est passé.
# 3. Compile l'installeur NSIS.
# Usage : powershell -File installeur.ps1 [-Publier]
param([switch]$Publier)
$ErrorActionPreference = 'Stop'
# CMake de Visual Studio, nécessaire pour compiler SDL3.
$env:Path = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;' + [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$src = 'C:\EnLocal\emu'
$dist = 'C:\EnLocal\dist\emu'
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }

# Dossiers de données à ne jamais livrer.
$emus = [ordered]@{
  'azahar-enlocal'  = @('user')
  'dolphin-enlocal' = @('User', 'Tests')
  'eden-enlocal'    = @('user')
  'cemu'            = @('portable')
  'melondsds'       = @()
  'ffmpeg'          = @()   # clips vidéo (build LGPL de BtbN, avec sa licence)
  'nsz'             = @()   # jeux Switch .nsz/.xcz décompressés pour Eden (MIT, version portable 4.6.1)
  'pokedex'         = @()   # Pokédex : lit les sauvegardes Pokémon (PKHeX.Core, GPL ; sources dans outils\pokedex)
}
foreach ($e in $emus.Keys) {
  $exclus = @($emus[$e]) | ForEach-Object { Join-Path "$src\$e" $_ }
  $args = @("$src\$e", "$dist\$e", '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XF', '*.log', '*.pdb')
  if ($exclus.Count) { $args += '/XD'; $args += $exclus }
  robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copie de $e impossible ($LASTEXITCODE)" }
}

# Rien de personnel ni de Nintendo : ni clés, ni firmware, ni jeux, ni sauvegardes.
$interdits = '*.keys', 'keys.txt', 'otp.bin', 'seeprom.bin', '*.nca', '*.nsp', '*.nsz', '*.xci', '*.3ds', '*.cci', '*.cia', '*.nds', '*.iso', '*.rvz', '*.wbfs', '*.gcm', '*.wua', '*.wud', '*.wux', '*.rpx', '*.sav', '*.gci', '*.raw'
$trouves = Get-ChildItem -Recurse -File $dist -Include $interdits
$dossiers = Get-ChildItem -Recurse -Directory $dist | Where-Object { $_.Name -in 'nand', 'mlc01', 'sysdata', 'sdmc', 'keys', 'saves' -and (Get-ChildItem -Recurse -File $_.FullName | Measure-Object).Count }
if ($trouves -or $dossiers) {
  ($trouves + $dossiers) | ForEach-Object { "INTERDIT : $($_.FullName)" }
  throw 'Des fichiers personnels sont dans la copie : installeur annulé.'
}
'{0:N0} Mo d''émulateurs, aucune donnée personnelle.' -f ((Get-ChildItem -Recurse -File $dist | Measure-Object Length -Sum).Sum / 1MB)

# Tauri écrit ses informations sur la sortie d'erreur.
$ErrorActionPreference = 'Continue'
Set-Location C:\EnLocal\proto
Get-ChildItem -Recurse -Force -Filter '._*' | Remove-Item -Force
# Le cache de Tauri garde le chemin réel : si le dossier a bougé, on le refait.
Get-ChildItem 'C:\EnLocal\installeur\release\build' -Directory -Filter 'tauri-*' -ErrorAction SilentlyContinue | Where-Object { Select-String -Quiet -ErrorAction SilentlyContinue -Path "$($_.FullName)\output" -Pattern ([regex]::Escape((Get-Item -Force C:\EnLocal).Target)) -NotMatch } | ForEach-Object { Remove-Item -Recurse -Force $_.FullName }
Get-ChildItem 'C:\EnLocal\installeur\release\build' -Directory -Filter 'en-local-proto-*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
$env:CARGO_TARGET_DIR = 'C:\EnLocal\installeur'
# Clé de signature des mises à jour, jamais copiée ailleurs.
$env:TAURI_SIGNING_PRIVATE_KEY = [IO.File]::ReadAllText('C:\EnLocal\cles\en-local-maj.key')
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
npx tauri build --config src-tauri\installeur.json 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -match 'error|Finished|Built application|nsis|\.exe' } | Select-Object -First 40
Get-ChildItem C:\EnLocal\installeur\release\bundle\nsis\*.exe | ForEach-Object { '{0} : {1:N0} Mo' -f $_.Name, ($_.Length / 1MB) }

# -Publier : envoie l'installeur et sa signature sur le serveur de fichiers.
if ($Publier) {
  # Seulement l'installeur qu'on vient de compiler.
  $v = (Get-Content -Raw C:\EnLocal\proto\src-tauri\installeur.json | ConvertFrom-Json).version
  $exe = Get-Item "C:\EnLocal\installeur\release\bundle\nsis\En Local_${v}_x64-setup.exe" -ErrorAction SilentlyContinue
  if (-not $exe -or -not (Test-Path "$($exe.FullName).sig") -or $exe.LastWriteTime -lt (Get-Date).AddMinutes(-30)) { "Pas d'installeur $v tout juste compilé : rien publié."; exit 1 }
  # Garde d'abord la version précédente dans sauvegardes\<version>.
  $num = { param($n) [version]([regex]::Match($n, '\d+\.\d+\.\d+').Value) }
  $avant = Get-ChildItem 'C:\EnLocal\installeur\release\bundle\nsis\En Local_*_x64-setup.exe' | Where-Object { (& $num $_.Name) -lt [version]$v } | Sort-Object { & $num $_.Name } | Select-Object -Last 1
  if ($avant) {
    $va = (& $num $avant.Name).ToString()
    $dest = "C:\EnLocal\sauvegardes\$va"
    New-Item -ItemType Directory -Force $dest | Out-Null
    Copy-Item $avant.FullName, "$($avant.FullName).sig" $dest -Force -ErrorAction SilentlyContinue
    "Sauvegarde de la version d'avant : sauvegardes\$va"
  }
  # Destination de l'envoi (« utilisateur@machine:dossier »), gardée hors du dépôt.
  $vers = (Get-Content C:\EnLocal\cles\publier.txt -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $vers) { "Pas de destination dans cles\publier.txt : rien publié."; exit 1 }
  $nom = "En-Local_${v}_setup.exe"
  scp -o BatchMode=yes $exe.FullName "$vers/$nom"
  scp -o BatchMode=yes "$($exe.FullName).sig" "$vers/$nom.sig"
  "Publié : $nom (+ .sig)"
}
