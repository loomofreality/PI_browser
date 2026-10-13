@echo off
rem Open the subject connection review page on the live website.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\run-node-tool.ps1" open-site-page.mjs relationships.html
if errorlevel 1 pause
