@echo off
rem Wrapper the scheduled task points at, so the task itself is one fixed path rather than a long
rem inline command line. `%~dp0..` resolves to the repo root regardless of where it's cloned;
rem only the npm.cmd location below is this machine's.
setlocal
cd /d "%~dp0.."
"C:\Program Files\nodejs\npm.cmd" run web:snapshot >> "scripts\web-snapshot.log" 2>&1
