# After editing "subjects - reference.docx": regenerate the thematic subject
# order and publish the document together with the regenerated order.
$ErrorActionPreference = 'Stop'
try {
    & (Join-Path $PSScriptRoot 'extract-subject-order.ps1')
    & (Join-Path $PSScriptRoot 'run-node-tool.ps1') 'publish-changes.mjs' '--message' 'Update thematic subject order' 'subjects - reference.docx' 'src/subject-order.json'
    exit $LASTEXITCODE
} catch {
    Write-Host "NOT PUBLISHED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
