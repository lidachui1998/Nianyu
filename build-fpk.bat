@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
set FN_DIR=%ROOT%\fnnas.nianyu
set FNPACK=%ROOT%\tools\fnpack-1.2.1-windows-amd64.exe

if not exist "%FN_DIR%" (
  echo [ERROR] Missing "%FN_DIR%".
  exit /b 1
)

if not exist "%FNPACK%" (
  echo [ERROR] Missing fnpack binary at "%FNPACK%".
  exit /b 1
)

if not exist "%ROOT%\icon.png" (
  echo [ERROR] Missing "%ROOT%\icon.png".
  exit /b 1
)

echo [1/5] Build client...
call npm run build:client
if errorlevel 1 exit /b 1

echo [2/5] Bundle server (single file)...
if exist "%FN_DIR%\app\server" rmdir /s /q "%FN_DIR%\app\server"
mkdir "%FN_DIR%\app\server"
call npx esbuild "%ROOT%\server\index.js" --bundle --platform=node --format=cjs --target=node18 --minify --outfile="%FN_DIR%\app\server\index.cjs"
if errorlevel 1 exit /b 1

echo [3/5] Copy client dist...
if exist "%FN_DIR%\app\client\dist" rmdir /s /q "%FN_DIR%\app\client\dist"
mkdir "%FN_DIR%\app\client"
xcopy "%ROOT%\client\dist" "%FN_DIR%\app\client\dist" /E /I /Y >nul
if errorlevel 1 exit /b 1

echo [4/5] Generate icons...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Add-Type -AssemblyName System.Drawing; " ^
  "$src='%ROOT%\\icon.png'; " ^
  "$dest='%FN_DIR%\\app\\ui\\images'; " ^
  "New-Item -ItemType Directory -Force -Path $dest | Out-Null; " ^
  "$img=[System.Drawing.Image]::FromFile($src); " ^
  "function Save-Icon([int]$size,[string]$outPath,[System.Drawing.Image]$img){ " ^
  "  $bmp=New-Object System.Drawing.Bitmap $size,$size; " ^
  "  $g=[System.Drawing.Graphics]::FromImage($bmp); " ^
  "  $g.Clear([System.Drawing.Color]::Transparent); " ^
  "  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality; " ^
  "  $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; " ^
  "  $g.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality; " ^
  "  $scale=[Math]::Min($size / $img.Width, $size / $img.Height); " ^
  "  $newW=[int]([Math]::Round($img.Width * $scale)); " ^
  "  $newH=[int]([Math]::Round($img.Height * $scale)); " ^
  "  $x=[int](($size - $newW) / 2); " ^
  "  $y=[int](($size - $newH) / 2); " ^
  "  $g.DrawImage($img, $x, $y, $newW, $newH); " ^
  "  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png); " ^
  "  $g.Dispose(); $bmp.Dispose(); " ^
  "} " ^
  "Save-Icon 64 (Join-Path $dest 'icon_64.png') $img; " ^
  "Save-Icon 256 (Join-Path $dest 'icon_256.png') $img; " ^
  "$img.Dispose(); " ^
  "Copy-Item -Force -Path (Join-Path $dest 'icon_64.png') -Destination '%FN_DIR%\\ICON.PNG'; " ^
  "Copy-Item -Force -Path (Join-Path $dest 'icon_256.png') -Destination '%FN_DIR%\\ICON_256.PNG'; "
if errorlevel 1 exit /b 1

echo [5/5] Build FPK...
pushd "%FN_DIR%"
"%FNPACK%" build
set BUILD_RC=%ERRORLEVEL%
popd
if not "%BUILD_RC%"=="0" exit /b %BUILD_RC%

echo Done. Output: "%FN_DIR%\\fnnas.nianyu.fpk"
exit /b 0
