[CmdletBinding()]
param(
    [string]$Root = '',
    [string[]]$ExpectedModels = @(),
    [switch]$FailOnWarnings
)

$ErrorActionPreference = 'Stop'

if (-not $Root) {
    $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $Root = (Resolve-Path (Join-Path $scriptDir '..')).Path
}

if (-not $ExpectedModels -and $env:MIMO_EXPECTED_MODELS) {
    $ExpectedModels = $env:MIMO_EXPECTED_MODELS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

$script:Results = New-Object System.Collections.Generic.List[object]

function Add-Check {
    param(
        [ValidateSet('PASS', 'FAIL', 'WARN')]
        [string]$Status,
        [string]$Area,
        [string]$Name,
        [string]$Detail,
        [string]$Evidence = ''
    )

    $script:Results.Add([pscustomobject]@{
        Status = $Status
        Area = $Area
        Name = $Name
        Detail = $Detail
        Evidence = $Evidence
    }) | Out-Null
}

function Test-PathCheck {
    param(
        [string]$Area,
        [string]$Name,
        [string[]]$RelativePaths,
        [switch]$Any,
        [switch]$WarnOnly
    )

    $existing = @()
    foreach ($relativePath in $RelativePaths) {
        $path = Join-Path $Root $relativePath
        if (Test-Path -LiteralPath $path) {
            $existing += $relativePath
        }
    }

    $ok = if ($Any) { $existing.Count -gt 0 } else { $existing.Count -eq $RelativePaths.Count }
    if ($ok) {
        Add-Check PASS $Area $Name 'Required path check passed.' ($existing -join ', ')
        return
    }

    $missing = $RelativePaths | Where-Object { $existing -notcontains $_ }
    $status = if ($WarnOnly) { 'WARN' } else { 'FAIL' }
    $detail = if ($Any) {
        'At least one expected path must exist.'
    } else {
        'One or more required paths are missing.'
    }
    Add-Check $status $Area $Name $detail ($missing -join ', ')
}

function Get-ProjectFiles {
    param([string[]]$Roots)

    $paths = New-Object System.Collections.Generic.List[string]
    foreach ($relativeRoot in $Roots) {
        $fullRoot = Join-Path $Root $relativeRoot
        if (-not (Test-Path -LiteralPath $fullRoot)) {
            continue
        }

        Get-ChildItem -LiteralPath $fullRoot -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object {
                $_.FullName -notmatch '\\(node_modules|vendor|storage\\logs|storage\\framework|\.next|dist|build|coverage)\\' -and
                (
                    $_.Extension -match '^\.(php|ts|tsx|js|jsx|mjs|json|env|yml|yaml|conf|md|css|scss|sh)$' -or
                    $_.Name -in @('Dockerfile', 'Makefile')
                )
            } |
            ForEach-Object { $paths.Add($_.FullName) | Out-Null }
    }
    return $paths.ToArray()
}

function Get-ExplicitFiles {
    param([string[]]$RelativePaths)

    $paths = New-Object System.Collections.Generic.List[string]
    foreach ($relativePath in $RelativePaths) {
        $fullPath = Join-Path $Root $relativePath
        if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
            $paths.Add((Resolve-Path -LiteralPath $fullPath).Path) | Out-Null
        }
    }
    return $paths.ToArray()
}

function Search-Patterns {
    param(
        [string[]]$Files,
        [string[]]$Patterns
    )

    $hits = New-Object System.Collections.Generic.List[object]
    foreach ($file in $Files) {
        $text = Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue
        if ($null -eq $text) {
            continue
        }

        foreach ($pattern in $Patterns) {
            if ($text -match $pattern) {
                $hits.Add([pscustomobject]@{
                    File = $file
                    Pattern = $pattern
                }) | Out-Null
            }
        }
    }
    return $hits.ToArray()
}

function Add-PatternCheck {
    param(
        [string]$Area,
        [string]$Name,
        [string[]]$Files,
        [string[]]$Patterns,
        [string]$PassDetail,
        [string]$FailDetail,
        [switch]$WarnOnly
    )

    $hits = Search-Patterns -Files $Files -Patterns $Patterns
    if ($hits.Count -gt 0) {
        $evidence = ($hits | Select-Object -First 6 | ForEach-Object {
            $relative = Resolve-Path -LiteralPath $_.File -Relative
            "$relative => $($_.Pattern)"
        }) -join '; '
        Add-Check PASS $Area $Name $PassDetail $evidence
        return
    }

    $status = if ($WarnOnly) { 'WARN' } else { 'FAIL' }
    Add-Check $status $Area $Name $FailDetail ''
}

