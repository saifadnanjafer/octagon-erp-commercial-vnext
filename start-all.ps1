# start-all.ps1
Write-Host "Starting OmniSystem Local Servers..." -ForegroundColor Cyan

# 1. Start Python Backend (FastAPI)
Write-Host "Starting Backend on Port 8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd erp-local/backend; .\venv\Scripts\activate; uvicorn app.main:app --host 0.0.0.0 --port 8000"

# 2. Start React Frontend
Write-Host "Starting Frontend on Port 5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd erp-local/frontend; npm run dev"

# 3. Start Legacy Portal Server
Write-Host "Starting Legacy Portal on Port 3000..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", ".\start.ps1"

Write-Host "All services have been launched in separate windows!" -ForegroundColor Cyan
Write-Host "Please open http://localhost:3000 to access the Master Portal." -ForegroundColor Cyan
