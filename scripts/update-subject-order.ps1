# After editing "subjects - reference.docx": regenerate the thematic subject
# order and propose the document together with the regenerated order as a
# pull request. Merging it on GitHub publishes the new order.
$ErrorActionPreference = 'Stop'
$body = Join-Path (Split-Path -Parent $PSScriptRoot) ('.qa/subject-order-' + [Guid]::NewGuid().ToString('N') + '.md')
try {
    & (Join-Path $PSScriptRoot 'extract-subject-order.ps1')
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $body) | Out-Null
    & (Join-Path $PSScriptRoot 'run-node-tool.ps1') 'describe-subject-order.mjs' $body
    if ($LASTEXITCODE -ne 0) { throw 'The change to the subject order could not be described.' }
    & (Join-Path $PSScriptRoot 'run-node-tool.ps1') 'publish-changes.mjs' '--message' 'Update thematic subject order' '--kind' 'subject-order' '--tool' 'Update-Subject-Order.cmd' '--body-file' $body 'subjects - reference.docx' 'src/subject-order.json'
    exit $LASTEXITCODE
} catch {
    Write-Host "NO PULL REQUEST OPENED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Remove-Item -LiteralPath $body -Force -ErrorAction SilentlyContinue
}
