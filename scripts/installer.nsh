!macro customInstall
  CreateShortCut "$SMPROGRAMS\Desinstalar Cafe Pa'l Monte.lnk" "$INSTDIR\${UNINSTALL_FILENAME}" "" "$INSTDIR\uninstallerIcon.ico" 0 "" "" "Desinstalar Cafe Pa'l Monte"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Desinstalar Cafe Pa'l Monte.lnk"
!macroend
