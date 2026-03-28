@echo off
setlocal

set IMAGE_NAME=cloudstore
set IMAGE_TAG=latest
set TARGET=x86_64-unknown-linux-musl
set BIN_NAME=cloudstore-api

echo ========================================
echo  CloudStore Cross-Compile Build Script
echo  Build: Windows -^> Linux (musl static)
echo ========================================
echo.

:: Step 1: Cross-compile for Linux musl
echo [1/3] Building static binary for %TARGET%...
cross build --release --target %TARGET% --bin %BIN_NAME%
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Cross-compilation failed!
    echo Make sure you have installed:
    echo   cargo install cross --git https://github.com/cross-rs/cross
    echo   Docker Desktop is running
    exit /b 1
)

:: Step 2: Copy binary to project root for Docker context
echo.
echo [2/3] Copying binary to build context...
copy /Y "target\%TARGET%\release\%BIN_NAME%" "%BIN_NAME%" >nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Binary not found!
    exit /b 1
)

:: Show binary size
for %%A in (%BIN_NAME%) do (
    set /a SIZE_MB=%%~zA / 1048576
    echo Binary size: %%~zA bytes (~%SIZE_MB% MB^)
)

:: Step 3: Build Docker image
echo.
echo [3/3] Building Docker image %IMAGE_NAME%:%IMAGE_TAG%...
docker build -t %IMAGE_NAME%:%IMAGE_TAG% .
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Docker build failed!
    del /Q %BIN_NAME% 2>nul
    exit /b 1
)

:: Cleanup: remove binary from project root
del /Q %BIN_NAME% 2>nul

:: Show result
echo.
echo ========================================
echo  BUILD COMPLETE
echo ========================================
docker images %IMAGE_NAME%:%IMAGE_TAG% --format "Image: {{.Repository}}:{{.Tag}}  Size: {{.Size}}"
echo.
echo Run with: docker compose up -d
echo ========================================

endlocal
