@echo off
rem Open the private local editor for one catalog item (save locally, then publish).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\launch-item-editor.ps1"
