@echo off
chcp 65001 >nul
title Publiser Designporten
cd /d "%~dp0..\.."
node scripts\publiser-produksjon.mjs %*
echo.
pause
