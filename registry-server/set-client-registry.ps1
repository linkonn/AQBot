# 把当前客户端的技能仓库地址指向内网服务器。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File set-client-registry.ps1 -BaseUrl http://10.10.20.31:7801
#   powershell -ExecutionPolicy Bypass -File set-client-registry.ps1 -BaseUrl http://10.10.20.31:7801 -Token abc123
#
# 写入位置：%USERPROFILE%\.aqbot\skill-registry.json

param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,

    [string]$Token = ""
)

$ErrorActionPreference = "Stop"

$normalized = $BaseUrl.Trim().TrimEnd('/')
if ($normalized -notmatch '^https?://') {
    Write-Error "BaseUrl 必须带 http:// 或 https:// 前缀，例如 http://10.10.20.31:7801"
    exit 1
}

$homeDir = Join-Path $env:USERPROFILE ".aqbot"
if (-not (Test-Path $homeDir)) {
    New-Item -ItemType Directory -Path $homeDir -Force | Out-Null
}

$configPath = Join-Path $homeDir "skill-registry.json"
$payload = [ordered]@{
    base_url = $normalized
    token    = $Token.Trim()
}
$json = $payload | ConvertTo-Json

# UTF-8 without BOM，避免客户端解析失败
[System.IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Output "已写入: $configPath"
Write-Output $json
Write-Output ""
Write-Output "重启取证之手后，技能页顶部应显示该地址与「在线」。"
