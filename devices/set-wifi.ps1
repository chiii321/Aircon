# Run set-wifi.cmd to open an interactive PowerShell window.
$ErrorActionPreference = 'Stop'

function Set-WifiDefinition {
    param([string]$Content, [string]$Name, [string]$Value)
    $pattern = '(?m)^[ \t]*#define[ \t]+' + $Name + '[ \t]+"(?:\\.|[^"\\\r\n])*"[^\r\n]*'
    $definitions = [regex]::Matches($Content, $pattern)
    if ($definitions.Count -ne 1) {
        throw "Expected exactly one $Name definition. No files have been updated."
    }
    # Escape C++ string literals without interpreting dollar signs or other shell syntax.
    $escaped = $Value.Replace('\', '\\').Replace('"', '\"').Replace("`t", '\t')
    $replacement = '#define ' + $Name + ' "' + $escaped + '"'
    $definition = $definitions[0]
    return $Content.Remove($definition.Index, $definition.Length).Insert($definition.Index, $replacement)
}

Write-Host 'Set the same Wi-Fi network for ESP32 devices 01 through 11.'
Write-Host 'SSID and password input are visible. Device tokens are preserved.'
do {
    $ssid = Read-Host 'Wi-Fi SSID (2.4 GHz network)'
    $ssidLength = [System.Text.Encoding]::UTF8.GetByteCount($ssid)
    if ($ssidLength -lt 1 -or $ssidLength -gt 32) {
        Write-Host 'The SSID must contain 1 to 32 UTF-8 bytes.'
    }
} while ($ssidLength -lt 1 -or $ssidLength -gt 32)
$password = Read-Host 'Wi-Fi password (visible; Enter for an open network)'

# Prepare every update first so a missing or invalid header prevents all writes.
$updates = @()
foreach ($number in 1..11) {
    $deviceId = '{0:D2}' -f $number
    $headerPath = Join-Path $PSScriptRoot "$deviceId/device_credentials.h"
    if (-not (Test-Path -LiteralPath $headerPath)) {
        throw "Missing $headerPath. No files have been updated."
    }
    $header = [System.IO.File]::ReadAllText($headerPath)
    $header = Set-WifiDefinition $header 'WIFI_SSID' $ssid
    $header = Set-WifiDefinition $header 'WIFI_PASSWORD' $password
    $updates += @{ Path = $headerPath; Content = $header; DeviceId = $deviceId }
}

foreach ($update in $updates) {
    [System.IO.File]::WriteAllText($update.Path, $update.Content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Updated ESP32 $($update.DeviceId) Wi-Fi settings."
}
Write-Host 'Finished: all 11 credentials files updated. Upload each matching sketch to apply the settings.'
