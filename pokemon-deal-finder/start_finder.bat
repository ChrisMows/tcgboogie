@echo off
cd /d "%~dp0"
set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not exist "%PY%" set PY=python
title Pokemon Deal Finder
"%PY%" run_finder.py %*
pause
