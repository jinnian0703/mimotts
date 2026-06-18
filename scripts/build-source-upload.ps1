param(
    [string] $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string] $Output = "dist"
)

$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path $Root).Path
$frontendPath = Join-Path $rootPath "frontend"
$backendPath = Join-Path $rootPath "backend"
$distPath = Join-Path $rootPath $Output
$packagePath = Join-Path $distPath "source-upload"
$buildPackagePath = Join-Path $distPath ("source-upload-build-" + [guid]::NewGuid().ToString("N"))
$oldPackagePath = Join-Path $distPath ("source-upload-old-" + [guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $distPath "mimo-source-upload.zip"
$composerVersion = "2.6.6"
$composerPath = Join-Path $distPath "composer-$composerVersion.phar"

function Assert-Path {
    param(
        [string] $Path,
        [string] $Message
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw $Message
    }
}

function Copy-Directory {
    param(
        [string] $Source,
        [string] $Destination,
        [string[]] $Exclude = @()
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
        if ($Exclude -contains $item.Name) {
            continue
        }

        $target = Join-Path $Destination $item.Name
        if ($item.PSIsContainer) {
            Copy-Directory -Source $item.FullName -Destination $target -Exclude $Exclude
        } else {
            Copy-Item -LiteralPath $item.FullName -Destination $target -Force
        }
    }
}

function Clear-DirectoryContent {
    param([string] $Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
        return
    }

    Get-ChildItem -LiteralPath $Path -Force | Where-Object { $_.Name -ne ".gitkeep" } | Remove-Item -Recurse -Force
}

function Remove-IfExists {
    param([string] $Path)

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function New-PortableZip {
    param(
        [string] $Source,
        [string] $Destination
    )

    Add-Type -AssemblyName System.IO.Compression
    $sourcePath = (Resolve-Path $Source).Path.TrimEnd("\", "/")
    $stream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::CreateNew)
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)

    try {
        Get-ChildItem -LiteralPath $sourcePath -Force -Recurse | ForEach-Object {
            $relative = $_.FullName.Substring($sourcePath.Length).TrimStart("\", "/")
            $entryName = $relative -replace "\\", "/"

            if ($_.PSIsContainer) {
                if (-not $entryName.EndsWith("/")) {
                    $entryName = "$entryName/"
                }
                [void] $archive.CreateEntry($entryName)
                return
            }

            $entry = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
            $entryStream = $entry.Open()
            $fileStream = [System.IO.File]::OpenRead($_.FullName)

            try {
                $fileStream.CopyTo($entryStream)
            } finally {
                $fileStream.Dispose()
                $entryStream.Dispose()
            }
        }
    } finally {
        $archive.Dispose()
        $stream.Dispose()
    }
}

function Get-GitValue {
    param([string[]] $Arguments)

    try {
        $value = & git -C $rootPath @Arguments 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($value)) {
            return ($value | Select-Object -First 1).Trim()
        }
    } catch {
        return $null
    }

    return $null
}

New-Item -ItemType Directory -Force -Path $distPath | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backendPath "bootstrap/cache") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backendPath "storage/framework/cache") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backendPath "storage/framework/sessions") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $backendPath "storage/framework/views") | Out-Null

if (-not (Test-Path $composerPath)) {
    Invoke-WebRequest -Uri "https://getcomposer.org/download/$composerVersion/composer.phar" -OutFile $composerPath
}

& php $composerPath install --working-dir $backendPath --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader
if ($LASTEXITCODE -ne 0) {
    throw "Composer install failed."
}

Push-Location $frontendPath
try {
    Remove-IfExists -Path (Join-Path $frontendPath ".next")
    Remove-IfExists -Path (Join-Path $frontendPath "out")
    $env:NEXT_PUBLIC_API_BASE_URL = "/api.php?r="
    $env:NEXT_TELEMETRY_DISABLED = "1"
    & npm install --no-audit --fund=false
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend dependency install failed."
    }
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed."
    }
} finally {
    Pop-Location
}

New-Item -ItemType Directory -Force -Path $buildPackagePath | Out-Null

Copy-Directory -Source (Join-Path $frontendPath "out") -Destination $buildPackagePath
Copy-Item -LiteralPath (Join-Path $rootPath "deploy/source/api.php") -Destination (Join-Path $buildPackagePath "api.php") -Force
Copy-Item -LiteralPath (Join-Path $rootPath "deploy/source/README-UPLOAD.txt") -Destination (Join-Path $buildPackagePath "README.txt") -Force
Copy-Item -LiteralPath (Join-Path $rootPath "deploy/source/README-UPLOAD.txt") -Destination (Join-Path $buildPackagePath "README.md") -Force

Copy-Directory -Source $backendPath -Destination (Join-Path $buildPackagePath "backend") -Exclude @(".env", "tests", ".phpunit.result.cache")

