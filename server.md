# Happy Server (Self‑Hosted) + Stable Cloudflare Tunnel (macOS)

This guide reproduces the setup used to unblock Happy’s QR/mobile auth when the default hosted backend is down (many users saw `404` from `api.cluster-fluster.com`, e.g. `slopus/happy-cli#111`).

End result:
- Your own `happy-server` runs locally on your Mac (default `http://localhost:3005`)
- Cloudflare Tunnel exposes it as a stable HTTPS URL like `https://happy.<your-domain>`
- You paste that URL into the Happy iPhone app “Custom Server URL” and set `HAPPY_SERVER_URL` for the CLI

---

## 0) Prerequisites

- macOS
- Docker Desktop (running)
- Homebrew
- Node.js (Happy Server targets Node 20; newer may work)
- `yarn` (classic)
- `cloudflared`
- A Cloudflare account with your domain **Active** in Cloudflare DNS (we’ll use placeholders like `happy.<your-domain>` below)

Install tools:

```bash
brew install yarn cloudflared
```

Sanity checks:

```bash
docker version
node -v
yarn -v
cloudflared version
```

---

## 1) Get the Happy Server code

Clone the server repo (choose any folder you like):

```bash
git clone https://github.com/slopus/happy-server.git
cd happy-server
yarn install
```

---

## 2) Configure env

`happy-server` ships with `.env.dev` (dev defaults). Create a separate `.env` for your secrets and overrides.

Generate a strong secret and write `.env`:

```bash
SECRET="$(openssl rand -hex 32)"
cat > .env <<EOF
HANDY_MASTER_SECRET=$SECRET

# Optional hardening for local self-hosting:
METRICS_ENABLED=false

# NOTE: In happy-server, this is treated as “enabled if set”.
# To disable, leave it empty (or delete the key entirely).
DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING=
EOF
```

Why the env file order matters:
- `.env.dev` contains convenient defaults (including debug flags)
- We’ll start the server with `.env.dev` first, then `.env`, so `.env` overrides `.env.dev`

---

## 3) Start dependencies (Postgres, Redis, MinIO)

Happy Server needs:
- Postgres (DB)
- Redis (pub/sub)
- MinIO (S3-compatible storage)

### Postgres

The repo has `yarn db`, but depending on which `postgres` image your Docker pulls, it may fail with a Postgres 18 volume-mount warning.

Reliable command (names the container and uses the Postgres 18+ mount style):

```bash
docker rm -f happy_postgres 2>/dev/null || true
docker run -d \
  --name happy_postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=handy \
  -v "$(pwd)/.pgdata:/var/lib/postgresql" \
  -p 5433:5432 \
  postgres
```

Update the database port in `happy-server/.env.dev` so the server connects to the new host port:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/handy
```

### Redis

```bash
docker rm -f happy_redis 2>/dev/null || true
docker run -d --name happy_redis -p 6379:6379 redis
```

### MinIO (S3)

```bash
docker rm -f minio 2>/dev/null || true
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -v "$(pwd)/.minio/data:/data" \
  minio/minio server /data --console-address :9001
```

### Initialize the bucket

The built-in `yarn s3:init` can fail due to host-shell variable expansion. This manual init is reliable:

```bash
docker run --rm \
  --network container:minio \
  --entrypoint /bin/sh \
  minio/mc \
  -c "mc alias set local http://localhost:9000 minioadmin minioadmin \
      && mc mb -p local/happy || true \
      && mc anonymous set download local/happy"
```

### Make containers auto-restart (optional but recommended)

```bash
docker update --restart unless-stopped happy_postgres happy_redis minio
```

Check everything is up:

```bash
docker ps
```

---

## 4) Run DB migrations

```bash
cd happy-server
yarn migrate
```

---

## 5) Start Happy Server locally

Run it in the foreground first:

```bash
cd happy-server
./node_modules/.bin/tsx --env-file=.env.dev --env-file=.env ./sources/main.ts
```

Verify:

```bash
curl -fsSL http://localhost:3005/
```

Expected response:

```
Welcome to Happy Server!
```

> Want a different port? Set `PORT=4000` (or any port) in `.env.dev` or `.env`, then also update the tunnel config `service: http://localhost:<port>` later.

