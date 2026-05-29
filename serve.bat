@echo off
REM Double-click launcher for the interactive Crosswalker dev menu.
REM Wraps `bun run serve` (scripts/serve.mjs) — docs dev, plugin watch,
REM both in parallel, tunnel sharing, docs E2E. Ctrl+C cleans up children.
cd /d "%~dp0"
echo Starting Crosswalker dev menu (bun run serve)...
echo.
call bun run serve
echo.
echo Dev menu exited. Press any key to close.
pause >nul
