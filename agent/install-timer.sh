#!/bin/bash
# Install cap-sync systemd user timer for automatic data collection
# Usage: bash install-timer.sh
#
# This installs a timer that runs `cap sync` every 2 hours during business hours.
# Entry generation (AI summarization) runs server-side, not on the agent.
#
# Prerequisites (WSL2):
#   1. systemd must be enabled: /etc/wsl.conf needs [boot] systemd=true
#   2. Restart WSL after enabling: wsl --shutdown (from PowerShell)
#   3. Verify: systemctl --user is-system-running  (should say "running")

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NPX_PATH="$(which npx 2>/dev/null || echo "npx")"
UNIT_DIR="$HOME/.config/systemd/user"

# Check systemd is available
if ! systemctl --user is-system-running &>/dev/null; then
  echo "ERROR: systemd user services are not running."
  echo ""
  echo "If you're on WSL2, enable systemd:"
  echo "  1. sudo sh -c 'echo -e \"[boot]\\nsystemd=true\" >> /etc/wsl.conf'"
  echo "  2. From PowerShell: wsl --shutdown"
  echo "  3. Reopen WSL and re-run this script"
  exit 1
fi

mkdir -p "$UNIT_DIR"

echo "Installing cap agent sync timer..."
echo "  Project: $PROJECT_DIR"
echo "  npx:     $NPX_PATH"
echo ""

# Install service file (substitute placeholders with real paths)
sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__NPX__|$NPX_PATH|g" \
  "$SCRIPT_DIR/cap-sync.service" > "$UNIT_DIR/cap-sync.service"

cp "$SCRIPT_DIR/cap-sync.timer" "$UNIT_DIR/cap-sync.timer"

# Remove old generate timer if present (generation is now server-side)
if systemctl --user is-enabled cap-generate.timer &>/dev/null; then
  echo "  Removing old cap-generate timer (generation is now server-side)..."
  systemctl --user stop cap-generate.timer 2>/dev/null || true
  systemctl --user disable cap-generate.timer 2>/dev/null || true
fi
rm -f "$UNIT_DIR/cap-generate.service" "$UNIT_DIR/cap-generate.timer"

# Reload and enable
systemctl --user daemon-reload

systemctl --user enable cap-sync.timer
systemctl --user start cap-sync.timer

# Enable lingering so timers survive logout
loginctl enable-linger "$(whoami)" 2>/dev/null || true

echo ""
echo "Cap sync timer installed:"
systemctl --user list-timers cap-sync.timer
echo ""
echo "Schedule: Mon-Fri 8am,10am,12pm,2pm,4pm,6pm,11pm | Sat-Sun 12pm,11pm"
echo ""
echo "Commands:"
echo "  Check logs:        journalctl --user -u cap-sync.service -n 20"
echo "  Run sync now:      systemctl --user start cap-sync.service"
echo "  View timer status: systemctl --user list-timers cap-sync.timer"
echo "  Disable:           systemctl --user stop cap-sync.timer && systemctl --user disable cap-sync.timer"
