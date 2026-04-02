# Claude Buddy Picker — Windows PowerShell persistence
# Adds a `claude` wrapper function to your PowerShell profile that
# enforces your chosen accountUuid on every launch.
#
# Usage:
#   .\persist.ps1 <accountUuid>
#
# Example:
#   .\persist.ps1 18b852ac-df26-44ed-9a3f-d8992a0760f5

param(
    [Parameter(Mandatory=$true)]
    [string]$TargetUuid
)

$profilePath = $PROFILE

# Create profile directory if it doesn't exist
$profileDir = Split-Path $profilePath
if (!(Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

$block = @"

# --- Claude Buddy Picker: auto-fix companion identity ---
function claude {
    `$configPath = Join-Path `$env:USERPROFILE ".claude.json"
    `$target = "$TargetUuid"
    try {
        `$config = Get-Content `$configPath -Raw | ConvertFrom-Json
        if (`$config.oauthAccount.accountUuid -ne `$target) {
            `$config.oauthAccount.accountUuid = `$target
            `$config.PSObject.Properties.Remove("companion")
            `$config | ConvertTo-Json -Depth 20 | Set-Content `$configPath
            Write-Host "[buddy-picker] identity locked" -ForegroundColor Green
        }
    } catch {}
    `$claudePath = (Get-Command claude -ErrorAction SilentlyContinue).Source
    if (-not `$claudePath) { `$claudePath = "`$env:USERPROFILE\.local\bin\claude.exe" }
    & `$claudePath @args
}
# --- End Claude Buddy Picker ---
"@

# Check if already installed
if (Test-Path $profilePath) {
    $existing = Get-Content $profilePath -Raw
    if ($existing -match "Claude Buddy Picker") {
        # Replace existing block
        $pattern = '(?s)# --- Claude Buddy Picker.*?# --- End Claude Buddy Picker ---'
        $updated = $existing -replace $pattern, $block.Trim()
        Set-Content $profilePath $updated
        Write-Host "Updated existing Claude Buddy Picker in PowerShell profile." -ForegroundColor Cyan
    } else {
        Add-Content $profilePath $block
        Write-Host "Added Claude Buddy Picker to PowerShell profile." -ForegroundColor Cyan
    }
} else {
    Set-Content $profilePath $block
    Write-Host "Created PowerShell profile with Claude Buddy Picker." -ForegroundColor Cyan
}

Write-Host "Target UUID: $TargetUuid" -ForegroundColor Yellow
Write-Host "Profile: $profilePath" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Restart PowerShell for changes to take effect." -ForegroundColor White
