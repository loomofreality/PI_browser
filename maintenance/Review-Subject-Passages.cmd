@echo off
rem Open the quoted-passage review queue on the live website.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\run-node-tool.ps1" open-site-page.mjs "passages.html?status=unmatched"
if errorlevel 1 pause
