#!/bin/bash
# Install the cap-sync systemd user timer for automatic syncing
# Usage: bash install-timer.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NPX_PATH="$(which npx 2>/dev/null || echo "npx")"
UNIT_DIR="$HOME/.config/systemd/user"

mkdir -p "$UNIT_DIR"

# Update service with correct paths and npx binary for this machine
sed -e "s|/home/sschatz/projects/software-capitalization|$PROJECT_DIR|g" \
    -e "s|ExecStart=npx |ExecStart=$NPX_PATH |g" \
  "$SCRIPT_DIR/cap-sync.service" > "$UNIT_DIR/cap-sync.service"

cp "$SCRIPT_DIR/cap-sync.timer" "$UNIT_DIR/cap-sync.timer"

systemctl --user daemon-reload
systemctl --user enable cap-sync.timer
systemctl --user start cap-sync.timer

echo "Cap sync timer installed. Next runs:"
systemctl --user list-timers cap-sync.timer
echo ""
echo "To check sync logs:  journalctl --user -u cap-sync.service"
echo "To run sync now:     systemctl --user start cap-sync.service"
echo "To stop the timer:   systemctl --user stop cap-sync.timer && systemctl --user disable cap-sync.timer"
