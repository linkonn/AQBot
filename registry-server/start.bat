@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

if "%PORT%"=="" set PORT=7801

echo ==========================================
echo   取证之手 内网技能仓库
echo   端口: %PORT%
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 18 或更高版本。
  pause
  exit /b 1
)

node server.mjs

echo.
echo 服务已退出。
pause
