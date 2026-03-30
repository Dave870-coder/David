# test_local.ps1 - quick local sanity checks
Write-Output "Running quick local checks..."
$files = @(
  'index.html',
  'assets/db.js',
  'assets/app.js',
  'assets/jszip-loader.js'
)
$missing = @()
foreach ($f in $files) {
  if (-not (Test-Path $f)) { $missing += $f }
}
if ($missing.Count -gt 0) {
  Write-Error "Missing files: $($missing -join ', ')"
  exit 2
} else {
  Write-Output "All files present."
}

Write-Output "Sanity check passed. You can now run a local server: `python -m http.server 8080` and open http://localhost:8080"
exit 0
