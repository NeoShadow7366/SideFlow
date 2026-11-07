; SideFlow Custom NSIS Installer Hooks
; Automatically terminates any running SideFlow background tray process before
; installing, upgrading, or uninstalling so Windows never displays a file-in-use warning.

!macro customInit
  nsExec::ExecToLog 'taskkill /F /IM "SideFlow.exe" /T'
  Sleep 300
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /F /IM "SideFlow.exe" /T'
  Sleep 300
!macroend
