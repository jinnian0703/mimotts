param(
    [string] $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string] $HostName = $env:MIMO_DEPLOY_HOST,
    [string] $User = $(if ($env:MIMO_DEPLOY_USER) { $env:MIMO_DEPLOY_USER } else { "root" }),
    [string] $Target = $env:MIMO_DEPLOY_TARGET,
    [string] $SiteName = $env:MIMO_DEPLOY_SITE_NAME,
    [string] $KeyPath = $env:MIMO_DEPLOY_KEY,
    [switch] $SkipBuild,
    [switch] $RunMigrations
)

$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path $Root).Path
$zipPath = Join-Path $rootPath "dist\mimo-source-upload.zip"

if ([string]::IsNullOrWhiteSpace($HostName)) {
    throw "Missing deploy host. Pass -HostName or set MIMO_DEPLOY_HOST."
}

if ([string]::IsNullOrWhiteSpace($Target)) {
    throw "Missing deploy target. Pass -Target or set MIMO_DEPLOY_TARGET."
}

if ([string]::IsNullOrWhiteSpace($KeyPath)) {
    throw "Missing SSH key path. Pass -KeyPath or set MIMO_DEPLOY_KEY."
}

if ([string]::IsNullOrWhiteSpace($SiteName)) {
    $SiteName = Split-Path -Leaf $Target
}

if (-not $SkipBuild) {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $rootPath "scripts\build-source-upload.ps1") -Root $rootPath
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed."
    }
}

if (-not (Test-Path -LiteralPath $zipPath)) {
    throw "Missing upload package: $zipPath"
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "Missing SSH key: $KeyPath"
}

$remote = "$User@$HostName"
$remoteZip = "/tmp/mimo-source-upload.zip"
$runMigrationsValue = if ($RunMigrations -or $env:MIMO_DEPLOY_RUN_MIGRATIONS -eq "1") { "1" } else { "0" }
$remoteScript = @"
set -euo pipefail
TARGET="$Target"
SITE_NAME="$SiteName"
ZIP="$remoteZip"
RUN_MIGRATIONS="$runMigrationsValue"
STAGING="/tmp/mimo-source-upload-`$SITE_NAME"
BACKUP_DIR="/root/mimo-backups"
STAMP=`$(date +%Y%m%d_%H%M%S)
BACKUP="`$BACKUP_DIR/`$SITE_NAME-`$STAMP.tar.gz"

[ -d "`$TARGET" ]
[ -f "`$ZIP" ]
mkdir -p "`$BACKUP_DIR"
tar -czf "`$BACKUP" -C "`$(dirname "`$TARGET")" "`$(basename "`$TARGET")"
rm -rf "`$STAGING"
mkdir -p "`$STAGING"
unzip -q "`$ZIP" -d "`$STAGING"
[ -f "`$STAGING/index.html" ]
[ -f "`$STAGING/api.php" ]
[ -f "`$STAGING/backend/bootstrap/app.php" ]
rm -rf "`$TARGET/_next"
rsync -a \
  --exclude='.user.ini' \
  --exclude='backend/.env' \
  --exclude='backend/storage/app/audio/uploads/***' \
  --exclude='backend/storage/app/audio/generated/***' \
  --exclude='backend/storage/app/public/site-icons/***' \
  --exclude='backend/storage/logs/***' \
  --exclude='backend/storage/framework/cache/data/***' \
  --exclude='backend/storage/framework/sessions/***' \
  --exclude='backend/storage/framework/views/***' \
  "`$STAGING"/ "`$TARGET"/
chown -R www:www "`$TARGET/backend" "`$TARGET/_next" 2>/dev/null || true
find "`$TARGET/backend/storage" "`$TARGET/backend/bootstrap/cache" -type d -exec chmod 775 {} + 2>/dev/null || true
find "`$TARGET/backend/storage" "`$TARGET/backend/bootstrap/cache" -type f -exec chmod 664 {} + 2>/dev/null || true
php -l "`$TARGET/api.php"
php -l "`$TARGET/backend/app/Services/EmailTemplateService.php"
php -l "`$TARGET/backend/app/Http/Controllers/InstallController.php"
php -l "`$TARGET/backend/app/Http/Controllers/HealthController.php"
php -l "`$TARGET/backend/app/Http/Controllers/UpdateController.php"
php -l "`$TARGET/backend/app/Services/HealthCheckService.php"
php -l "`$TARGET/backend/app/Services/UpdateService.php"
if [ "`$RUN_MIGRATIONS" = "1" ]; then
  (cd "`$TARGET/backend" && php artisan migrate --force)
  echo "MIGRATIONS=ran"
else
  echo "MIGRATIONS=skipped"
  echo "MIGRATIONS_HINT=run upload script with -RunMigrations after source changes that include database migrations"
fi
echo "BACKUP=`$BACKUP"
echo "TARGET=`$TARGET"
echo "DEPLOYED_AT=`$(date '+%Y-%m-%d %H:%M:%S')"
"@

$localRemoteScript = Join-Path ([System.IO.Path]::GetTempPath()) ("mimo-deploy-" + [guid]::NewGuid().ToString("N") + ".sh")

try {
    [System.IO.File]::WriteAllText(
        $localRemoteScript,
        $remoteScript,
        [System.Text.UTF8Encoding]::new($false)
    )

    scp -i $KeyPath -o BatchMode=yes $zipPath "${remote}:$remoteZip"
    if ($LASTEXITCODE -ne 0) {
        throw "Upload failed."
    }

    scp -i $KeyPath -o BatchMode=yes $localRemoteScript "${remote}:/tmp/mimo-deploy.sh"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote script upload failed."
    }

    ssh -i $KeyPath -o BatchMode=yes $remote "bash /tmp/mimo-deploy.sh; status=`$?; rm -f /tmp/mimo-deploy.sh; exit `$status"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote deploy failed."
    }
} finally {
    if (Test-Path -LiteralPath $localRemoteScript) {
        Remove-Item -LiteralPath $localRemoteScript -Force
    }
}
