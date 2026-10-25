@echo off
rem Open the private local editor to correct or delete catalog items. Edits wait in one pending file until Publish-Editorial-Decisions.cmd publishes them.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\launch-item-editor.ps1"
