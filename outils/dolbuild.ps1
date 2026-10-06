$vs = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ";$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja"
Set-Location C:\EnLocal\dolphin-src
# Compilation incrémentale
$vc = "$vs\VC\Auxiliary\Build\vcvars64.bat"
cmd /c "`"$vc`" >nul && cmake --preset ninja-release-x64 > C:\EnLocal\dol-cmake.log 2>&1 && cmake --build --preset ninja-build-release-x64 --target dolphin-emu > C:\EnLocal\dol-build.log 2>&1"
"exit $LASTEXITCODE"
Get-Content C:\EnLocal\dol-build.log -Tail 4 -ErrorAction SilentlyContinue
Select-String -Path C:\EnLocal\dol-build.log -Pattern "error C|FAILED" | Select-Object -First 5 | ForEach-Object { $_.Line.Substring(0,[Math]::Min(300,$_.Line.Length)) }
