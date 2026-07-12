# Configuration Guide — MCP Terminal

MCP Terminal is configured via `mcp-terminal.config.json` in the project root. If this file doesn't exist, sensible defaults are used.

## Config File

Create `mcp-terminal.config.json` in the same directory as your `package.json`:

```json
{
  "allowedCommands": ["node", "npm", "npx", "echo", "git", "docker"],
  "logRetentionDays": 7,
  "maxLogSize": 52428800,
  "autoRestart": true,
  "maxRestarts": 5,
  "restartDelayMs": 2000,
  "healthCheckIntervalMs": 30000,
  "killTimeoutMs": 5000
}
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `allowedCommands` | `string[]` | (see below) | List of commands allowed via `start_process`. Others are rejected. |
| `logRetentionDays` | `number` | `7` | Auto-delete log files older than N days. |
| `maxLogSize` | `number` | `52428800` (50MB) | Max log file size before rotation. |
| `autoRestart` | `boolean` | `true` | Auto-restart crashed processes (exit code ≠ 0). |
| `maxRestarts` | `number` | `5` | Max auto-restart attempts before giving up. |
| `restartDelayMs` | `number` | `2000` | Delay (ms) before auto-restart. |
| `healthCheckIntervalMs` | `number` | `30000` | Interval (ms) for health check loop. |
| `killTimeoutMs` | `number` | `5000` | Wait time (ms) before force-kill (SIGKILL). |

## Default Allowed Commands

```json
[
  "node", "npm", "npx", "pnpm", "yarn", "bun",
  "python", "python3", "pip",
  "git", "docker", "docker-compose",
  "bash", "sh", "zsh",
  "curl", "wget",
  "ls", "cat", "echo", "grep", "find", "ps", "top"
]
```

Add or remove commands as needed for your security requirements.

## Security Notes

- `start_process` uses `execFile` with `shell: false` — no shell injection possible
- Commands not in `allowedCommands` are rejected with a clear error
- The `run_script` tool uses `shell: true` — use it only when shell pipeline is required
- Command arguments are validated: max 50, max 256 chars each, no path traversal
