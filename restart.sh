#!/bin/bash
# Restart the Keystone (Ghost Scribe) server.
# The server runs as the systemd unit `keystone.service` with Restart=always,
# so we just SIGTERM the node process and let systemd respawn it with the
# current code on disk. This avoids needing sudo for `systemctl restart`.

set -e

SERVICE=keystone.service
LOG=/var/log/keystone.log

OLD_PID=$(systemctl show "$SERVICE" -p MainPID --value)
if [ -z "$OLD_PID" ] || [ "$OLD_PID" = "0" ]; then
  echo "Keystone not running — starting via systemctl (may prompt for password)..."
  sudo systemctl start "$SERVICE"
  exit 0
fi

echo "Bouncing $SERVICE (old PID $OLD_PID)..."
kill "$OLD_PID"

for i in {1..20}; do
  NEW_PID=$(systemctl show "$SERVICE" -p MainPID --value)
  if [ "$NEW_PID" != "$OLD_PID" ] && [ "$NEW_PID" != "0" ] && kill -0 "$NEW_PID" 2>/dev/null; then
    echo "Restarted. New PID: $NEW_PID"
    echo "Logs: tail -f $LOG"
    exit 0
  fi
  sleep 1
done

echo "Error: Service did not come back up within 20s. Check: systemctl status $SERVICE"
exit 1
