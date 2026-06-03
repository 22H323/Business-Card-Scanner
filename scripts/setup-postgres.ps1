# Create CardSync database (cardsync_local) — no Docker
# Usage: npm run db:create

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

function Find-Psql {
  if (Get-Command psql -ErrorAction SilentlyContinue) { return "psql" }
  foreach ($v in 17, 16, 15, 14) {
    $path = "C:\Program Files\PostgreSQL\$v\bin\psql.exe"
    if (Test-Path $path) { return $path }
  }
  throw "psql not found. Install PostgreSQL from https://www.postgresql.org/download/windows/"
}

$psql = Find-Psql
Write-Host "Using: $psql" -ForegroundColor Cyan
Write-Host ""
Write-Host "Creating database cardsync_local..." -ForegroundColor Yellow
Write-Host 'Enter the postgres superuser password when prompted' -ForegroundColor Gray
& $psql -U postgres -f prisma/create-database.sql
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Database cardsync_local is ready." -ForegroundColor Green
Write-Host ""
Write-Host "Add to .env:" -ForegroundColor Cyan
Write-Host 'DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/cardsync_local?schema=public"'
Write-Host ""
Write-Host "Then run:" -ForegroundColor Cyan
Write-Host "  npm run db:push"
Write-Host "  npm run db:generate"
Write-Host "  npm run local-db"
