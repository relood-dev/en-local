$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
Set-Location C:\EnLocal
if (-not (Test-Path dolphin-src)) {
  git -c core.autocrlf=false clone --branch 2609 --depth 1 --recurse-submodules --shallow-submodules https://github.com/dolphin-emu/dolphin.git dolphin-src 2>&1 | Select-Object -Last 2
}
"clone: " + (Test-Path C:\EnLocal\dolphin-src\Source\Core\DolphinQt\Main.cpp)
winget search --id Microsoft.VisualStudio --source winget 2>&1 | Select-String "BuildTools"
