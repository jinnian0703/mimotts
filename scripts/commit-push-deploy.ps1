[CmdletBinding()]
param(
    [string] $Root = "",
    [string] $Message = "",
    [string] $Remote = "origin",
    [string] $Branch = "",
    [string] $HostName = "",
    [string] $User = "",
    [string] $Target = "",
    [string] $SiteName = "",
    [string] $KeyPath = "",
    [string] $PhpPath = "",
    [string] $SmokeUrl = "",
    [string] $InstallStatusUrl = "",
    [switch] $RunMigrations,
    [switch] $SkipTests,
    [switch] $SkipVerify,
    [switch] $SkipDeploy,
    [switch] $SkipSmoke
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $Root = Join-Path $scriptDir ".."
}

$rootPath = (Resolve-Path $Root).Path
$frontendPath = Join-Path $rootPath "frontend"
$backendPath = Join-Path $rootPath "backend"
$localConfigPath = Join-Path $rootPath ".codex\deploy.local.ps1"

$MimoDeployHost = ""
$MimoDeployUser = ""
$MimoDeployTarget = ""
$MimoDeploySiteName = ""
$MimoDeployKeyPath = ""
$MimoPhpPath = ""
$MimoSmokeUrl = ""
$MimoInstallStatusUrl = ""

if (Test-Path -LiteralPath $localConfigPath) {
    . $localConfigPath
}

function First-Value {
    foreach ($value in $args) {
        if (-not [string]::IsNullOrWhiteSpace([string] $value)) {
            return [string] $value
        }
    }

    return ""
}

function Invoke-Step {
    param(
        [string] $Name,
        [scriptblock] $Action
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Action
}

function Invoke-Native {
    param(
        [string] $FilePath,
        [string[]] $Arguments,
        [string] $WorkingDirectory = $rootPath
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
        }
    } finally {
        Pop-Location
    }
}

function Restore-BackendDevDependencies {
    $composerPath = Join-Path $rootPath "dist\composer-2.6.6.phar"
    if (-not (Test-Path -LiteralPath $composerPath)) {
        return
    }

    Invoke-Step "Restore backend dev dependencies" {
        Invoke-Native -FilePath $script:ResolvedPhpPath -Arguments @(
            $composerPath,
            "install",
            "--working-dir",
            $backendPath,
            "--no-interaction",
            "--no-progress"
        )
    }
}

$HostName = First-Value $HostName $env:MIMO_DEPLOY_HOST $MimoDeployHost
$User = First-Value $User $env:MIMO_DEPLOY_USER $MimoDeployUser "root"
$Target = First-Value $Target $env:MIMO_DEPLOY_TARGET $MimoDeployTarget
$SiteName = First-Value $SiteName $env:MIMO_DEPLOY_SITE_NAME $MimoDeploySiteName
$KeyPath = First-Value $KeyPath $env:MIMO_DEPLOY_KEY $MimoDeployKeyPath
$PhpPath = First-Value $PhpPath $env:MIMO_PHP_PATH $MimoPhpPath
$SmokeUrl = First-Value $SmokeUrl $env:MIMO_DEPLOY_SMOKE_URL $MimoSmokeUrl
$InstallStatusUrl = First-Value $InstallStatusUrl $env:MIMO_DEPLOY_INSTALL_STATUS_URL $MimoInstallStatusUrl

if ([string]::IsNullOrWhiteSpace($PhpPath)) {
    $PhpPath = "php"
}

$script:ResolvedPhpPath = $PhpPath

Invoke-Step "Repository status" {
    Invoke-Native -FilePath "git" -Arguments @("status", "--short")
}

if (-not $SkipTests) {
    Invoke-Step "Frontend lint" {
        Invoke-Native -FilePath "npm" -Arguments @("run", "lint") -WorkingDirectory $frontendPath
    }

    Invoke-Step "Frontend build" {
        Invoke-Native -FilePath "npm" -Arguments @("run", "build") -WorkingDirectory $frontendPath
    }

    if (Test-Path -LiteralPath (Join-Path $backendPath "vendor\bin\phpunit")) {
        Invoke-Step "Backend tests" {
            Invoke-Native -FilePath $script:ResolvedPhpPath -Arguments @("vendor/bin/phpunit") -WorkingDirectory $backendPath
        }
    } else {
        Write-Host "Skipping backend tests: backend/vendor/bin/phpunit not found." -ForegroundColor Yellow
    }
}

