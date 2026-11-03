# Actualización CONTROLADA de dependencias (ejecutar en Windows, con red al registro npm, en la rama aislada).
# No usa `npm audit fix --force`. Guarda el audit antes/después en docs/auditoria/ para comparar.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\actualizar-dependencias-windows.ps1 [-Next 14.2.35]
param([string]$Next = '15.5.28')
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path "$PSScriptRoot\..").Path
New-Item -ItemType Directory -Force docs\auditoria | Out-Null
function Fallo($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }
npm ci;                                    if ($LASTEXITCODE -ne 0) { Fallo 'npm ci' }
npm audit --json | Out-File docs\auditoria\audit-antes.json -Encoding utf8
Write-Host "== Instalando next@$Next (exacto, sin --force) =="
npm install --save-exact "next@$Next";     if ($LASTEXITCODE -ne 0) { Fallo "npm install next@$Next" }
npm audit --json | Out-File docs\auditoria\audit-despues.json -Encoding utf8
$resumen = node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('./docs/auditoria/audit-despues.json','utf8').replace(/^\uFEFF/,''));const v=a.vulnerabilities||{};console.log(JSON.stringify(Object.entries(v).map(([n,x])=>({n,sev:x.severity,rango:x.range,arreglo:x.fixAvailable})),null,1));console.log(JSON.stringify(a.metadata&&a.metadata.vulnerabilities))"
if ($LASTEXITCODE -ne 0) { Fallo 'no se pudo leer el informe de auditoría' }
Write-Host $resumen
Write-Host "`nRevisa docs\auditoria\audit-despues.json. Si quedan avisos (p. ej. postcss/nanoid/source-map-js anidados en next), NO uses --force: envíame el archivo para decidir un 'overrides' puntual y probarlo."
Write-Host "Luego: scripts\verificar-windows.ps1 -PgliteJs <ruta a pglite\dist\index.js>  (tsc, pruebas sin omisiones, next build, audit)."
