@echo off
REM Double-click launcher for sharing the Crosswalker docs over Tailscale.
REM Wraps `bun run serve:share` → Astro HMR at http://localhost:14321
REM plus a tailnet-only Tailscale Serve URL. Ctrl+C cleans up children.
cd /d "%~dp0"
echo Starting Crosswalker docs with Tailscale sharing...
echo The tailnet URL will appear below once the server is ready.
echo.
call bun run serve:share
echo.
echo Shared docs server exited. Press any key to close.
pause >nul
