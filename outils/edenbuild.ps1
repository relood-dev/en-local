$vs = 'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ";$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;$vs\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja"
$env:VULKAN_SDK = [Environment]::GetEnvironmentVariable('VULKAN_SDK','Machine')
Set-Location C:\EnLocal
if (-not (Test-Path eden-src)) {
  git -c core.autocrlf=false clone --branch v0.2.1 --depth 1 --recurse-submodules --shallow-submodules https://git.eden-emu.dev/eden-emu/eden.git eden-src 2>&1 | Select-Object -Last 2
}
Set-Location C:\EnLocal\eden-src
python C:\EnLocal\eden-embed.py C:\EnLocal\eden-src
git -c user.name=relood -c user.email=relood@users.noreply.github.com commit -qam "En Local : --parent et --join" 2>$null
$vc = "$vs\VC\Auxiliary\Build\vcvars64.bat"
cmd /c "`"$vc`" >nul && cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DYUZU_TESTS=OFF -DENABLE_UPDATE_CHECKER=OFF -DUSE_DISCORD_PRESENCE=OFF > C:\EnLocal\eden-cmake.log 2>&1 && cmake --build build --target yuzu yuzu_room_standalone > C:\EnLocal\eden-build.log 2>&1"
"exit $LASTEXITCODE"
Get-Content C:\EnLocal\eden-cmake.log -Tail 4 -ErrorAction SilentlyContinue
Get-Content C:\EnLocal\eden-build.log -Tail 4 -ErrorAction SilentlyContinue
Select-String -Path C:\EnLocal\eden-build.log -Pattern "error C|FAILED" -ErrorAction SilentlyContinue | Select-Object -First 5 | ForEach-Object { $_.Line.Substring(0,[Math]::Min(300,$_.Line.Length)) }
