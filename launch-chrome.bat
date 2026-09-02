@echo off
echo ====================================================
echo Starting Gemini Browser Agent in Chrome...
echo ====================================================
node "%~dp0scripts\launch-browser.js"
if %ERRORLEVEL% NEQ 0 (
  pause
)
