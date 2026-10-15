@echo off
rem Package the source folders, rebuild and test, then publish the whole collection.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\update-collection.ps1"
set "TOOL_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %TOOL_EXIT%
