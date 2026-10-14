@echo off
setlocal
cd /d "%~dp0"

REM ============================================
REM  Shizi App - Build Android APK (one-click)
REM  Requires: Node.js + Android Studio (SDK / JDK17)
REM  cd /d "%~dp0" forces the working dir to this script's folder
REM ============================================

echo ============================================
echo  [1/5] Set JDK17 and Android SDK paths
echo ============================================

set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"

echo  JAVA_HOME=%JAVA_HOME%
echo  ANDROID_HOME=%ANDROID_HOME%

echo ============================================
echo  [2/5] Install Capacitor dependencies
echo ============================================
call npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/preferences
if errorlevel 1 (
  echo  Direct install failed, retrying via npmmirror...
  call npm install --registry=https://registry.npmmirror.com @capacitor/core @capacitor/cli @capacitor/android @capacitor/preferences
  if errorlevel 1 goto :fail
)

echo ============================================
echo  [3/5] Sync version and web assets
echo ============================================
call node set-version.js
if errorlevel 1 goto :fail
call node copy-web.js
if errorlevel 1 goto :fail

echo ============================================
echo  [4/5] Generate / sync android project
echo ============================================
if not exist "android" (
  call npx cap add android
  if errorlevel 1 goto :fail
)
call npx cap sync android
if errorlevel 1 goto :fail

echo ============================================
echo  [5/5] Build APK (first build downloads Gradle deps)
echo ============================================
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
  cd ..
  goto :fail
)
cd ..

echo.
echo ============================================
echo  BUILD SUCCESS
echo  APK: android\app\build\outputs\apk\debug\app-debug.apk
echo ============================================
call node set-version.js --apk
pause
exit /b 0

:fail
echo.
echo ============================================
echo  BUILD FAILED - see errors above
echo  Common cause: slow Gradle dependency download.
echo  Add Aliyun mirrors in android\settings.gradle (see README).
echo ============================================
pause
exit /b 1
