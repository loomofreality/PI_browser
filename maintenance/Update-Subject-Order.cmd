@echo off
rem After editing "subjects - reference.docx": regenerate the thematic order and publish it.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\update-subject-order.ps1"
set "TOOL_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %TOOL_EXIT%
