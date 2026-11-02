#!/bin/sh
# ThinkPad : seule chose permise à la clé SSH de GitHub (workflow « Publier » d'En Local) :
# déposer l'installeur d'une NOUVELLE version et sa signature dans le dossier d'En Local.
# Une version publiée n'est jamais modifiée : ni son installeur, ni sa signature.
# Installé dans ~/.ssh/authorized_keys par secrets-ci.sh : restrict,command="~/depot-en-local.sh" <clé>.
set -f
D="$HOME/loc-fichiers/en-local"
c="$SSH_ORIGINAL_COMMAND"
non() { echo refusé >&2; exit 1; }
case "$c" in *[\;\&\|\`\$\<\>\(\)\\\"\'\*\?\[]*|*..*) non ;; esac
set -- $c
cmd=$1; shift
# Dernier argument : le fichier visé, réduit à son nom.
for f; do :; done
n=$(basename "${f:-}")
v=$(printf '%s' "$n" | sed -n 's/^En-Local_\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)_setup\.exe.*$/\1/p')
[ -n "$v" ] || non
exe="$D/En-Local_${v}_setup.exe"
# Version déjà publiée : plus rien n'y touche.
[ -e "$exe" ] && [ "$cmd" != test ] && non
case "$cmd" in
  scp)
    [ "$1" = -t ] || non
    case "$n" in "En-Local_${v}_setup.exe.sig"|"En-Local_${v}_setup.exe.part") exec scp -t "$D/$n" ;; esac ;;
  test)
    [ "$n" = "En-Local_${v}_setup.exe" ] && exec test -e "$exe" ;;
  mv)
    # Seulement « .part » -> son installeur, une fois la signature arrivée.
    [ $# -eq 2 ] && [ "$(basename "$1")" = "En-Local_${v}_setup.exe.part" ] && [ "$n" = "En-Local_${v}_setup.exe" ] \
      && [ -f "$exe.sig" ] && exec mv -n "$D/En-Local_${v}_setup.exe.part" "$exe" ;;
esac
non
