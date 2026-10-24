# Set up Zion Luxe on a Windows PC. In PowerShell:
#   irm https://raw.githubusercontent.com/nabeelmumtaz92/zion-luxe/main/scripts/setup-windows.ps1 | iex
# The Mac mini is the one shared database (it scrapes and stores every lead). This PC opens the Mac's
# dashboard over Tailscale, so leads, drafts and statuses are the same on both. Adds a "Zion Luxe" Desktop shortcut.
$ErrorActionPreference = 'Stop'
$Url = 'http://nabeels-mac-mini.tail74c059.ts.net:8799'

$Tailscale = "$env:ProgramFiles\Tailscale\tailscale.exe"
if (-not (Test-Path $Tailscale)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Tailscale is required: install it from https://tailscale.com/download/windows, then re-run.' }
  Write-Host 'Installing Tailscale...'
  winget install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements | Out-Host
}
if (Test-Path $Tailscale) {
  & $Tailscale status *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Sign in to Tailscale with the same account as the Mac (nabeelmumtaz92) in the window that opens...'
    & $Tailscale up
  }
}

$Link = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Zion Luxe.url'
"[InternetShortcut]`r`nURL=$Url/`r`n" | Set-Content -Encoding ASCII $Link

try {
  Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 "$Url/api/inquiries" | Out-Null
  Write-Host "Connected to the Mac. Double-click 'Zion Luxe' on the Desktop (or open $Url)."
} catch {
  Write-Host "Shortcut added, but the Mac didn't answer yet: check Tailscale is signed in here and the Mac mini is on, then open $Url."
}
