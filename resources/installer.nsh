; Extra Windows version-info fields for the installer and uninstaller.
; electron-builder already sets ProductName, CompanyName, FileVersion, ProductVersion,
; FileDescription, LegalCopyright and LegalTrademarks; these complete the set so the files
; carry full publisher metadata (unsigned files with blank fields are flagged more often).
!ifdef BUILD_UNINSTALLER
  VIAddVersionKey /LANG=1033 InternalName "Uninstall Shouku Launcher"
  VIAddVersionKey /LANG=1033 OriginalFilename "Uninstall Shouku Launcher.exe"
  VIAddVersionKey /LANG=1033 Comments "Removes Shouku Launcher. Open source (GPL-3.0): https://github.com/shoukugames/shoukulauncher"
!else
  VIAddVersionKey /LANG=1033 InternalName "ShoukuLauncher-Setup"
  VIAddVersionKey /LANG=1033 OriginalFilename "ShoukuLauncher-Setup-${VERSION}.exe"
  VIAddVersionKey /LANG=1033 Comments "Installer for Shouku Launcher by Shouku Games. Open source (GPL-3.0): https://github.com/shoukugames/shoukulauncher"
!endif
