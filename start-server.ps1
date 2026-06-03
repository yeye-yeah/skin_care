$ErrorActionPreference = "Stop"

$node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$server = Join-Path $PSScriptRoot "server.js"

Set-Location $PSScriptRoot
& $node $server
