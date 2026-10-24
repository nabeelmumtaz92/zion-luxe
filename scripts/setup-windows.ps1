# Set up (or update) the Zion Luxe private lead tool on a Windows PC. In PowerShell:
#   irm https://raw.githubusercontent.com/nabeelmumtaz92/zion-luxe/main/scripts/setup-windows.ps1 | iex
# Re-run any time to pull the latest version. Adds a "Zion Luxe" shortcut to the Desktop.
$ErrorActionPreference = 'Stop'
$Dir = Join-Path $HOME 'zion-luxe'

function Need($cmd, $wingetId, $name) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw "$name is required: install it, then re-run." }
  Write-Host "Installing $name..."
  winget install --id $wingetId -e --accept-source-agreements --accept-package-agreements | Out-Host
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$name was installed but isn't on PATH yet: open a new PowerShell window and re-run." }
}
Need git 'Git.Git' 'Git'
Need node 'OpenJS.NodeJS.LTS' 'Node.js'
if ([int](node -p 'process.versions.node.split(".")[0]') -lt 18) { throw "Node 18+ needed (found $(node -v))." }

if (Test-Path (Join-Path $Dir '.git')) { git -C $Dir pull --ff-only }
else { git clone https://github.com/nabeelmumtaz92/zion-luxe.git $Dir }
New-Item -ItemType Directory -Force (Join-Path $Dir 'data') | Out-Null

$EnvDir = Join-Path $HOME '.zion-luxe'
New-Item -ItemType Directory -Force $EnvDir | Out-Null
$EnvFile = Join-Path $EnvDir '.env'
if (-not (Test-Path $EnvFile)) {
  @'
# Free-tier AI keys (all optional; Claude Code is used when installed and signed in)
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
MISTRAL_API_KEY=
'@ | Set-Content -Encoding ASCII $EnvFile
  Write-Host "Created $EnvFile - paste your free keys there (aistudio.google.com/apikey, console.groq.com/keys, openrouter.ai/keys, console.mistral.ai)."
}
if (Get-ChildItem (Join-Path $HOME '.vscode\extensions\anthropic.claude-code-*\resources\native-binary\claude.exe') -ErrorAction SilentlyContinue) {
  Write-Host 'Claude Code found: it will be used first.'
} else {
  Write-Host 'Claude Code not found (install the VS Code extension and sign in) - free-tier keys will be used instead.'
}

# Desktop shortcut: starts the server in a minimized window (scraper off, so the Mac mini stays the only scraper) and opens the dashboard
$Start = Join-Path $Dir 'start-windows.cmd'
@"
@echo off
cd /d "$Dir"
start "Zion Luxe server" /min cmd /c "set SCRAPE=off&& node server.js"
timeout /t 2 /nobreak >nul
start "" http://localhost:8799
"@ | Set-Content -Encoding ASCII $Start
$Shell = New-Object -ComObject WScript.Shell
$Link = $Shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Zion Luxe.lnk'))
$Link.TargetPath = $Start
$Link.WorkingDirectory = $Dir
$Link.WindowStyle = 7
$Link.Save()

Write-Host ''
Write-Host "Done. Double-click 'Zion Luxe' on the Desktop (dashboard: http://localhost:8799)."
Write-Host 'This PC does not scrape; to scrape here instead, run: cd ~\zion-luxe; node server.js'
