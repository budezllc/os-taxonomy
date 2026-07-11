@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo [1/3] Building private static export...
call npm run build:private --prefix web
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo.
echo [2/3] Building Docker image...
docker build -f web/Dockerfile.private -t micro-lessons-private:latest .
if errorlevel 1 (
  echo Docker build failed.
  exit /b 1
)

echo.
echo [3/3] Saving tar archive...
docker save micro-lessons-private:latest -o micro-lessons-private.tar
if errorlevel 1 (
  echo Docker save failed.
  exit /b 1
)

echo.
echo Done.
echo   Image: micro-lessons-private:latest
echo   Tar:   %CD%\micro-lessons-private.tar
exit /b 0
