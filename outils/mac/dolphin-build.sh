#!/bin/sh
# Notre Dolphin (GameCube / Wii) pour Mac Apple Silicon : source 2609, patchs d'En Local (forks/), Qt 6.9.3.
# Sans Xcode : MoltenVK de Homebrew (brew install molten-vk), pas de FFmpeg (enregistrement d'images inutile).
# Usage : sh dolphin-build.sh <dossier de travail> <dossier Qt 6.9.3 macos> <dossier emu>
set -eu
W="${1:?dossier de travail}"
Q="${2:?Qt 6.9.3 macos}"
EMU="${3:?dossier emu}"
F="$(cd "$(dirname "$0")/../../forks" && pwd)"
S="$W/dolphin"
if [ ! -d "$S" ]; then
  git clone -q --depth 1 --branch 2609 https://github.com/dolphin-emu/dolphin.git "$S"
  git -C "$S" submodule update --init --recursive --depth 1 --jobs 8
  python3 "$F/dolphin-embed.py" "$S"
  # Ce patch a été écrit en UTF-16 par PowerShell.
  iconv -f UTF-16 -t CP850 "$F/dolphin-skylanders.patch" | sed 's/\r$//' | git -C "$S" apply
  git -C "$S" apply "$F/dolphin-mac-cadre.patch"
fi
mkdir -p "$S/build"
cd "$S/build"
cmake .. -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$Q" -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DUSE_SYSTEM_LIBS=OFF -DMACOS_CODE_SIGNING=OFF -DENABLE_TESTS=OFF -DENABLE_AUTOUPDATE=OFF -DENABLE_ANALYTICS=OFF \
  -DENCODE_FRAMEDUMPS=OFF -DHAVE_PIPE2=OFF \
  -DUSE_BUNDLED_MOLTENVK=OFF -DMOLTENVK_DYLIB="$(brew --prefix molten-vk)/lib/libMoltenVK.dylib"
ninja
A=Binaries/Dolphin.app
PATH="$Q/bin:$PATH" "$Q/bin/macdeployqt" "$A"
printf '[Paths]\nPlugins = PlugIns\n' > "$A/Contents/Resources/qt.conf"
codesign --force --deep -s - "$A"
mkdir -p "$EMU/dolphin-enlocal"
rm -rf "$EMU/dolphin-enlocal/Dolphin.app"
ditto "$A" "$EMU/dolphin-enlocal/Dolphin.app"
echo "Dolphin installé dans $EMU/dolphin-enlocal"
