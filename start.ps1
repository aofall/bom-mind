$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$taskPnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
$taskRuntime = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies'
if ($taskNodeCommand) {
    $taskNode = $taskNodeCommand.Source
} else {
    $taskNode = Join-Path $taskRuntime 'node/bin/node.exe'
}
if ($taskPnpmCommand) {
    $taskPnpm = $taskPnpmCommand.Source
} else {
    $taskPnpm = Join-Path $taskRuntime 'bin/fallback/pnpm.cmd'
}
if (-not (Test-Path -LiteralPath $taskNode)) {
    throw 'Please install Node.js 22.13+ (22.x) or 24+.'
}
if (-not (Test-Path -LiteralPath $taskPnpm)) {
    throw 'Please install pnpm 11.'
}
$env:Path = (Split-Path -Parent $taskNode) + ';' + $env:Path
$env:pnpm_config_state_dir = Join-Path $PSScriptRoot 'work/pnpm-state'
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    & $taskPnpm install
    if ($LASTEXITCODE -ne 0) {
        throw 'Dependency installation failed.'
    }
}
& $taskPnpm run dev
