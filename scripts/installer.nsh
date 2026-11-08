!macro customInstall
  CreateShortCut "$SMPROGRAMS\Desinstalar Cafe Pa'l Monte.lnk" "$INSTDIR\${UNINSTALL_FILENAME}" "" "$INSTDIR\uninstallerIcon.ico" 0 "" "" "Desinstalar Cafe Pa'l Monte"
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\uninstallerIcon.ico" 0 "" "" "${APP_DESCRIPTION}"
  !endif
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\uninstallerIcon.ico" 0 "" "" "${APP_DESCRIPTION}"
  !endif
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Desinstalar Cafe Pa'l Monte.lnk"
!macroend
