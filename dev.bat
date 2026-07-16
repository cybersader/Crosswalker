@echo off
rem Double-click to start the plugin watch build inside WSL (serve:plugin —
rem self-heals WSL/Windows node_modules mismatches before launching).
rem Path is derived from this file's location — no hardcoded paths.
title Crosswalker - plugin watch build
wsl.exe -e bash -lc "cd \"$(wslpath '%~dp0')\" && bun run serve:plugin"
pause
