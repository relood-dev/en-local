#!/bin/sh
# Notre Cemu (Wii U) pour Mac Apple Silicon : source v2.6 + forks/cemu-skylanders.patch (portail Skylanders
# piloté par En Local, fichier ENLOCAL_SKYLANDERS). Dépendances par le vcpkg de Cemu (première fois : long).
# Il faut : brew install cmake ninja nasm automake libtool molten-vk
# Usage : sh cemu-build.sh <dossier de travail> <dossier emu>
set -eu
W="${1:?dossier de travail}"
EMU="${2:?dossier emu}"
F="$(cd "$(dirname "$0")/../../forks" && pwd)"
S="$W/cemu"
if [ ! -d "$S" ]; then
  git clone -q --depth 1 --branch v2.6 --recurse-submodules --shallow-submodules https://github.com/cemu-project/Cemu.git "$S"
fi
# vcpkg a besoin de tout son historique pour retrouver les versions des dépendances.
[ "$(git -C "$S/dependencies/vcpkg" rev-parse --is-shallow-repository)" = true ] && git -C "$S/dependencies/vcpkg" fetch -q --unshallow
git -C "$S" apply --check "$F/cemu-skylanders.patch" 2>/dev/null && git -C "$S" apply "$F/cemu-skylanders.patch"
[ -x "$S/dependencies/vcpkg/vcpkg" ] || sh "$S/dependencies/vcpkg/bootstrap-vcpkg.sh" -disableMetrics
# SDK de macOS donné explicitement : sans lui, vcpkg compile OpenSSL avec « -isysroot » vide (assert.h introuvable).
SDK="$(xcrun --show-sdk-path)"
export SDKROOT="$SDK"
mkdir -p "$S/build"
cd "$S/build"
VCPKG_ROOT="$S/dependencies/vcpkg" cmake .. -G Ninja -DCMAKE_BUILD_TYPE=release -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DMACOS_BUNDLE=ON -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_OSX_SYSROOT="$SDK"
cmake --build .
A="$S/bin/Cemu_release.app"
mv "$A/Contents/MacOS/Cemu_release" "$A/Contents/MacOS/Cemu"
sed -i '' 's/Cemu_release/Cemu/g' "$A/Contents/Info.plist"
codesign --force --deep -s - "$A"
# L'ancien Cemu est gardé à côté, au cas où.
[ -d "$EMU/cemu/Cemu.app" ] && rm -rf "$EMU/cemu/Cemu-officiel.app" && mv "$EMU/cemu/Cemu.app" "$EMU/cemu/Cemu-officiel.app"
ditto "$A" "$EMU/cemu/Cemu.app"
# Repère pour En Local : ce Cemu a le portail Skylanders piloté (section Figurines pendant les jeux Skylanders).
echo "cemu-skylanders.patch" > "$EMU/cemu/enlocal-skylanders.txt"
echo "Cemu installé dans $EMU/cemu (l'ancien : Cemu-officiel.app)"
