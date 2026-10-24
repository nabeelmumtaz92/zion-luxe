#!/bin/zsh
# Run Zion Luxe on this Mac in the background: starts at login, restarts if it stops.
# This Mac is the one shared database; other devices open its dashboard over Tailscale.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
PLIST=~/Library/LaunchAgents/com.zionluxe.server.plist
mkdir -p ~/Library/Logs/ZionLuxe
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.zionluxe.server</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/server.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/ZionLuxe/server.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/ZionLuxe/server.log</string>
</dict></plist>
PLISTEOF
launchctl bootout gui/$(id -u)/com.zionluxe.server 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$PLIST"
echo "Zion Luxe is running in the background (log: ~/Library/Logs/ZionLuxe/server.log)."
echo "Restart after a git pull:  launchctl kickstart -k gui/$(id -u)/com.zionluxe.server"
