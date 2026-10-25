#!/bin/sh
# RPCS3 (PS3) pour Mac Apple Silicon : build officielle, empreinte vérifiée, en mode portable
# (dossier « portable » à côté de RPCS3.app : config et firmware restent avec En Local). Usage : sh rpcs3-dl.sh <dossier emu>
set -eu
EMU="${1:?dossier emu}"
D="$EMU/rpcs3"
URL="https://github.com/RPCS3/rpcs3-binaries-mac-arm64/releases/download/build-e53ac18f8ddd4cfd0e92a57d15740d4170c1e744/rpcs3-v0.0.43-20372-e53ac18f_macos_aarch64.7z"
T="$(mktemp -d)"
if [ ! -x "$D/RPCS3.app/Contents/MacOS/rpcs3" ]; then
  curl -fsSL "$URL" -o "$T/rpcs3.7z"
  if curl -fsSL "$URL.sha256" -o "$T/rpcs3.sha256" 2>/dev/null; then
    attendu="$(cut -d' ' -f1 < "$T/rpcs3.sha256" | tr 'A-F' 'a-f')"
    vrai="$(shasum -a 256 "$T/rpcs3.7z" | cut -d' ' -f1)"
    [ "$attendu" = "$vrai" ] || { echo "SHA-256 différent : $attendu / $vrai"; exit 1; }
  fi
  mkdir -p "$D"
  (cd "$T" && tar -xf rpcs3.7z 2>/dev/null || bsdtar -xf rpcs3.7z)
  app="$(find "$T" -maxdepth 3 -name 'RPCS3.app' -type d | head -1)"
  rm -rf "$D/RPCS3.app" && mv "$app" "$D/"
fi
mkdir -p "$D/portable"
rm -rf "$T"
ls "$D"