---

## 6) Create a stable Cloudflare Tunnel (domain must be “Active”)

### 6.1 Login cloudflared (one-time)

```bash
cloudflared tunnel login
```

A browser opens. Pick your Cloudflare account and authorize for your zone (e.g. `<your-domain>`).

### 6.2 Create a named tunnel + DNS route

```bash
cloudflared tunnel create happy
cloudflared tunnel route dns -f happy happy.<your-domain>
```

This creates:
- a tunnel ID (UUID)
- a credentials JSON file in `~/.cloudflared/<UUID>.json`
- a DNS record `happy.<your-domain>` pointing to the tunnel

### 6.3 Write `~/.cloudflared/config.yml`

Replace the UUID + JSON path with what `cloudflared tunnel create` printed:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: ~/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: happy.<your-domain>
    service: http://localhost:3005
  - service: http_status:404
```

### 6.4 Run the tunnel

```bash
cloudflared tunnel run happy
```

Verify from your Mac:

```bash
curl -fsSL https://happy.<your-domain>/
```

---

## 7) Point the iPhone app + CLI to your server

### iPhone Happy app

- Settings → **Custom Server URL**
- Set it to: `https://happy.<your-domain>`

### CLI

Temporary (current terminal only):

```bash
export HAPPY_SERVER_URL=https://happy.<your-domain>
```

Persistent (every new terminal): add this to `~/.zshrc`:

```bash
export HAPPY_SERVER_URL=https://happy.<your-domain>
```

Reload:

```bash
source ~/.zshrc
```

Now authenticate:

```bash
happy auth login --force
```

Pick “Mobile App”, then scan the QR code with the Happy app and approve.

---

## 8) Auto-start on login (optional but recommended)

You need two long-running processes:
- `happy-server` (local backend)
- `cloudflared tunnel run happy` (stable HTTPS tunnel)

You can run them in two terminals, **or** use macOS LaunchAgents.

### 8.1 Happy Server LaunchAgent

Create `$HOME/Library/LaunchAgents/com.happy.server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.happy.server</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"; cd "&lt;path-to-happy-server&gt;" &amp;&amp; ./node_modules/.bin/tsx --env-file=.env.dev --env-file=.env ./sources/main.ts</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
  </dict>
</plist>
```

Load it:

```bash
launchctl load -w ~/Library/LaunchAgents/com.happy.server.plist
```

### 8.2 Cloudflared LaunchAgent

Create `$HOME/Library/LaunchAgents/com.cloudflare.cloudflared.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.cloudflare.cloudflared</string>
    <key>ProgramArguments</key>
    <array>
      <string>/opt/homebrew/bin/cloudflared</string>
      <string>tunnel</string>
      <string>run</string>
      <string>happy</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
    </dict>
  </dict>
</plist>
```

Load it:

```bash
launchctl load -w ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
```

### 8.3 Useful checks

```bash
launchctl list | rg -n "com\\.happy\\.server|com\\.cloudflare\\.cloudflared"
curl -fsSL https://happy.<your-domain>/
docker ps
```

---

## Troubleshooting

### “Happy server returned HTTP 404”

That usually means you are still hitting the default hosted backend (`api.cluster-fluster.com`) and it’s down/misrouted.
- Ensure the iPhone app has Custom Server URL set
- Ensure your CLI has `HAPPY_SERVER_URL` set

### Cloudflare shows `530` / “server returned an error”

One of these isn’t running:
- `happy-server` on `localhost:<port>`
- `cloudflared tunnel run happy`

### Domain resolves in `dig` but not in `curl` / Node

Some networks/DNS configurations can break macOS resolver behavior.

Quick fix: set Wi‑Fi DNS to public resolvers:

```bash
networksetup -setdnsservers "Wi-Fi" 1.1.1.1 8.8.8.8
```

Revert to DHCP/default:

```bash
networksetup -setdnsservers "Wi-Fi" Empty
```

### Postgres container exits immediately (Postgres 18 mount warning)

Use the `docker run ... -v "$(pwd)/.pgdata:/var/lib/postgresql"` form shown above, or pin to `postgres:17`.
