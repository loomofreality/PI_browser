@echo off
rem Publish a subject-edits.json exported from the review pages.
rem Drag the exported file onto this launcher, or run it to use the newest one in Downloads.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\run-node-tool.ps1" publish-editorial-decisions.mjs %*
set "TOOL_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %TOOL_EXIT%
