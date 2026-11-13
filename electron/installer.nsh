; SideFlow Custom NSIS Installer Hooks
; Requests graceful shutdown of SideFlow.exe (allowing sideflow-config.json to flush cleanly)
; before falling back to targeted termination of SideFlow.exe ONLY (never `/T` tree-kill,
; which would terminate user IDEs/browsers/terminals launched from SideFlow Drawers).

!macro customInit
  nsExec::ExecToLog 'taskkill /IM "SideFlow.exe"'
  Sleep 600
  nsExec::ExecToLog 'taskkill /F /IM "SideFlow.exe"'
  Sleep 250
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /IM "SideFlow.exe"'
  Sleep 600
  nsExec::ExecToLog 'taskkill /F /IM "SideFlow.exe"'
  Sleep 250
!macroend
