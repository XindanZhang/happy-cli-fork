# Happy

Code on the go controlling claude code from your mobile device.

Free. Open source. Code anywhere.

## Installation

```bash
npm install -g happy-coder
```

## Usage

```bash
happy
```

This will:
1. Start a Claude Code session
2. Display a QR code to connect from your mobile device
3. Allow real-time session sharing between Claude Code and your mobile app

## Commands

- `happy auth` – Manage authentication
- `happy codex` – Start Codex mode
- `happy connect` – Store AI vendor API keys in Happy cloud
- `happy notify` – Send a push notification to your devices
- `happy daemon` – Manage background service
- `happy doctor` – System diagnostics & troubleshooting

## Rebuild & reinstall this fork (keep using the Happy mobile app)

The iOS/Android app talks to the CLI via Happy’s server; your auth + device pairing is stored in `~/.happy`, so you can swap the CLI binary without re-pairing.

From this repo:

```bash
cd <path-to-this-repo>

# Install deps (we used npm here; yarn also works if you have it)
npm install --no-package-lock

# Build dist/
npm run build

# Reinstall globally into the same Node prefix that your current `happy` uses (nvm-safe)
HAPPY_PREFIX="$(cd "$(dirname "$(command -v happy)")/.." && pwd)"
npm install -g --prefix "$HAPPY_PREFIX" --force .
hash -r

# Restart the background daemon so it picks up the new code
happy daemon stop
happy daemon start
happy daemon status
```

To verify you’re running the fork, `happy daemon status` should show the daemon command using your local checkout’s `dist/index.mjs` (not a global package path).

## Options

- `-h, --help` - Show help
- `-v, --version` - Show version
- `-m, --model <model>` - Claude model to use (default: sonnet)
- `-p, --permission-mode <mode>` - Permission mode: auto, default, or plan
- `--claude-env KEY=VALUE` - Set environment variable for Claude Code (e.g., for [claude-code-router](https://github.com/musistudio/claude-code-router))
- `--claude-arg ARG` - Pass additional argument to Claude CLI

## Environment Variables

- `HAPPY_SERVER_URL` - Custom server URL (default: https://api.cluster-fluster.com)
- `HAPPY_WEBAPP_URL` - Custom web app URL (default: https://app.happy.engineering)
- `HAPPY_HOME_DIR` - Custom home directory for Happy data (default: ~/.happy)
- `HAPPY_DISABLE_CAFFEINATE` - Disable macOS sleep prevention (set to `true`, `1`, or `yes`)
- `HAPPY_EXPERIMENTAL` - Enable experimental features (set to `true`, `1`, or `yes`)

## Requirements

- Node.js >= 20.0.0
  - Required by `eventsource-parser@3.0.5`, which is required by
  `@modelcontextprotocol/sdk`, which we used to implement permission forwarding
  to mobile app
- Claude CLI installed & logged in (`claude` command available in PATH)

## License

MIT
