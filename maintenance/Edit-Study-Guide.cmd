@echo off
rem Open the local study guide editor (save on this computer, then publish).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\run-node-tool.ps1" edit-study-guide-server.mjs %*
set "TOOL_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %TOOL_EXIT%
