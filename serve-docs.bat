@echo off
REM Double-click launcher for the docs dev server only.
REM Wraps `bun run serve:docs` → Astro HMR at http://localhost:14321
REM (first run auto-installs docs/node_modules; handles WSL/Windows
REM rollup native-binary mismatch automatically).
cd /d "%~dp0"
echo Starting Crosswalker docs dev server...
echo Once ready, open http://localhost:14321/crosswalker/
echo.
call bun run serve:docs
echo.
echo Docs server exited. Press any key to close.
pause >nul
