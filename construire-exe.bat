@echo off
rem Reconstruit le jeu et le .exe Windows. Double-cliquer apres chaque mise a jour du code.
cd /d "%~dp0"
echo Installation des outils (la premiere fois, quelques minutes)...
call npm install --no-audit --no-fund || goto erreur
echo Assemblage du jeu et fabrication du .exe...
call npm run exe || goto erreur
echo.
echo Termine : "%~dp0dist\The Eagle Rises.exe"
explorer "%~dp0dist"
pause
exit /b 0
:erreur
echo.
echo La construction a echoue, voir les messages ci-dessus.
pause
exit /b 1
