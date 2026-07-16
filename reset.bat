@echo off
rem Double-click to clear the ad-hoc imports you made while testing Crosswalker,
rem leaving the curated corpus / fixtures / GRC views intact.
rem Shows a preview first, then waits for you to confirm before deleting.
title Crosswalker - reset test imports
echo Previewing what would be cleared (curated corpus is protected)...
echo.
wsl.exe -e bash -lc "cd \"$(wslpath '%~dp0')\" && node scripts/reset-test-vault.mjs"
echo.
echo ============================================================
echo  Press any key to DELETE the notes listed above,
echo  or close this window to cancel.
echo ============================================================
pause >nul
wsl.exe -e bash -lc "cd \"$(wslpath '%~dp0')\" && node scripts/reset-test-vault.mjs --yes"
echo.
echo Done. Press any key to close.
pause >nul
