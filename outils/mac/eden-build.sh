#!/bin/sh
# Notre Eden (Switch) pour Mac Apple Silicon : source v0.2.1, patchs d'En Local (forks/), Qt, FFmpeg, SDL2 et
# MoltenVK embarqués par Eden. Il faut glslang (brew install glslang). Le Qt 6.7.3 embarqué réclame AGL, retiré
# du SDK de macOS 27 : OpenGL à la place (WrapOpenGL_AGL).
# Usage : sh eden-build.sh <dossier de travail> <dossier emu>
set -eu
W="${1:?dossier de travail}"
EMU="${2:?dossier emu}"
F="$(cd "$(dirname "$0")/../../forks" && pwd)"
S="$W/eden"
if [ ! -d "$S" ]; then
  git clone -q --branch v0.2.1 --depth 1 --recurse-submodules --shallow-submodules https://git.eden-emu.dev/eden-emu/eden.git "$S"
  # Tous nos changements d'un bloc (eden-embed.py, les patchs eden-*.patch du PC remis dans l'ordre, la
  # partie Mac) : rejoués un par un, ces patchs entrent en conflit (faits sur des états successifs).
  git -C "$S" apply "$F/eden-mac-complet.patch"
fi
cmake -S "$S" -B "$S/build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DYUZU_TESTS=OFF -DENABLE_UPDATE_CHECKER=OFF \
  -DUSE_DISCORD_PRESENCE=OFF -DYUZU_USE_BUNDLED_QT=ON -DYUZU_USE_BUNDLED_FFMPEG=ON -DYUZU_USE_BUNDLED_SDL2=ON \
  -DYUZU_USE_BUNDLED_MOLTENVK=ON -DYUZU_USE_BUNDLED_OPENSSL=ON \
  -DWrapOpenGL_AGL="$(xcrun --show-sdk-path)/System/Library/Frameworks/OpenGL.framework"
ninja -C "$S/build" yuzu
A="$(find "$S/build/bin" -maxdepth 1 -name "*.app" | head -1)"
codesign --force --deep -s - "$A"
mkdir -p "$EMU/eden-enlocal"
rm -rf "$EMU/eden-enlocal/eden.app"
ditto "$A" "$EMU/eden-enlocal/eden.app"
echo "Eden installé dans $EMU/eden-enlocal"
