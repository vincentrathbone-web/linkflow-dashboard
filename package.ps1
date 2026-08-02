param([switch]$NoBump)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspaceRoot = $PSScriptRoot
$frontendRoot = Join-Path $workspaceRoot 'linkflow-dashboard'
$pluginRoot = Join-Path $workspaceRoot 'wordpress-plugin\linkflow-dashboard'
$pluginPackagePath = Join-Path $pluginRoot 'package.json'
$packageRoot = Join-Path $workspaceRoot 'dist'

if (-not (Test-Path -LiteralPath $pluginPackagePath)) {
    throw "Plugin package metadata was not found at $pluginPackagePath"
}

$package = Get-Content -LiteralPath $pluginPackagePath -Raw | ConvertFrom-Json
$pluginSlug = [string]$package.name
$currentVersion = [string]$package.version

if ($pluginSlug -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$') {
    throw "Invalid WordPress plugin slug in package.json: $pluginSlug"
}

if ($currentVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "Invalid semantic version in package.json: $currentVersion"
}

if ($NoBump) {
    $newVersion = $currentVersion
}
else {
    $parts = $currentVersion -split '\.'
    $parts[2] = [int]$parts[2] + 1
    $newVersion = $parts -join '.'
}

$packageJson = Get-Content -LiteralPath $pluginPackagePath -Raw
$packageJson = $packageJson -replace '"version"\s*:\s*"[^"]+"', "`"version`": `"$newVersion`""
[System.IO.File]::WriteAllText($pluginPackagePath, $packageJson, [System.Text.UTF8Encoding]::new($false))

$mainPluginPath = Join-Path $pluginRoot "$pluginSlug.php"
if (-not (Test-Path -LiteralPath $mainPluginPath)) {
    throw "Canonical main plugin file was not found at $mainPluginPath"
}

$mainPlugin = Get-Content -LiteralPath $mainPluginPath -Raw
$mainPlugin = $mainPlugin -replace '(?m)^(\s*\*\s*Version:\s*)[\d.]+', "`${1}$newVersion"
$mainPlugin = $mainPlugin -replace "(define\(\s*'LINKFLOW_DASHBOARD_VERSION',\s*')[^']+(')", "`${1}$newVersion`${2}"
[System.IO.File]::WriteAllText($mainPluginPath, $mainPlugin, [System.Text.UTF8Encoding]::new($false))

$pluginReadmePath = Join-Path $pluginRoot 'README.md'
if (Test-Path -LiteralPath $pluginReadmePath) {
    $pluginReadme = Get-Content -LiteralPath $pluginReadmePath -Raw
    $pluginReadme = $pluginReadme -replace 'Current version: \*\*[\d.]+\*\*\.', "Current version: **$newVersion**."
    [System.IO.File]::WriteAllText($pluginReadmePath, $pluginReadme, [System.Text.UTF8Encoding]::new($false))
}

$buildStage = Join-Path ([System.IO.Path]::GetTempPath()) "linkflow-dashboard-build-$PID"
$packageStage = Join-Path ([System.IO.Path]::GetTempPath()) "linkflow-dashboard-package-$PID"
$stagePluginRoot = Join-Path $packageStage $pluginSlug

foreach ($stagePath in @($buildStage, $packageStage)) {
    if (Test-Path -LiteralPath $stagePath) {
        throw "Refusing to reuse an existing staging directory: $stagePath"
    }
}

