# INCASE System Won't Start

Recovery guide for the Keystone (Ghost Scribe) server on the Blackbird host.

## TL;DR

The server runs as the systemd unit **`keystone.service`**. It's configured
with `Restart=always`, so crashes auto-recover. If it's truly dead, follow the
steps below.

- **Logs:** `/var/log/keystone.log`
- **Quick restart (no sudo):** `./restart.sh` from the repo root
- **Service unit:** `/etc/systemd/system/keystone.service`
- **Working dir:** `/home/tom/blackbird_dev/KEYSTONE`
- **Listens on:** `http://localhost:3001`

## systemd cheat sheet

```bash
# Is it up?
systemctl is-active keystone.service
systemctl status keystone.service

# Start / stop / restart (need sudo)
sudo systemctl start   keystone.service
sudo systemctl stop    keystone.service
sudo systemctl restart keystone.service

# Enable / disable auto-start on boot (need sudo)
sudo systemctl enable  keystone.service
sudo systemctl disable keystone.service

# Recent structured logs from systemd itself (not app logs)
journalctl -u keystone.service -n 200 --no-pager
```

## Reading app logs

All app stdout/stderr is appended to `/var/log/keystone.log`:

```bash
tail -f /var/log/keystone.log

# Just the WhisperX lane:
grep '\[transcribe:' /var/log/keystone.log | tail -50

# Just the OpenAI lane:
grep 'openai-transcribe' /var/log/keystone.log | tail -50

# A specific recording (UUID in the URL when viewing it):
grep '<recording-id>' /var/log/keystone.log
```

## Common failure modes

### 1. Server is up but my code changes aren't taking effect

The node process is still the old one. `Restart=always` only kicks in on crash,
not on file changes. Bounce it:

```bash
./restart.sh
```

If `restart.sh` is unavailable:

```bash
kill "$(systemctl show keystone.service -p MainPID --value)"
# systemd respawns within ~5 seconds
```

### 2. Service is failed / won't come back up

```bash
systemctl status keystone.service
# If state is "failed" or "activating (auto-restart)" in a loop:
journalctl -u keystone.service -n 100 --no-pager
tail -100 /var/log/keystone.log
```

Typical causes:

- **Port 3001 already in use**: `lsof -i :3001` — kill the stray process.
- **`.env` missing / malformed**: unit has `EnvironmentFile=.../.env`; if the
  file doesn't exist or has bad syntax, systemd refuses to start the service.
- **Node dependency missing** (e.g. after pulling new code without
  `npm install`): log will show `Error: Cannot find module 'xxx'`.
- **Native module built against wrong Node version**
  (`better-sqlite3: NODE_MODULE_VERSION mismatch`): run `npm rebuild` in the
  repo root.

Then:

```bash
sudo systemctl restart keystone.service
```

### 3. Need to disable systemd and run the server by hand (debugging)

```bash
sudo systemctl stop keystone.service
cd /home/tom/blackbird_dev/KEYSTONE
node server/index.js          # foreground, Ctrl-C to stop
```

When done, re-enable:

```bash
sudo systemctl start keystone.service
```

### 4. Transcription lane fails silently in the UI

The UI only shows `error` / `completed` — no details. Grep the log:

```bash
grep -E '\[transcribe:|openai-transcribe' /var/log/keystone.log | tail -100
```

- **"Invalid model size 'gpt-4o-transcribe-diarize'"** → the engine selector is
  routing an OpenAI request to the WhisperX lane. Usually means the server is
  still running old code; `./restart.sh`.
- **"OPENAI_API_KEY is not set"** → add the key to `.env` and restart.
- **WhisperX CUDA OOM** → another GPU process is holding memory; kill it or
  reboot the GPU driver.

## Service unit (for reference)

```ini
# /etc/systemd/system/keystone.service
[Unit]
Description=Keystone (Ghost Scribe) transcription server
After=network-online.target
Wants=network-online.target

[Service]
User=tom
WorkingDirectory=/home/tom/blackbird_dev/KEYSTONE
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
EnvironmentFile=/home/tom/blackbird_dev/KEYSTONE/.env
StandardOutput=append:/var/log/keystone.log
StandardError=append:/var/log/keystone.log

[Install]
WantedBy=multi-user.target
```

If this file is lost, recreate it with the block above, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now keystone.service
```
