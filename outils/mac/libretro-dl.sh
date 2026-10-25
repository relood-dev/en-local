#!/bin/sh
# Cœurs libretro pour Mac Apple Silicon, chargés dans En Local : DS (melonDS DS), NES, Super Nintendo,
# Game Boy (et Color), GBA et PS1. Builds officielles (libretro, JesseTG). Usage : sh libretro-dl.sh <dossier emu>
set -eu
EMU="${1:?dossier emu}"
D="$EMU/libretro"
T="$(mktemp -d)"
mkdir -p "$D"
for c in mesen snes9x gambatte mgba pcsx_rearmed; do
  [ -f "$D/${c}_libretro.dylib" ] && continue
  curl -fsSL "https://buildbot.libretro.com/nightly/apple/osx/arm64/latest/${c}_libretro.dylib.zip" -o "$T/$c.zip"
  unzip -qo "$T/$c.zip" -d "$D"
done
if [ ! -f "$D/melondsds_libretro.dylib" ]; then
  curl -fsSL "https://github.com/JesseTG/melonds-ds/releases/download/v1.4.0/melondsds_libretro-macos-arm64-Release.zip" -o "$T/melonds.zip"
  unzip -qo "$T/melonds.zip" -d "$T/melonds"
  find "$T/melonds" -name 'melondsds_libretro.dylib' -exec cp {} "$D/" \;
fi
rm -rf "$T"
ls -la "$D"
