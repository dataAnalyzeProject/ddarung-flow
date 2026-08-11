param(
    [Parameter(Mandatory = $true)]
    [string]$PreviousTag,
    [string]$ConfigPath = (Join-Path $PSScriptRoot ".env.oci")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Read-KeyValueFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "OCI config file not found: $Path" }
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $separator = $trimmed.IndexOf("=")
        if ($separator -lt 1) { throw "Invalid KEY=VALUE line in OCI config" }
        $values[$trimmed.Substring(0, $separator).Trim()] = $trimmed.Substring($separator + 1).Trim()
    }
    return $values
}

function Require-Value {
    param([hashtable]$Values, [string]$Name)
    if (-not $Values.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Values[$Name])) { throw "Required OCI config value is missing: $Name" }
    return [string]$Values[$Name]
}

function Invoke-External {
    param([string]$Name, [string[]]$Arguments)
    & $Name @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

if ($PreviousTag -notmatch '^[0-9a-f]{7,40}$') { throw "PreviousTag must be an approved Git SHA tag" }

$config = Read-KeyValueFile -Path $ConfigPath
$registry = Require-Value $config "OCI_REGISTRY"
$namespace = Require-Value $config "OCI_NAMESPACE"
$repository = Require-Value $config "OCI_REPOSITORY"
$hostName = Require-Value $config "STAGING_HOST"
$sshUser = Require-Value $config "STAGING_SSH_USER"
$sshKey = Require-Value $config "STAGING_SSH_KEY_PATH"
$remoteDir = Require-Value $config "REMOTE_APP_DIR"
$publicUrl = (Require-Value $config "STAGING_PUBLIC_URL").TrimEnd("/")
$zeroCost = Require-Value $config "OCI_ZERO_COST_CONFIRMED"

if ($zeroCost -ne "YES") { throw "OCI_ZERO_COST_CONFIRMED must remain YES during rollback" }
if (-not (Test-Path -LiteralPath $sshKey -PathType Leaf)) { throw "SSH key file not found" }
if ($registry -notmatch '^[A-Za-z0-9.-]+$' -or $namespace -notmatch '^[A-Za-z0-9_-]+$' -or $repository -notmatch '^[A-Za-z0-9._/-]+$') { throw "Invalid registry configuration" }
if ($hostName -notmatch '^[A-Za-z0-9.-]+$' -or $sshUser -notmatch '^[A-Za-z0-9._-]+$' -or $remoteDir -notmatch '^/[A-Za-z0-9._/-]+$') { throw "Invalid remote configuration" }
if ($publicUrl -notmatch '^https?://[A-Za-z0-9.:-]+$') { throw "Invalid STAGING_PUBLIC_URL" }

$imageBase = "$registry/$namespace/$repository"
$frontendImage = "$imageBase/frontend:$PreviousTag"
$backendImage = "$imageBase/backend:$PreviousTag"
$target = "$sshUser@$hostName"
$releaseFile = [System.IO.Path]::GetTempFileName()

try {
    @(
        "FRONTEND_IMAGE=$frontendImage"
        "BACKEND_IMAGE=$backendImage"
        "REACT_APP_API_BASE_URL=$publicUrl"
        "DEPLOYED_COMMIT=$PreviousTag"
    ) | Set-Content -LiteralPath $releaseFile -Encoding Ascii

    Invoke-External "scp" @("-i", $sshKey, $releaseFile, "${target}:${remoteDir}/release.env")
    $remoteCommand = "cd '$remoteDir' && test -f .env && chmod 600 .env release.env && docker compose --env-file .env --env-file release.env -f docker-compose.yaml config --quiet && docker compose --env-file .env --env-file release.env -f docker-compose.yaml pull frontend backend && docker compose --env-file .env --env-file release.env -f docker-compose.yaml up -d --no-build && docker compose --env-file .env --env-file release.env -f docker-compose.yaml ps && docker compose --env-file .env --env-file release.env -f docker-compose.yaml exec -T postgres sh -c 'pg_isready -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`"'"
    Invoke-External "ssh" @("-i", $sshKey, $target, $remoteCommand)
}
finally {
    Remove-Item -LiteralPath $releaseFile -Force -ErrorAction SilentlyContinue
}

$frontendStatus = [int](curl.exe -s -o NUL -w "%{http_code}" $publicUrl)
if ($frontendStatus -ne 200) { throw "Rollback frontend HTTP check failed: $frontendStatus" }
$proxyStatus = 0
for ($attempt = 1; $attempt -le 18; $attempt++) {
    $proxyStatus = [int](curl.exe -s -o NUL -w "%{http_code}" "$publicUrl/api/v1/auth/me")
    if ($proxyStatus -in @(200, 401, 403)) { break }
    if ($attempt -lt 18) { Start-Sleep -Seconds 5 }
}
if ($proxyStatus -notin @(200, 401, 403)) { throw "Rollback proxy check failed after readiness wait: $proxyStatus" }

Write-Output "Rollback smoke passed for tag ${PreviousTag}: frontend=$frontendStatus proxy=$proxyStatus"
Write-Warning "This deployment reuses crawling_server. Never stop the compute instance; stop only the ddarung-flow-staging Compose project when staging validation ends."
