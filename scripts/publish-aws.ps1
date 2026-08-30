param(
    [string]$StackName = "smartcontable-pilot",
    [string]$Region = "us-east-2"
)

$instanceId = aws cloudformation describe-stacks --region $Region --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text
$databaseEndpoint = aws cloudformation describe-stacks --region $Region --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpoint'].OutputValue" --output text
$bucket = aws cloudformation describe-stacks --region $Region --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" --output text
$instanceIp = aws cloudformation describe-stacks --region $Region --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='InstancePublicIp'].OutputValue" --output text
$domain = "$($instanceIp.Replace('.', '-')).nip.io"

$rdsPassword = Read-Host "Contrasena maestra de RDS" -AsSecureString
$rdsPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($rdsPassword)
$secretKey = Read-Host "SECRET_KEY de SmartContable (minimo 32 caracteres)" -AsSecureString
$secretKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretKey)

try {
    $rdsPasswordValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($rdsPasswordPointer)
    $secretKeyValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretKeyPointer)
    if ($secretKeyValue.Length -lt 32) {
        throw "SECRET_KEY debe tener al menos 32 caracteres."
    }

    $encodedRdsPassword = [System.Uri]::EscapeDataString($rdsPasswordValue)
    $databaseUrl = "mysql+pymysql://smartcontable:${encodedRdsPassword}@${databaseEndpoint}:3306/smart_contable"
    $databaseUri = [Uri]$databaseUrl
    if ($databaseUri.Host -ne $databaseEndpoint) {
        throw "No se pudo construir una DATABASE_URL valida para el endpoint RDS."
    }
    aws ssm put-parameter --region $Region --name /smartcontable/database-url --type SecureString --overwrite --value $databaseUrl | Out-Null
    aws ssm put-parameter --region $Region --name /smartcontable/secret-key --type SecureString --overwrite --value $secretKeyValue | Out-Null
    aws ssm put-parameter --region $Region --name /smartcontable/s3-bucket --type String --overwrite --value $bucket | Out-Null
    aws ssm put-parameter --region $Region --name /smartcontable/domain --type String --overwrite --value $domain | Out-Null

    $archive = Join-Path $env:TEMP "smartcontable-backend.zip"
    Remove-Item $archive -ErrorAction SilentlyContinue
    $backendPath = Join-Path $PSScriptRoot "..\backend"
    $archiveItems = Get-ChildItem -Path $backendPath -Force | Where-Object {
        $_.Name -notin @("venv", ".pytest_cache", "__pycache__") -and
        $_.Name -notlike ".env*"
    }
    Compress-Archive -Path $archiveItems.FullName -DestinationPath $archive -Force
    aws s3 cp $archive "s3://$bucket/releases/smartcontable-backend.zip" --region $Region | Out-Null

    $commands = @(
        "set -euo pipefail",
        "dnf update -y",
        "dnf install -y docker",
        "systemctl enable --now docker",
        "usermod -aG docker ec2-user",
        "rm -rf /opt/smartcontable",
        "mkdir -p /opt/smartcontable",
        "aws s3 cp s3://$bucket/releases/smartcontable-backend.zip /tmp/smartcontable-backend.zip --region $Region",
        "unzip -oq /tmp/smartcontable-backend.zip -d /opt/smartcontable",
        "mkdir -p /usr/local/lib/docker/cli-plugins",
        "curl -SL https://github.com/docker/compose/releases/download/v2.39.2/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose",
        "chmod +x /usr/local/lib/docker/cli-plugins/docker-compose",
        "DATABASE_URL=`$(aws ssm get-parameter --name /smartcontable/database-url --with-decryption --region $Region --query Parameter.Value --output text)",
        "SECRET_KEY=`$(aws ssm get-parameter --name /smartcontable/secret-key --with-decryption --region $Region --query Parameter.Value --output text)",
        "S3_BUCKET=`$(aws ssm get-parameter --name /smartcontable/s3-bucket --region $Region --query Parameter.Value --output text)",
        "DOMAIN=`$(aws ssm get-parameter --name /smartcontable/domain --region $Region --query Parameter.Value --output text)",
        "printf '%s\n' `"DATABASE_URL=`$DATABASE_URL`" `"SECRET_KEY=`$SECRET_KEY`" 'ENVIRONMENT=production' 'DEBUG=false' 'CORS_ORIGINS=https://smartcontable-beta.vercel.app' 'S3_ENABLED=true' `"S3_BUCKET=`$S3_BUCKET`" 'AWS_REGION=$Region' > /opt/smartcontable/.env.production",
        "printf '%s\n%s\n%s\n' `"`$DOMAIN {`" '    reverse_proxy backend:8000' '}' > /opt/smartcontable/Caddyfile",
        "cd /opt/smartcontable && docker compose -f docker-compose.prod.yml up -d --build"
    )
    $commandId = aws ssm send-command --region $Region --instance-ids $instanceId --document-name AWS-RunShellScript --parameters ("commands=" + ($commands | ConvertTo-Json -Compress)) --query "Command.CommandId" --output text
    Write-Output "SSM command started: $commandId"
    Write-Output "Backend URL: https://$domain"
}
finally {
    if ($rdsPasswordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($rdsPasswordPointer) }
    if ($secretKeyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretKeyPointer) }
    Remove-Variable rdsPasswordValue, encodedRdsPassword, secretKeyValue, databaseUrl, databaseUri -ErrorAction SilentlyContinue
}