$buildInfo = [ordered]@{
    version = (Get-GitValue -Arguments @("describe", "--tags", "--always", "--dirty"))
    commit = (Get-GitValue -Arguments @("rev-parse", "--short", "HEAD"))
    built_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

if ([string]::IsNullOrWhiteSpace($buildInfo.version)) {
    $buildInfo.version = "dev"
}

$buildInfoJson = $buildInfo | ConvertTo-Json
[System.IO.File]::WriteAllText(
    (Join-Path $buildPackagePath "backend/build.json"),
    $buildInfoJson,
    [System.Text.UTF8Encoding]::new($false)
)

$runtimeDirs = @(
    "backend/storage/app/audio/uploads",
    "backend/storage/app/audio/generated",
    "backend/storage/framework/cache",
    "backend/storage/framework/sessions",
    "backend/storage/framework/views",
    "backend/storage/logs",
    "backend/bootstrap/cache"
)

foreach ($dir in $runtimeDirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $buildPackagePath $dir) | Out-Null
}

Clear-DirectoryContent -Path (Join-Path $buildPackagePath "backend/storage/app/audio/uploads")
Clear-DirectoryContent -Path (Join-Path $buildPackagePath "backend/storage/app/audio/generated")
Clear-DirectoryContent -Path (Join-Path $buildPackagePath "backend/storage/framework/cache")
Clear-DirectoryContent -Path (Join-Path $buildPackagePath "backend/storage/framework/sessions")
Clear-DirectoryContent -Path (Join-Path $buildPackagePath "backend/storage/framework/views")
Clear-DirectoryContent -Path (Join-Path $buildPackagePath "backend/storage/logs")

New-Item -ItemType Directory -Force -Path (Join-Path $buildPackagePath "backend/storage/framework/cache/data") | Out-Null
Remove-IfExists -Path (Join-Path $buildPackagePath "backend/bootstrap/cache/config.php")
Remove-IfExists -Path (Join-Path $buildPackagePath "backend/bootstrap/cache/routes.php")
Remove-IfExists -Path (Join-Path $buildPackagePath "backend/bootstrap/cache/routes-v7.php")
Remove-IfExists -Path (Join-Path $buildPackagePath "backend/bootstrap/cache/events.php")
Remove-IfExists -Path (Join-Path $buildPackagePath "backend/bootstrap/cache/compiled.php")

Assert-Path -Path (Join-Path $buildPackagePath "index.html") -Message "Missing frontend index.html."
Assert-Path -Path (Join-Path $buildPackagePath "install/index.html") -Message "Missing frontend install page."
Assert-Path -Path (Join-Path $buildPackagePath "login/index.html") -Message "Missing frontend login page."
Assert-Path -Path (Join-Path $buildPackagePath "settings/index.html") -Message "Missing frontend settings page."
Assert-Path -Path (Join-Path $buildPackagePath "admin/index.html") -Message "Missing frontend admin page."
Assert-Path -Path (Join-Path $buildPackagePath "404/index.html") -Message "Missing frontend 404 page."
Assert-Path -Path (Join-Path $buildPackagePath "_next") -Message "Missing frontend assets."
Assert-Path -Path (Join-Path $buildPackagePath "api.php") -Message "Missing api.php."
Assert-Path -Path (Join-Path $buildPackagePath "backend/bootstrap/app.php") -Message "Missing backend bootstrap."
Assert-Path -Path (Join-Path $buildPackagePath "backend/vendor/autoload.php") -Message "Missing backend vendor autoload."
Assert-Path -Path (Join-Path $buildPackagePath "backend/build.json") -Message "Missing backend build metadata."
Assert-Path -Path (Join-Path $buildPackagePath "README.txt") -Message "Missing upload README."
Assert-Path -Path (Join-Path $buildPackagePath "README.md") -Message "Missing upload README.md."

if (Test-Path -LiteralPath (Join-Path $buildPackagePath "backend/.env")) {
    throw "backend/.env must not be included in source-upload."
}

if (Test-Path -LiteralPath (Join-Path $buildPackagePath ".user.ini")) {
    throw ".user.ini must not be included in source-upload; configure PHP limits in BaoTa instead."
}

if (Test-Path -LiteralPath (Join-Path $buildPackagePath "docker")) {
    throw "Docker directory must not be included in source-upload."
}

if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

New-PortableZip -Source $buildPackagePath -Destination $zipPath

if (Test-Path $packagePath) {
    Move-Item -LiteralPath $packagePath -Destination $oldPackagePath -Force
}
Move-Item -LiteralPath $buildPackagePath -Destination $packagePath -Force
if (Test-Path $oldPackagePath) {
    Remove-Item -LiteralPath $oldPackagePath -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "source-upload: $packagePath"
Write-Host "zip: $zipPath"
