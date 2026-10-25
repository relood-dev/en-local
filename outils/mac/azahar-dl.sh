#!/bin/sh
# Azahar (3DS) pour Mac Apple Silicon : build officielle. Rangée dans azahar-enlocal, à côté du dossier
# « user » d'En Local (clés, boot9.bin, sauvegardes). Usage : sh azahar-dl.sh <dossier emu>
set -eu
EMU="${1:?dossier emu}"
D="$EMU/azahar-enlocal"
T="$(mktemp -d)"
if [ ! -d "$D/Azahar.app" ]; then
  curl -fsSL "https://github.com/azahar-emu/azahar/releases/download/2126.2/azahar-macos-arm64-2126.2.zip" -o "$T/a.zip"
  unzip -qo "$T/a.zip" -d "$T/a"
  app="$(find "$T/a" -maxdepth 4 -name 'Azahar.app' -type d | head -1)"
  mkdir -p "$D" && mv "$app" "$D/"
fi
mkdir -p "$D/user"
rm -rf "$T"
ls "$D" "$D/Azahar.app/Contents/MacOS"