function Add-ForbiddenCopyCheck {
    param([string[]]$Files)

    $forbidden = @(
        'Lorem ipsum',
        'TODO:?',
        'To get started',
        'edit the page\.tsx file',
        'Deploy Now',
        'create-next-app',
        'Next\.js logo',
        'Learning center'
    )

    $copyHits = New-Object System.Collections.Generic.List[object]
    foreach ($file in $Files) {
        $relative = Resolve-Path -LiteralPath $file -Relative
        if ($relative -match '^[.\\\/]*(docs|tests|scripts)[\\\/]') {
            continue
        }

        $lines = Get-Content -LiteralPath $file -ErrorAction SilentlyContinue
        for ($i = 0; $i -lt $lines.Count; $i++) {
            foreach ($pattern in $forbidden) {
                if ($lines[$i] -match $pattern) {
                    $copyHits.Add([pscustomobject]@{
                        File = $relative
                        Line = $i + 1
                        Pattern = $pattern
                        Text = $lines[$i].Trim()
                    }) | Out-Null
                }
            }
        }
    }

    if ($copyHits.Count -eq 0) {
        Add-Check PASS 'Copy' 'Professional frontend and user-facing copy scan' 'No configured AI-flavored or placeholder wording was found.' ''
        return
    }

    $evidence = ($copyHits | Select-Object -First 10 | ForEach-Object {
        "$($_.File):$($_.Line) [$($_.Pattern)] $($_.Text)"
    }) -join '; '
    Add-Check FAIL 'Copy' 'Professional frontend and user-facing copy scan' 'Forbidden or placeholder wording was found in user-facing files.' $evidence
}

