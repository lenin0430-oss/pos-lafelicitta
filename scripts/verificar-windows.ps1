# Verifica compilación y pruebas en Windows SIN tocar tu .env.local ni la base productiva.
# Uso (PowerShell, en la carpeta del repo):  powershell -ExecutionPolicy Bypass -File scripts\verificar-windows.ps1
# Copia el proyecto a una carpeta temporal (sin .git, .next ni .env*), usa variables FICTICIAS y ejecuta tsc, pruebas y next build.
$ErrorActionPreference = 'Stop'
$origen = (Resolve-Path "$PSScriptRoot\..").Path
$tmp = Join-Path $env:TEMP ("mesapos-verificacion-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $tmp | Out-Null
robocopy $origen $tmp /E /XD node_modules .next .git respaldos menu-lafelicitta /XF .env* *.tsbuildinfo /NFL /NDL /NJH /NJS | Out-Null
# robocopy: 0-7 = éxito (con o sin archivos copiados); >= 8 = error.
if ($LASTEXITCODE -ge 8) { Write-Host "ERROR: robocopy falló (código $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
Set-Location $tmp
# Variables ficticias: apuntan a un host inexistente, así que ninguna prueba puede llegar a la base real.
@"
NEXT_PUBLIC_SUPABASE_URL=https://ficticio.invalid
NEXT_PUBLIC_SUPABASE_ANON_KEY=ficticia
SUPABASE_SERVICE_KEY=ficticia
CRON_SECRET=ficticio-ficticio-ficticio-ficticio
BOT_SECRET=ficticio-ficticio-ficticio-ficticio
BOT_URL=https://ficticio.invalid
BOT_EMPRESA_ID=00000000-0000-0000-0000-000000000000
"@ | Set-Content .env.local -Encoding ascii
Write-Host "== npm ci =="
npm ci
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: falló npm ci (código $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
Write-Host "== tsc =="
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: falló tsc (código $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
Write-Host "== pruebas =="
npm test
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: falló pruebas (código $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
Write-Host "== next build =="
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: falló next build (código $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
Write-Host "`nOK: compilación y pruebas completas en $tmp (puedes borrar esa carpeta)."
