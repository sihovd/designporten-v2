@echo off
chcp 65001 >nul
title Oppsett - Publiser Designporten
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0oppsett.ps1"
echo.
pause
