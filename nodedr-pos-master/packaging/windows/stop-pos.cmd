@echo off
rem Stops only the Node processes that belong to Cafe POS (started from this folder).
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.ExecutablePath -like '%~dp0node\*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
exit /b 0