if (-not $SkipVerify) {
    Invoke-Step "Project verification" {
        Invoke-Native -FilePath "powershell" -Arguments @(
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            (Join-Path $rootPath "scripts\verify.ps1")
        )
    }
}

Invoke-Step "Stage changes" {
    Invoke-Native -FilePath "git" -Arguments @("add", "-A")
}

$hasStagedChanges = $true
& git -C $rootPath diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    $hasStagedChanges = $false
} elseif ($LASTEXITCODE -ne 1) {
    throw "Unable to inspect staged changes."
}

if ($hasStagedChanges) {
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "Update MimoTTS"
    }

    Invoke-Step "Commit changes" {
        Invoke-Native -FilePath "git" -Arguments @("commit", "-m", $Message)
    }
} else {
    Write-Host "No staged changes. Commit skipped." -ForegroundColor Yellow
}

if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = (& git -C $rootPath rev-parse --abbrev-ref HEAD).Trim()
}

if ([string]::IsNullOrWhiteSpace($Branch) -or $Branch -eq "HEAD") {
    throw "Cannot push from a detached HEAD. Pass -Branch explicitly."
}

Invoke-Step "Push $Remote/$Branch" {
    Invoke-Native -FilePath "git" -Arguments @("push", $Remote, $Branch)
}

if (-not $SkipDeploy) {
    if ([string]::IsNullOrWhiteSpace($HostName)) {
        throw "Missing deploy host. Set .codex/deploy.local.ps1, MIMO_DEPLOY_HOST, or pass -HostName."
    }
    if ([string]::IsNullOrWhiteSpace($Target)) {
        throw "Missing deploy target. Set .codex/deploy.local.ps1, MIMO_DEPLOY_TARGET, or pass -Target."
    }
    if ([string]::IsNullOrWhiteSpace($KeyPath)) {
        throw "Missing deploy key. Set .codex/deploy.local.ps1, MIMO_DEPLOY_KEY, or pass -KeyPath."
    }

    try {
        Invoke-Step "Deploy source package" {
            $deployArgs = @(
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                (Join-Path $rootPath "scripts\upload-source-upload.ps1"),
                "-HostName",
                $HostName,
                "-User",
                $User,
                "-Target",
                $Target,
                "-KeyPath",
                $KeyPath
            )

            if (-not [string]::IsNullOrWhiteSpace($SiteName)) {
                $deployArgs += @("-SiteName", $SiteName)
            }
            if ($RunMigrations) {
                $deployArgs += "-RunMigrations"
            }

            $previousPhpPath = $env:MIMO_PHP_PATH
            $env:MIMO_PHP_PATH = $script:ResolvedPhpPath
            try {
                Invoke-Native -FilePath "powershell" -Arguments $deployArgs
            } finally {
                if ($null -eq $previousPhpPath) {
                    Remove-Item Env:MIMO_PHP_PATH -ErrorAction SilentlyContinue
                } else {
                    $env:MIMO_PHP_PATH = $previousPhpPath
                }
            }
        }
    } finally {
        Restore-BackendDevDependencies
    }
}

if (-not $SkipSmoke) {
    if (-not [string]::IsNullOrWhiteSpace($SmokeUrl)) {
        Invoke-Step "Smoke test homepage" {
            $response = Invoke-WebRequest -Uri $SmokeUrl -UseBasicParsing -TimeoutSec 20
            if ($response.StatusCode -ne 200) {
                throw "Smoke test failed: $SmokeUrl returned $($response.StatusCode)."
            }
            Write-Host "Homepage OK: $($response.StatusCode)"
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($InstallStatusUrl)) {
        Invoke-Step "Smoke test install status" {
            $response = Invoke-WebRequest -Uri $InstallStatusUrl -UseBasicParsing -TimeoutSec 20
            if ($response.StatusCode -ne 200) {
                throw "Install status failed: $InstallStatusUrl returned $($response.StatusCode)."
            }
            if ($response.Content -notmatch '"installed"\s*:\s*true') {
                throw "Install status did not report installed=true."
            }
            Write-Host "Install status OK: installed=true"
        }
    }
}

Invoke-Step "Final git status" {
    Invoke-Native -FilePath "git" -Arguments @("status", "--short")
}

Write-Host ""
Write-Host "Commit, push, and deploy workflow completed." -ForegroundColor Green
