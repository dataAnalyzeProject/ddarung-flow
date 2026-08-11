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
$registry = Require-Value $config "OCI_REGISTRY"
$namespace = Require-Value $config "OCI_NAMESPACE"
$repository = Require-Value $config "OCI_REPOSITORY"
$targetPlatform = Require-Value $config "TARGET_PLATFORM"
$hostName = Require-Value $config "STAGING_HOST"
$sshUser = Require-Value $config "STAGING_SSH_USER"
$sshKey = Require-Value $config "STAGING_SSH_KEY_PATH"
$remoteDir = Require-Value $config "REMOTE_APP_DIR"
$stagingFrontendPort = Require-Value $config "STAGING_FRONTEND_PORT"
$publicUrl = (Require-Value $config "STAGING_PUBLIC_URL").TrimEnd("/")
$zeroCost = Require-Value $config "OCI_ZERO_COST_CONFIRMED"
$lifecycleMode = Require-Value $config "STAGING_LIFECYCLE_MODE"

if ($zeroCost -ne "YES") { throw "OCI_ZERO_COST_CONFIRMED must be YES before deployment" }
if ($lifecycleMode -ne "CONTINUOUS_STAGING") { throw "STAGING_LIFECYCLE_MODE must be CONTINUOUS_STAGING" }
if (-not (Test-Path -LiteralPath $sshKey -PathType Leaf)) { throw "SSH key file not found" }

Assert-SafeValue "OCI_REGISTRY" $registry '^[A-Za-z0-9.-]+$'
Assert-SafeValue "OCI_NAMESPACE" $namespace '^[A-Za-z0-9_-]+$'
Assert-SafeValue "OCI_REPOSITORY" $repository '^[A-Za-z0-9._/-]+$'
if ($targetPlatform -notin @("linux/arm64", "linux/amd64")) { throw "TARGET_PLATFORM must be linux/arm64 or linux/amd64" }
Assert-SafeValue "STAGING_HOST" $hostName '^[A-Za-z0-9.-]+$'
Assert-SafeValue "STAGING_SSH_USER" $sshUser '^[A-Za-z0-9._-]+$'
Assert-SafeValue "REMOTE_APP_DIR" $remoteDir '^/[A-Za-z0-9._/-]+$'
Assert-SafeValue "STAGING_FRONTEND_PORT" $stagingFrontendPort '^[0-9]{1,5}$'
Assert-SafeValue "STAGING_PUBLIC_URL" $publicUrl '^https?://[A-Za-z0-9.:-]+$'
if ([int]$stagingFrontendPort -lt 1 -or [int]$stagingFrontendPort -gt 65535) { throw "STAGING_FRONTEND_PORT is out of range" }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$head = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Unable to read Git HEAD" }
if ([string]::IsNullOrWhiteSpace($ApprovedCommit)) { $ApprovedCommit = $head }
if ($ApprovedCommit -ne $head) { throw "Approved commit does not match current HEAD" }
Assert-SafeValue "ApprovedCommit" $ApprovedCommit '^[0-9a-f]{40}$'

$tag = $ApprovedCommit.Substring(0, 12)
$imageBase = "$registry/$namespace/$repository"
$frontendImage = "$imageBase/frontend:$tag"
$backendImage = "$imageBase/backend:$tag"
$target = "$sshUser@$hostName"

Write-Output "Building approved commit $tag"
Invoke-External "docker" @("buildx", "build", "--platform", $targetPlatform, "--build-arg", "REACT_APP_API_BASE_URL=$publicUrl", "-t", $frontendImage, "--push", (Join-Path $repoRoot "frontend"))
Invoke-External "docker" @("buildx", "build", "--platform", $targetPlatform, "-t", $backendImage, "--push", (Join-Path $repoRoot "backend"))

$frontendInspect = (& docker buildx imagetools inspect $frontendImage) -join "`n"
if ($LASTEXITCODE -ne 0) { throw "Unable to inspect frontend registry image" }
$frontendDigestMatch = [regex]::Match($frontendInspect, 'Digest:\s+(sha256:[0-9a-f]{64})')
if (-not $frontendDigestMatch.Success) { throw "Frontend registry digest was not recorded" }
$frontendDigest = "$imageBase/frontend@$($frontendDigestMatch.Groups[1].Value)"

$backendInspect = (& docker buildx imagetools inspect $backendImage) -join "`n"
if ($LASTEXITCODE -ne 0) { throw "Unable to inspect backend registry image" }
$backendDigestMatch = [regex]::Match($backendInspect, 'Digest:\s+(sha256:[0-9a-f]{64})')
if (-not $backendDigestMatch.Success) { throw "Backend registry digest was not recorded" }
$backendDigest = "$imageBase/backend@$($backendDigestMatch.Groups[1].Value)"

$releaseFile = [System.IO.Path]::GetTempFileName()
try {
    @(
        "FRONTEND_IMAGE=$frontendImage"
        "BACKEND_IMAGE=$backendImage"
        "REACT_APP_API_BASE_URL=$publicUrl"
    ) | Set-Content -LiteralPath $releaseFile -Encoding Ascii

    Invoke-External "ssh" @("-i", $sshKey, $target, "mkdir -p '$remoteDir'")
    Invoke-External "scp" @("-i", $sshKey, (Join-Path $PSScriptRoot "docker-compose.yaml"), "${target}:${remoteDir}/docker-compose.yaml")
    Invoke-External "scp" @("-i", $sshKey, $releaseFile, "${target}:${remoteDir}/release.env")

    $remoteCommand = "cd '$remoteDir' && test -f .env && chmod 600 .env release.env && docker compose --env-file .env --env-file release.env -f docker-compose.yaml config --quiet && docker compose --env-file .env --env-file release.env -f docker-compose.yaml pull frontend backend postgres && docker compose --env-file .env --env-file release.env -f docker-compose.yaml up -d --no-build && docker compose --env-file .env --env-file release.env -f docker-compose.yaml ps && docker compose --env-file .env --env-file release.env -f docker-compose.yaml exec -T postgres sh -c 'pg_isready -U `"`$POSTGRES_USER`" -d `"`$POSTGRES_DB`"'"
    Invoke-External "ssh" @("-i", $sshKey, $target, $remoteCommand)
}
finally {
    Remove-Item -LiteralPath $releaseFile -Force -ErrorAction SilentlyContinue
}

$frontendStatusText = (& ssh -i $sshKey $target "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$stagingFrontendPort") -join ""
if ($LASTEXITCODE -ne 0 -or $frontendStatusText -notmatch '^200$') { throw "Server-local frontend HTTP check failed" }
$proxyStatusText = ""
for ($attempt = 1; $attempt -le 12; $attempt++) {
    $proxyStatusText = (& ssh -i $sshKey $target "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$stagingFrontendPort/api/v1/auth/me") -join ""
    if ($LASTEXITCODE -eq 0 -and $proxyStatusText -match '^(200|401|403)$') { break }
    if ($attempt -lt 12) { Start-Sleep -Seconds 5 }
}
if ($proxyStatusText -notmatch '^(200|401|403)$') { throw "Server-local frontend API proxy check failed after readiness wait" }

Write-Output "Runtime preparation passed: local frontend=$frontendStatusText proxy=$proxyStatusText"
Write-Output "frontend digest: $frontendDigest"
Write-Output "backend digest: $backendDigest"
Write-Output "Staging lifecycle: $lifecycleMode"
Write-Warning "Public smoke is not complete. Follow the runbook to back up and switch nginx, then verify $publicUrl."
Write-Warning "Never stop the compute instance. Keep ddarung active until an explicit project-leader instruction changes the route or staging lifecycle."
