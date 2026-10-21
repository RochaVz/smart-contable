<#
.SYNOPSIS
    Despliega el backend de SmartContable a la instancia EC2 de AWS.

.DESCRIPTION
    Empaqueta backend/ en un artefacto limpio (sin venvs, cachés, logs, secretos ni el
    Caddyfile de plantilla), lo publica en el bucket S3 de la pila CloudFormation y lo
    aplica en /opt/smartcontable mediante AWS Systems Manager.

    El despliegue conserva .env.production y el Caddyfile real del servidor: ambos se
    respaldan antes de sobrescribir el directorio y se restauran al terminar.
    Las migraciones de Alembic se aplican al arrancar el contenedor (CMD del Dockerfile).

    El servicio de Caddy NO se reconstruye: sigue sirviendo TLS y proxy sobre el mismo
    dominio mientras el backend se reinicia.

.PARAMETER StackName
    Nombre de la pila CloudFormation. Por defecto: 'smartcontable-pilot'.

.PARAMETER Region
    Region AWS. Por defecto: 'us-east-2'.

.PARAMETER Force
    Obligatorio: confirma el despliegue en produccion.

.EXAMPLE
    .\deploy-backend-aws.ps1 -Force
#>
[CmdletBinding()]
param(
    [string]$StackName = 'smartcontable-pilot',
    [string]$Region = 'us-east-2',
    [switch]$Force
)

if (-not $Force) {
    throw 'Este comando despliega el backend en produccion. Ejecutalo con -Force.'
}

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root 'backend'
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$stageDir = Join-Path $env:TEMP "sc-stage-$ts"
$zipPath = Join-Path $env:TEMP "sc-backend-$ts.zip"
$releaseUri = "releases/sc-backend-$ts.zip"

function Get-CFNOutput {
    param([string]$Key)
    $raw = aws cloudformation describe-stacks --region $Region --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='$Key'].OutputValue" --output text
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    return $raw.Trim()
}

$bucket = Get-CFNOutput -Key 'S3BucketName'
if (-not $bucket) { throw "No se encontro el bucket S3 de la pila '$StackName'." }
$instanceId = Get-CFNOutput -Key 'InstanceId'
if (-not $instanceId) { throw "No se encontro la instancia EC2 de la pila '$StackName'." }
$publicIp = Get-CFNOutput -Key 'InstancePublicIp'
$healthHost = if ($publicIp) { ($publicIp -replace '\.', '-') + '.nip.io' } else { 'localhost' }

Write-Host "[1/4] Staging del backend en $stageDir"
New-Item -ItemType Directory -Path $stageDir | Out-Null
# Robocopy evita copiar entornos virtuales, cachés bloqueadas ni secretos.
$excludeDirs = @('.venv', 'venv', '__pycache__', '.pytest_cache', '.pytest_cache_local', '.vscode', 'logs', 'data', '.git')
$excludeFiles = @('*.pyc', '*.pyo', '*.sql', '.env', '.env.*', 'Caddyfile')
$robocopyArgs = @($backendDir, $stageDir, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
$robocopyArgs += '/XD'
$robocopyArgs += $excludeDirs
$robocopyArgs += '/XF'
$robocopyArgs += $excludeFiles
& robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Robocopy fallo con codigo $LASTEXITCODE al preparar el artefacto." }

Write-Host "[2/4] Compresion del artefacto"
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimize -Force
$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "  $zipPath ($sizeMB MB)"

Write-Host "[3/4] Publicacion en S3"
aws s3 cp $zipPath "s3://$bucket/$releaseUri" --region $Region --quiet
Write-Host "  s3://$bucket/$releaseUri"

Write-Host "[4/4] Despliegue en la instancia $instanceId (SSM)"
$shell = @(
    'set -eu'
    'cd /opt/smartcontable'
    'mkdir -p /tmp/sc_keep'
    'cp -n .env.production /tmp/sc_keep/env.bak'
    'cp -n Caddyfile /tmp/sc_keep/caddy.bak'
    "aws s3 cp s3://$bucket/$releaseUri /tmp/sc_release.zip --region $Region --quiet"
    'rm -rf app alembic'
    'unzip -q -o /tmp/sc_release.zip -d /opt/smartcontable'
    'if [ -f /tmp/sc_keep/env.bak ]; then mv /tmp/sc_keep/env.bak .env.production; fi'
    'if [ -f /tmp/sc_keep/caddy.bak ]; then mv /tmp/sc_keep/caddy.bak Caddyfile; fi'
    'docker compose -f docker-compose.prod.yml up -d --build backend'
    'sleep 20'
    'docker compose -f docker-compose.prod.yml ps --format "{{.Name}} {{.Status}}"'
    'docker compose -f docker-compose.prod.yml logs backend --tail 25'
    "curl -s -o /dev/null -w 'HEALTH_HTTP:%{http_code}\n' https://$healthHost/health || true"
)
$params = @{ commands = $shell } | ConvertTo-Json -Compress
$commandId = aws ssm send-command --region $Region --instance-ids $instanceId --document-name AWS-RunShellScript --parameters $params --query 'Command.CommandId' --output text
Write-Host "  CommandId: $commandId"

$invocation = $null
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 15
    $invocation = aws ssm get-command-invocation --region $Region --command-id $commandId --instance-id $instanceId --output json | ConvertFrom-Json
    if ($invocation.Status -ne 'InProgress') { break }
    Write-Host "  ... en curso ($($invocation.Status))"
}

Write-Host "Estado: $($invocation.Status)"
Write-Host '--- salida ---'
Write-Host $invocation.StandardOutputContent
if ($invocation.StandardErrorContent) {
    Write-Host '--- errores ---'
    Write-Host $invocation.StandardErrorContent
}

Remove-Item -Recurse -Force $stageDir -ErrorAction SilentlyContinue
Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