Push-Location $Root
try {
    Test-PathCheck 'Structure' 'Laravel backend skeleton' @(
        'backend',
        'backend/app',
        'backend/routes',
        'backend/config',
        'backend/database/migrations',
        'backend/storage/app/audio'
    )
    Test-PathCheck 'Structure' 'Next.js frontend skeleton' @(
        'frontend',
        'frontend/package.json'
    )
    Test-PathCheck 'Structure' 'shadcn/ui project marker' @(
        'frontend/components.json'
    )
    Test-PathCheck 'Structure' 'Verification asset directories' @(
        'scripts',
        'tests',
        'docs'
    )

    Test-PathCheck 'Docker' 'Recommended compose file' @(
        'deploy/docker/docker-compose.yml'
    )
    Test-PathCheck 'Docker' 'Single app container files' @(
        'deploy/docker/app.Dockerfile',
        'deploy/docker/app-entrypoint.sh',
        'deploy/docker/apache-vhost.conf',
        'deploy/docker/php.ini'
    )
    Test-PathCheck 'Source Deploy' 'BaoTa source upload files' @(
        'deploy/source/README.md',
        'deploy/source/api.php',
        'deploy/source/backend.env.example',
        'deploy/source/frontend.env.example'
    )

    $rootConfigFiles = Get-ExplicitFiles -RelativePaths @(
        'README.md',
        'Makefile',
        'deploy/docker/docker-compose.yml',
        'deploy/docker/.env.example'
    )
    $files = (Get-ProjectFiles -Roots @('backend', 'frontend', 'deploy/docker', 'deploy/source')) + $rootConfigFiles
    if ($files.Count -eq 0) {
        Add-Check FAIL 'Files' 'Inspectable project files' 'No inspectable source/config files were found under backend, frontend, deploy/docker, or deploy/source.' ''
    } else {
        Add-Check PASS 'Files' 'Inspectable project files' "Found $($files.Count) inspectable files." ''
    }

    $backendFiles = Get-ProjectFiles -Roots @('backend')
    $frontendFiles = Get-ProjectFiles -Roots @('frontend')
    $dockerFiles = (Get-ProjectFiles -Roots @('deploy/docker')) + (Get-ExplicitFiles -RelativePaths @(
        'deploy/docker/docker-compose.yml',
        'deploy/docker/.env.example'
    ))

    Add-PatternCheck 'Backend' 'Laravel API routes' $backendFiles @(
        'Route::',
        'routes/api\.php',
        'apiResource',
        'middleware\('
    ) 'Laravel API route declarations were found.' 'Laravel API route declarations were not found.'

    Add-PatternCheck 'Auth' 'LinuxDo Connect endpoint and OAuth flow' ($backendFiles + $frontendFiles) @(
        'linux\.do',
        'LinuxDo',
        'linuxdo',
        'oauth',
        'authorization_code',
        'connect'
    ) 'LinuxDo/OAuth markers were found.' 'LinuxDo Connect/OAuth endpoint markers were not found.'

    Add-PatternCheck 'Install' 'Installation wizard and first administrator binding' ($backendFiles + $frontendFiles) @(
        'install',
        'wizard',
        'first_admin',
        'admin.*bind',
        'administrator'
    ) 'Install/admin binding markers were found.' 'Install wizard or first administrator binding markers were not found.'

    Add-PatternCheck 'Config' 'Admin default API config with user override' ($backendFiles + $frontendFiles) @(
        'admin.*(api|key|config|default)',
        '(user|member).*(api|key).*(override|fallback|priority)',
        '(override|fallback|priority).*(api|key)'
    ) 'API configuration priority markers were found.' 'Admin default API config plus user override priority markers were not found.'

    Add-PatternCheck 'Audio' 'Speech-to-text / ASR capability' ($backendFiles + $frontendFiles) @(
        '\basr\b',
        'speech[-_ ]?to[-_ ]?text',
        'transcri(?:be|ption)'
    ) 'ASR markers were found.' 'ASR markers were not found.'

    Add-PatternCheck 'Audio' 'Text-to-speech / TTS capability' ($backendFiles + $frontendFiles) @(
        '\btts\b',
        'text[-_ ]?to[-_ ]?speech',
        'speech[-_ ]?synthesis'
    ) 'TTS markers were found.' 'TTS markers were not found.'

    Add-PatternCheck 'Audio' 'Voice design capability' ($backendFiles + $frontendFiles) @(
        'voice[-_ ]?design',
        'voice.*design'
    ) 'Voice design markers were found.' 'Voice design markers were not found.'

    Add-PatternCheck 'Audio' 'Voice clone capability' ($backendFiles + $frontendFiles) @(
        'voice[-_ ]?clone',
        'clone.*voice'
    ) 'Voice clone markers were found.' 'Voice clone markers were not found.'

    Add-PatternCheck 'Storage' 'Local Docker volume audio storage' ($backendFiles + $dockerFiles) @(
        'storage/app/audio',
        'audio.*volume',
        'volumes?:[\s\S]{0,240}audio',
        'local.*audio',
        'generated',
        'uploads'
    ) 'Local audio storage markers were found.' 'Local Docker volume audio storage markers were not found.'

    Add-PatternCheck 'Security' 'Authenticated API middleware or guards' $backendFiles @(
        'auth:',
        'Ensure.*Authenticated',
        'middleware\([^\)]*auth',
        'Policy',
        'Gate::',
        'can:'
    ) 'Authentication/authorization markers were found.' 'Authentication/authorization markers were not found.'

    Add-PatternCheck 'Frontend' 'Next.js application and API client markers' $frontendFiles @(
        'next',
        'app/',
        'pages/',
        'fetch\(',
        'axios',
        'components/ui',
        'shadcn'
    ) 'Next.js/frontend markers were found.' 'Next.js/frontend markers were not found.'

    Add-ForbiddenCopyCheck -Files ($backendFiles + $frontendFiles)

    $modelPatterns = @('["'']model["'']\s*(=>|:)', 'model_name', 'interface.*model')
    if ($ExpectedModels.Count -gt 0) {
        $escapedModels = $ExpectedModels | ForEach-Object { [regex]::Escape($_) }
        $modelPatterns += $escapedModels
    }

    Add-PatternCheck 'API' 'Interface model names are declared' ($backendFiles + $frontendFiles) $modelPatterns `
        'Model declaration markers were found.' `
        'Interface model name declarations were not found. Set MIMO_EXPECTED_MODELS to enforce exact model ids.'

    if ($ExpectedModels.Count -gt 0) {
        foreach ($model in $ExpectedModels) {
            Add-PatternCheck 'API' "Expected model '$model'" ($backendFiles + $frontendFiles) @([regex]::Escape($model)) `
                "Expected model '$model' was found." `
                "Expected model '$model' was not found."
        }
    } else {
        Add-Check WARN 'API' 'Exact expected model list' 'Exact model ids were not configured. Set MIMO_EXPECTED_MODELS=model-a,model-b for strict model-name validation.' ''
    }

    $statusOrder = @{ FAIL = 0; WARN = 1; PASS = 2 }
    $Results |
        Sort-Object @{ Expression = { $statusOrder[$_.Status] } }, Area, Name |
        Format-Table Status, Area, Name, Detail, Evidence -AutoSize -Wrap

    $failures = @($Results | Where-Object Status -eq 'FAIL')
    $warnings = @($Results | Where-Object Status -eq 'WARN')

    Write-Host ''
    Write-Host ("Summary: {0} passed, {1} failed, {2} warnings." -f `
        @($Results | Where-Object Status -eq 'PASS').Count,
        $failures.Count,
        $warnings.Count)

    if ($failures.Count -gt 0 -or ($FailOnWarnings -and $warnings.Count -gt 0)) {
        exit 1
    }
}
finally {
    Pop-Location
}
