param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot ".env.oci"),
    [string]$ApprovedCommit = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Read-KeyValueFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "OCI config file not found: $Path"
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $separator = $trimmed.IndexOf("=")
        if ($separator -lt 1) { throw "Invalid KEY=VALUE line in OCI config" }
        $key = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        $values[$key] = $value
    }
    return $values
}

function Require-Value {
    param([hashtable]$Values, [string]$Name)
    if (-not $Values.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Values[$Name])) {
        throw "Required OCI config value is missing: $Name"
    }
    return [string]$Values[$Name]
}

function Invoke-External {
    param([string]$Name, [string[]]$Arguments)
    & $Name @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

function Assert-SafeValue {
    param([string]$Name, [string]$Value, [string]$Pattern)
    if ($Value -notmatch $Pattern) { throw "Unsafe or invalid $Name" }
}

$config = Read-KeyValueFile -Path $ConfigPath
$hostName = Require-Value $config "AIRFLOW_HOST"
$sshUser = Require-Value $config "AIRFLOW_SSH_USER"
$sshKey = Require-Value $config "AIRFLOW_SSH_KEY_PATH"
$remoteDir = Require-Value $config "REMOTE_AIRFLOW_DIR"
$dataRoot = Require-Value $config "DDARUNG_DATA_ROOT"
$zeroCost = Require-Value $config "AIRFLOW_ZERO_COST_CONFIRMED"

if ($zeroCost -ne "YES") { throw "AIRFLOW_ZERO_COST_CONFIRMED must be YES before deployment" }
if (-not (Test-Path -LiteralPath $sshKey -PathType Leaf)) { throw "SSH key file not found" }

Assert-SafeValue "AIRFLOW_HOST" $hostName '^[A-Za-z0-9.-]+$'
Assert-SafeValue "AIRFLOW_SSH_USER" $sshUser '^[A-Za-z0-9._-]+$'
Assert-SafeValue "REMOTE_AIRFLOW_DIR" $remoteDir '^/[A-Za-z0-9._/-]+$'
Assert-SafeValue "DDARUNG_DATA_ROOT" $dataRoot '^/[A-Za-z0-9._/-]+$'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$head = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Unable to read Git HEAD" }
if ([string]::IsNullOrWhiteSpace($ApprovedCommit)) { $ApprovedCommit = $head }
if ($ApprovedCommit -ne $head) { throw "Approved commit does not match current HEAD" }
Assert-SafeValue "ApprovedCommit" $ApprovedCommit '^[0-9a-f]{40}$'

$originUrl = (& git -C $repoRoot remote get-url origin).Trim()
if ($LASTEXITCODE -ne 0) { throw "Unable to read Git origin remote" }
$target = "$sshUser@$hostName"

Write-Output "Deploying approved commit $ApprovedCommit to $target`:$remoteDir"

# Airflow's image is built from the mounted pipeline source, not baked at
# image-build time, so there is nothing meaningful to push to a registry —
# the server keeps its own git checkout pinned to the approved commit and
# builds locally. This mirrors the existing dev docker-compose.yaml pattern
# instead of the frontend/backend OCIR build-push-pull flow in deploy-staging.ps1.
$cloneCommand = "if [ ! -d '$remoteDir/.git' ]; then git clone --no-checkout '$originUrl' '$remoteDir'; fi && cd '$remoteDir' && git fetch origin && git checkout --detach '$ApprovedCommit' && git status --short"
Invoke-External "ssh" @("-i", $sshKey, $target, $cloneCommand)

$mkdataCommand = "mkdir -p '$dataRoot/platform/raw' && chmod 700 '$dataRoot'"
Invoke-External "ssh" @("-i", $sshKey, $target, $mkdataCommand)

$remoteCommand = "cd '$remoteDir/infra/airflow' && test -f .env && chmod 600 .env && DDARUNG_DATA_ROOT='$dataRoot' docker compose --env-file .env -f docker-compose.yaml -f docker-compose.oci.yaml config --quiet && DDARUNG_DATA_ROOT='$dataRoot' docker compose --env-file .env -f docker-compose.yaml -f docker-compose.oci.yaml build && DDARUNG_DATA_ROOT='$dataRoot' docker compose --env-file .env -f docker-compose.yaml -f docker-compose.oci.yaml run --rm airflow-init && DDARUNG_DATA_ROOT='$dataRoot' docker compose --env-file .env -f docker-compose.yaml -f docker-compose.oci.yaml up -d postgres airflow-scheduler airflow-dag-processor airflow-api-server && DDARUNG_DATA_ROOT='$dataRoot' docker compose --env-file .env -f docker-compose.yaml -f docker-compose.oci.yaml ps"
Invoke-External "ssh" @("-i", $sshKey, $target, $remoteCommand)

Start-Sleep -Seconds 5
$healthStatusText = ""
for ($attempt = 1; $attempt -le 12; $attempt++) {
    $healthStatusText = (& ssh -i $sshKey $target "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/api/v2/monitor/health") -join ""
    if ($LASTEXITCODE -eq 0 -and $healthStatusText -match '^200$') { break }
    if ($attempt -lt 12) { Start-Sleep -Seconds 5 }
}
if ($healthStatusText -notmatch '^200$') { throw "Server-local Airflow api-server health check failed" }

Write-Output "Deploy complete. Server-local api-server health=$healthStatusText"
Write-Output "Access is loopback-only. Use an SSH tunnel to reach the UI: ssh -i <key> -L 8080:127.0.0.1:8080 $target"
Write-Warning "Every DAG remains schedule=None (manual-run only) unless a separate, CHG-092-approved code change turns it on. This script does not and cannot change that."
Write-Warning "Never stop the shared compute instance. This is a second, independent Compose project alongside crawling_server and staging."