try {
    New-Item -ItemType Directory -Path $buildStage | Out-Null
    Push-Location $frontendRoot
    try {
        & npx vite build --outDir $buildStage
        if (0 -ne $LASTEXITCODE) {
            throw "The LinkFlow frontend build failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }

    $pluginBuildRoot = Join-Path $pluginRoot 'build'
    New-Item -ItemType Directory -Path $pluginBuildRoot -Force | Out-Null
    Copy-Item -Path (Join-Path $buildStage '*') -Destination $pluginBuildRoot -Recurse -Force

    $manifestPath = Join-Path $buildStage '.vite\manifest.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $currentAssetNames = @(
        $manifest.PSObject.Properties.Value | ForEach-Object {
            $manifestEntry = $_
            @('file', 'css', 'assets') | ForEach-Object {
                $property = $manifestEntry.PSObject.Properties[$_]
                if ($null -ne $property) {
                    @($property.Value)
                }
            }
        } | Where-Object { $_ -and $_.StartsWith('assets/') } | ForEach-Object { Split-Path -Leaf $_ } | Select-Object -Unique
    )
    $pluginAssetRoot = Join-Path $pluginBuildRoot 'assets'
    Get-ChildItem -LiteralPath $pluginAssetRoot -File | Where-Object { $_.Name -notin $currentAssetNames } | ForEach-Object {
        if (-not $_.FullName.StartsWith($pluginAssetRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove an asset outside the plugin build directory: $($_.FullName)"
        }
        Remove-Item -LiteralPath $_.FullName -Force
    }

    New-Item -ItemType Directory -Path $stagePluginRoot -Force | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $pluginRoot -Force) {
        if ($item.Name -in @('package.json', 'package-lock.json', 'node_modules', 'src', '.git', '.gitignore')) {
            continue
        }
        Copy-Item -LiteralPath $item.FullName -Destination $stagePluginRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
    $versionedPackagePath = Join-Path $packageRoot "$pluginSlug-v$newVersion.zip"
    $legacyUnversionedPackagePath = Join-Path $packageRoot "$pluginSlug.zip"

    foreach ($zipPath in @($versionedPackagePath, $legacyUnversionedPackagePath)) {
        if (Test-Path -LiteralPath $zipPath) {
            Remove-Item -LiteralPath $zipPath -Force
        }
    }

    # Compress-Archive writes Windows backslashes into entry names. On a Linux
    # host those can become literal filename characters instead of directories.
    # Write ZIP-standard forward-slash paths explicitly.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $writeZip = [System.IO.Compression.ZipFile]::Open($versionedPackagePath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $stageFiles = @(Get-ChildItem -LiteralPath $stagePluginRoot -File -Recurse | Sort-Object FullName)
        foreach ($stageFile in $stageFiles) {
            if (-not $stageFile.FullName.StartsWith($stagePluginRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Refusing to package a file outside the staged plugin root: $($stageFile.FullName)"
            }

            $relativePath = $stageFile.FullName.Substring($stagePluginRoot.Length + 1).Replace('\', '/')
            $entryName = "$pluginSlug/$relativePath"
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $writeZip,
                $stageFile.FullName,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    }
    finally {
        $writeZip.Dispose()
    }
    $zip = [System.IO.Compression.ZipFile]::OpenRead($versionedPackagePath)
    try {
        $entryNames = @($zip.Entries | ForEach-Object { $_.FullName })
        $fileEntries = @($zip.Entries | Where-Object { $_.Name } | ForEach-Object { $_.FullName })
        $backslashEntries = @($entryNames | Where-Object { $_.Contains('\') })
        $invalidEntries = @($entryNames | Where-Object { -not $_.StartsWith("$pluginSlug/", [System.StringComparison]::Ordinal) })
        $versionedRoots = @($entryNames | Where-Object { $_ -match "^$([regex]::Escape($pluginSlug))-v?\d" })
        $mainEntry = "$pluginSlug/$pluginSlug.php"

        if ($backslashEntries.Count -gt 0) {
            throw "ZIP contains Windows backslash path separators: $($backslashEntries -join ', ')"
        }
        if ($invalidEntries.Count -gt 0) {
            throw "ZIP contains entries outside the canonical $pluginSlug/ root: $($invalidEntries -join ', ')"
        }
        if ($versionedRoots.Count -gt 0) {
            throw "ZIP contains a forbidden versioned plugin root: $($versionedRoots -join ', ')"
        }
        if ($mainEntry -notin $fileEntries) {
            throw "ZIP is missing its canonical main plugin file: $mainEntry"
        }

        $rootFolders = @($entryNames | ForEach-Object { ($_ -split '/')[0] } | Where-Object { $_ } | Select-Object -Unique)
        if (1 -ne $rootFolders.Count -or $pluginSlug -ne $rootFolders[0]) {
            throw "ZIP root validation failed. Expected only '$pluginSlug'; found '$($rootFolders -join ', ')'."
        }

        Write-Output "Packaged plugin $currentVersion -> $newVersion"
        Write-Output "Validated ZIP root: $pluginSlug/"
        Write-Output "Validated main file: $mainEntry"
        Write-Output "Runtime file count: $($fileEntries.Count)"
        Write-Output "Install ZIP: $versionedPackagePath"
    }
    finally {
        $zip.Dispose()
    }
}
finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    foreach ($stagePath in @($buildStage, $packageStage)) {
        if (-not (Test-Path -LiteralPath $stagePath)) {
            continue
        }
        $resolvedStage = (Resolve-Path -LiteralPath $stagePath).Path
        if (-not $resolvedStage.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove a staging directory outside the system temp directory: $resolvedStage"
        }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
