@echo off
rem Open the Subject view editorial workspace on the live website.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\run-node-tool.ps1" open-site-page.mjs "subjects.html?review=1"
if errorlevel 1 pause
