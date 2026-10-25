#!/bin/sh
# RetroArch pour En Local (macOS) : v1.22.2 + retroarch-mac-cadre.patch (fenêtre posée dans le cadre
# d'En Local, pause et volume par fichiers ; plus les correctifs de la compilation par make sur Mac).
# Sans Xcode : outils en ligne de commande, SDL2 (sdl2-compat) et SDL3 de Homebrew.
# sh retroarch-mac.sh <dossier des sources> <RetroArch.app officiel à compléter>
set -e
src=$1; app=$2/Contents
cd "$src"
git apply "$(dirname "$0")/retroarch-mac-cadre.patch"
# Seuls SDL2 et zlib visibles : ni freetype ni fontconfig de Homebrew (CoreText suffit).
PKG_CONFIG_LIBDIR="$(pkg-config --variable pcfiledir sdl2):$(pkg-config --variable pcfiledir zlib)" \
  ./configure --disable-qt --enable-sdl2 --disable-sdl --disable-ffmpeg --disable-discord --disable-builtinzlib --enable-metal --disable-freetype
make -j10
cp retroarch "$app/MacOS/RetroArch"
cp "$(brew --prefix sdl2-compat)/lib/libSDL2-2.0.0.dylib" "$app/Frameworks/"
cp "$(brew --prefix sdl3)/lib/libSDL3.0.dylib" "$app/Frameworks/libSDL3.dylib"
chmod u+w "$app"/Frameworks/libSDL*.dylib
install_name_tool -id @rpath/libSDL2-2.0.0.dylib "$app/Frameworks/libSDL2-2.0.0.dylib"
install_name_tool -id @rpath/libSDL3.dylib "$app/Frameworks/libSDL3.dylib"
install_name_tool -change "$(brew --prefix sdl2-compat)/lib/libSDL2-2.0.0.dylib" @rpath/libSDL2-2.0.0.dylib "$app/MacOS/RetroArch"
install_name_tool -add_rpath @executable_path/../Frameworks "$app/MacOS/RetroArch"
codesign --force --deep -s - "$2"
