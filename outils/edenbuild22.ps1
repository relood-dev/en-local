# Eden compilé avec MSVC de VS 2022 : la version de VS 2026 fait planter Smash Ultimate.
$vs = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ";$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja"
Set-Location C:\EnLocal\eden-src
$vc = "$vs\VC\Auxiliary\Build\vcvars64.bat"
cmd /c "`"$vc`" >nul && cmake -S . -B build22 -G Ninja -DCMAKE_BUILD_TYPE=Release -DYUZU_TESTS=OFF -DENABLE_UPDATE_CHECKER=OFF -DUSE_DISCORD_PRESENCE=OFF > C:\EnLocal\eden22-cmake.log 2>&1 && cmake --build build22 --target yuzu > C:\EnLocal\eden22-build.log 2>&1"
"exit $LASTEXITCODE"
Get-Content C:\EnLocal\eden22-build.log -Tail 3 -ErrorAction SilentlyContinue
