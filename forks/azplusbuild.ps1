$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin'
$env:VULKAN_SDK = [Environment]::GetEnvironmentVariable('VULKAN_SDK','Machine')
Set-Location C:\EnLocal\azaharplus-src
(Get-Content src\CMakeLists.txt) -notmatch "^\s*/we\d+" | Set-Content src\CMakeLists.txt
python C:\EnLocal\msvc-cheats.py src\core\cheats\gateway_cheat.cpp
$vc = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat'
cmd /c "`"$vc`" >nul && cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DENABLE_QT_TRANSLATION=OFF -DENABLE_TESTS=OFF -DCITRA_WARNINGS_AS_ERRORS=OFF -DZLIB_INCLUDE_DIR=C:/EnLocal/zlib/include -DZLIB_LIBRARY=C:/EnLocal/zlib/lib/zlibstatic.lib > C:\EnLocal\azplus-cmake.log 2>&1 && ninja -C build > C:\EnLocal\azplus-ninja.log 2>&1 && ninja -C build bundle >> C:\EnLocal\azplus-ninja.log 2>&1"
"exit $LASTEXITCODE"
Get-Content C:\EnLocal\azplus-ninja.log -Tail 5 -ErrorAction SilentlyContinue
Get-Content C:\EnLocal\azplus-cmake.log -Tail 5 -ErrorAction SilentlyContinue
