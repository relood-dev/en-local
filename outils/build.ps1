$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin'
Set-Location C:\EnLocal\proto
Get-ChildItem -Recurse -Force -Filter '._*' | Remove-Item -Force
if (-not (Test-Path node_modules)) { npm install --silent --no-audit --no-fund 2>&1 | Select-Object -Last 3 }
npx tauri build --no-bundle 2>&1 | Where-Object { $_ -match 'error|warning: unused|Finished|Built application|-->' } | Select-Object -First 60
