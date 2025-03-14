@echo off
setlocal EnableDelayedExpansion

REM Use simple command-line colors instead of ANSI
color 0B

REM Initialize build status tracking
set "packages="
set "success_count=0"
set "total_count=0"

cls
echo.
echo  ===== ORMI Package Builder =====
echo  ====================================
echo.

REM First process ormi-core if it exists
if exist "ormi-core\package.json" (
    set /a total_count+=1
    cls
    echo.
    echo  ===== Building ormi-core (1/3) =====
    echo  ====================================
    echo.
    
    echo Found package.json in ormi-core
    
    REM Change to the directory
    cd "ormi-core"
    
    REM Run bun install and build
    echo Installing dependencies in ormi-core...
    call bun i
    
    echo.
    echo Building ormi-core...
    call bun run build

    echo.
    echo Linking ormi-core...
    call bun link
    
    REM Return to the original directory
    cd ..
    
    echo.
    echo Completed processing ormi-core
    set "packages=!packages!ormi-core (success), "
    set /a success_count+=1
    echo  ====================================
    timeout /t 2 >nul
)

REM Loop through all directories in the current folder except ormi-app and ormi-core
for /D %%d in (*) do (
    if /I NOT "%%d"=="ormi-app" (
        if /I NOT "%%d"=="ormi-core" (
            REM Check if the directory contains a package.json file
            if exist "%%d\package.json" (
                set /a total_count+=1
                cls
                echo.
                echo  ===== Building %%d (2/3) =====
                echo  ====================================
                echo.
                
                echo Found package.json in %%d
                
                REM Change to the directory
                cd "%%d"
                
                REM Run bun install and build
                echo Installing dependencies in %%d...
                call bun i
                
                echo.
                echo Building %%d...
                call bun run build

                echo.
                echo Linking %%d...
                call bun link
                
                REM Return to the original directory
                cd ..
                
                echo.
                echo Completed processing %%d
                set "packages=!packages!%%d (success), "
                set /a success_count+=1
                echo  ====================================
                timeout /t 2 >nul
            )
        )
    )
)

REM Display build summary table before building ormi-app
cls
echo.
echo  ===== Build Summary =====
echo  =========================
echo.
echo Packages built: !success_count!/!total_count!
echo.
echo Status:
echo !packages:~0,-2!
echo.
echo  =========================
echo.


REM Finally process ormi-app if it exists
if exist "ormi-app\package.json" (
    set /a total_count+=1
     echo.
    echo  ===== Build Summary =====
    echo  =========================
    echo.
    echo Packages built: !success_count!/!total_count!
    echo.
    echo Status:
    echo !packages:~0,-2!
    echo.
    echo  =========================
    echo.
    echo  ===== Building ormi-app (3/3) =====
    echo  ====================================
    echo.
    
    echo Found package.json in ormi-app
    
    REM Change to the directory
    cd "ormi-app"
    
    REM Run bun install and build
    echo Installing dependencies in ormi-app...
    call bun i
    
    echo.
    echo Building ormi-app...
    call bun run build
    
    REM Return to the original directory
    cd ..
    
    echo.
    echo Completed processing ormi-app
    set /a success_count+=1
    echo  ====================================
)

echo.
echo  ===== All folders processed - Final Results =====
echo  ===============================================
echo.
echo Packages built: !success_count!/!total_count!
echo.
echo Status:
if defined packages (
    echo !packages:~0,-2!, ormi-app (success)
) else (
    echo ormi-app (success)
)
echo.
echo  ===============================================

pause
endlocal