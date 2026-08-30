param(
    [Parameter(Mandatory = $true)]
    [string]$AppSubnetId,
    [Parameter(Mandatory = $true)]
    [string[]]$DbSubnetIds,
    [string]$StackName = "smartcontable-pilot",
    [string]$Region = "us-east-2"
)

$template = Join-Path $PSScriptRoot "..\infra\aws\smartcontable.yaml"
$vpcId = aws ec2 describe-vpcs --region $Region --filters Name=is-default,Values=true --query "Vpcs[0].VpcId" --output text
if (-not $vpcId -or $vpcId -eq "None") {
    throw "No se encontro una VPC predeterminada en $Region."
}

$securePassword = Read-Host "Contrasena maestra de RDS (minimo 16 caracteres)" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $dbPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if (
        $dbPassword.Length -lt 16 -or
        $dbPassword -notmatch '^[\x21-\x7E]+$' -or
        $dbPassword -match '[/@"]'
    ) {
        throw "La contrasena RDS debe tener al menos 16 caracteres ASCII imprimibles y no puede incluir /, @, comillas dobles ni espacios."
    }

    aws cloudformation deploy `
        --region $Region `
        --stack-name $StackName `
        --template-file $template `
        --capabilities CAPABILITY_NAMED_IAM `
        --parameter-overrides `
            VpcId=$vpcId `
            AppSubnetId=$AppSubnetId `
            DbSubnetIds=$($DbSubnetIds -join ',') `
            DbMasterPassword=$dbPassword
}
finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    Remove-Variable dbPassword -ErrorAction SilentlyContinue
}