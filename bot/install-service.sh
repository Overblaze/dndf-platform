#!/usr/bin/env bash
# Installs the DnDF bot as a service for this user: it starts on boot and restarts if it stops.
# It runs from its own copy of the repository's main branch (~/dndf/bot-live), so work going on
# in the development checkout never changes what the running bot is made of.
#
#   bash bot/install-service.sh            install, or update to the latest main and restart
#   bash bot/install-service.sh --remove   stop and remove the service (the copy and bot.env stay)
set -euo pipefail

LIVE="$HOME/dndf/bot-live"
UNIT="$HOME/.config/systemd/user/dndf-bot.service"
REPO="https://github.com/Overblaze/dndf-platform.git"

if [[ "${1:-}" == "--remove" ]]; then
  systemctl --user disable --now dndf-bot.service 2>/dev/null || true
  rm -f "$UNIT"
  systemctl --user daemon-reload
  echo "The bot service is stopped and removed."
  exit 0
fi

[[ -f "$HOME/dndf/secret/bot.env" ]] || { echo "Missing $HOME/dndf/secret/bot.env (see bot/README.md)"; exit 1; }

if [[ -d "$LIVE/.git" ]]; then
  git -C "$LIVE" fetch --quiet origin main
  git -C "$LIVE" checkout --quiet main
  git -C "$LIVE" reset --quiet --hard origin/main
else
  git clone --quiet --branch main "$REPO" "$LIVE"
fi
echo "Bot copy is at $(git -C "$LIVE" log --oneline -1)"
(cd "$LIVE" && npm ci --silent --no-audit --no-fund)

# Node may come from nvm, whose folder is not on a service's search path: name it outright.
NODE_BIN="$(dirname "$(command -v node)")"

mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNITFILE
[Unit]
Description=DnDF Discord bot
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$LIVE/bot
Environment=PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_BIN/npx tsx src/index.ts
Restart=always
RestartSec=10
# Its secrets are read by the program itself from ~/dndf/secret/bot.env; none are named here.
NoNewPrivileges=true

[Install]
WantedBy=default.target
UNITFILE

systemctl --user daemon-reload
(cd "$LIVE/bot" && npx tsx src/register.ts)
systemctl --user enable --quiet dndf-bot.service
systemctl --user restart dndf-bot.service
# Give it time to sign in, then say plainly whether it did.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  sleep 2
  journalctl --user -u dndf-bot --since "-40s" --no-pager 2>/dev/null | grep -q "signed in as" && break
done
if journalctl --user -u dndf-bot --since "-40s" --no-pager 2>/dev/null | grep -q "signed in as"; then
  echo "The bot is running: $(journalctl --user -u dndf-bot --since "-40s" --no-pager | grep "signed in as" | tail -1 | sed 's/.*: DnDF bot //')"
else
  echo "The bot did NOT start. Last lines of its log:"
  journalctl --user -u dndf-bot --no-pager -n 8 | cut -c1-200
  exit 1
fi
echo "Logs: journalctl --user -u dndf-bot -f"
