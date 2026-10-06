# Recompile Eden et l'installe quand il ne tourne pas.
$vs = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ";$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja"
Set-Location C:\EnLocal\eden-src
cmd /c "`"$vs\VC\Auxiliary\Build\vcvars64.bat`" >nul && cmake --build build22 --target yuzu 2>&1" | Select-Object -Last 2
if ($LASTEXITCODE) { "échec"; exit 1 }
while (Get-Process eden -ErrorAction SilentlyContinue) { Start-Sleep 2 }
Copy-Item C:\EnLocal\eden-src\build22\bin\eden.exe C:\EnLocal\emu\eden-enlocal\eden.exe -Force
"installé"
