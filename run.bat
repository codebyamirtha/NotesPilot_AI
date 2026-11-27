@echo off
echo ===================================================
echo 📚 Starting NotesPilot AI Server...
echo ===================================================

cd /d "%~dp0backend"

if not exist node_modules (
    echo Installing backend dependencies...
    npm install
)

echo Starting NotesPilot AI server at http://localhost:5000 ...
start http://localhost:5000
npm start
