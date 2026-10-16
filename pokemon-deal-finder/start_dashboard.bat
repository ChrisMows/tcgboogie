@echo off
cd /d "%~dp0"
set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not exist "%PY%" set PY=python
title Pokemon Deal Finder - Dashboard
start "" http://127.0.0.1:5000
"%PY%" run_dashboard.py
pause
