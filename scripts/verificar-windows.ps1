# Verifica compilación y pruebas en Windows SIN tocar tu .env.local ni la base productiva.
# Uso (PowerShell, en la carpeta del repo):  powershell -ExecutionPolicy Bypass -File scripts\verificar-windows.ps1
# Copia el proyecto a una carpeta temporal (sin .git, .next ni .env*), usa variables FICTICIAS y ejecuta tsc, pruebas y next build.
param(
  # Ruta a @electric-sql/pglite/dist/index.js (necesaria para las pruebas de migración). También se lee de $env:PGLITE_JS.
  [string]$PgliteJs = $env:PGLITE_JS
)
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
if ($PgliteJs -and (Test-Path $PgliteJs)) { $env:PGLITE_JS = (Resolve-Path $PgliteJs).Path } else { Remove-Item Env:PGLITE_JS -ErrorAction SilentlyContinue }
$salida = node --import ./tests/register.mjs --test --test-reporter=tap tests/*.test.mjs 2>&1 | Tee-Object -Variable pruebasLog
$codigoPruebas = $LASTEXITCODE
$pruebasLog | ForEach-Object { Write-Host $_ }
if ($codigoPruebas -ne 0) { Write-Host "ERROR: fallaron las pruebas (código $codigoPruebas)" -ForegroundColor Red; exit 1 }
$omitidas = 0
$m = [regex]::Match(($pruebasLog -join "`n"), '# skipped (\d+)')
if ($m.Success) { $omitidas = [int]$m.Groups[1].Value } else { Write-Host 'ERROR: no se pudo comprobar el resumen de pruebas'; exit 2 }
$incompleta = ($omitidas -gt 0)
if ($incompleta) { Write-Host "AVISO: $omitidas prueba(s) omitida(s) (migraciones sin PGlite). Indica -PgliteJs <ruta>\index.js o define PGLITE_JS." -ForegroundColor Yellow }
Write-Host "== audit (informativo) =="
npm audit --omit=dev
$codigoAudit = $LASTEXITCODE
Write-Host "== next build =="
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: falló next build (código $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
if ($incompleta) {
  Write-Host "`nVERIFICACIÓN INCOMPLETA: tsc y next build pasaron, pero se omitieron $omitidas prueba(s). No es una verificación completa." -ForegroundColor Yellow
  exit 2
}
if ($codigoAudit -ne 0) { Write-Host "`nVERIFICACIÓN COMPLETA (tsc, 0 omitidas, next build), PERO npm audit reporta avisos pendientes (código $codigoAudit)." -ForegroundColor Yellow; exit 0 }
Write-Host "`nOK COMPLETO: tsc, pruebas sin omisiones, next build y npm audit limpios en $tmp (puedes borrar esa carpeta)."
