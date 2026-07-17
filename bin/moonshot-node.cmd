@echo off
setlocal
set MOONSHOT_LAUNCHER_REPO_ROOT=%~dp0..

set RESOLVE_HOME=%MOONSHOT_RELAY_HOME%
if "%RESOLVE_HOME%"=="" set RESOLVE_HOME=%USERPROFILE%\.moonshot-relay
set BUNDLED_NODE=%RESOLVE_HOME%\runtime\current\node.exe

set RESOLVE_NODE=node
if exist "%BUNDLED_NODE%" set RESOLVE_NODE=%BUNDLED_NODE%

for /f "usebackq delims=" %%i in (`call "%RESOLVE_NODE%" -e "const p = require('url').pathToFileURL(require('path').resolve(process.env.MOONSHOT_LAUNCHER_REPO_ROOT, 'scripts/lib/moonshot-runtime-resolver.mjs')).href; import(p).then(m => console.log(m.resolveRuntimeNode({ homeDir: process.env.MOONSHOT_RELAY_HOME || '' }).execPath)).catch(err => { console.error(err.message); process.exit(1); })" 2^>nul`) do set EXEC_PATH=%%i

if "%EXEC_PATH%"=="" (
  echo Error: Failed to resolve managed Moonshot runtime node path. >&2
  exit /b 1
)

"%EXEC_PATH%" %*
