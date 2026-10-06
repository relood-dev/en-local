# Recompile Eden et l'installe. Qt est lié en statique.
$vs = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
cmd /c "`"$vs`" >nul && cd /d C:\EnLocal\eden-src && cmake --build build --target yuzu 2>&1" | Select-Object -Last 3
if ($LASTEXITCODE) { exit 1 }
$dest = 'C:\EnLocal\emu\eden-enlocal'
New-Item -ItemType Directory -Force "$dest\user\keys", "$dest\user\nand\system\Contents\registered" | Out-Null
Copy-Item C:\EnLocal\eden-src\build\bin\eden.exe $dest -Force
Get-ChildItem $dest | Select-Object Name, Length
