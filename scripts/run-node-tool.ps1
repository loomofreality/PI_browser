# Run one of the project's Node.js tools from a maintenance launcher.
#   run-node-tool.ps1 SCRIPT.mjs [arguments...]
$ErrorActionPreference = 'Stop'
$script = $args[0]
$toolArguments = @($args | Select-Object -Skip 1)
$runtimeNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
try {
    if (-not $script -or -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $script))) { throw "Unknown tool: $script" }
    if (Test-Path -LiteralPath $runtimeNode) { $node = $runtimeNode }
    else { $node = (Get-Command node -ErrorAction Stop).Source }
    $version = & $node --version
    if ([int](($version.TrimStart('v') -split '\.')[0]) -lt 22) { throw 'Node.js 22 or newer is required.' }
    Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
    & $node (Join-Path $PSScriptRoot $script) @toolArguments
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
