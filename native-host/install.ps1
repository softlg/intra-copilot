param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node.exe -ErrorAction Stop).Source
$commandPath = Join-Path $root "host.cmd"
$manifestPath = Join-Path $root "com.intra_copilot.input.json"

@"
@echo off
"$node" "$root\host.js" %*
"@ | Set-Content -Path $commandPath -Encoding ASCII

$manifest = @{
  name = "com.intra_copilot.input"
  description = "Intra Copilot trusted system input host"
  path = $commandPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($manifestPath, $manifest, [Text.UTF8Encoding]::new($false))

$registryPaths = @(
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.intra_copilot.input",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.intra_copilot.input"
)
foreach ($registryPath in $registryPaths) {
  New-Item -Path $registryPath -Force | Out-Null
  Set-ItemProperty -Path $registryPath -Name "(Default)" -Value $manifestPath
}

Write-Host "Installed native host for extension $ExtensionId"
