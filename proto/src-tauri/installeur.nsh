; Nouvelle installation : dossier sans espace (« EnLocal »), certains outils hors Windows s'y perdent.
; Une installation existante garde son dossier : ses données (data\, emu\) sont à côté de l'exe.
!macro NSIS_HOOK_PREINSTALL
  ${If} $INSTDIR == "$LOCALAPPDATA\${PRODUCTNAME}"
  ${AndIfNot} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    RMDir "$INSTDIR"
    StrCpy $INSTDIR "$LOCALAPPDATA\EnLocal"
    SetOutPath $INSTDIR
  ${EndIf}
!macroend
