# MCP Terminal

MCP server for managing long-running processes and logs. Enables AI agents (Claude Code) to start, stop, and monitor processes with real-time log capture.

---

## Tiếng Việt

### Tính năng

- **Khởi động/Dừng Process** - Chạy các process dài và tắt chúng một cách an toàn
- **Ghi Log thời gian thực** - Tất cả stdout/stderr được tự động ghi vào file log
- **Tìm kiếm Log** - Tìm log theo từ khóa hoặc regex
- **Quản lý Process** - Liệt kê các process đang chạy
- **Log Rotation** - Tự động xoay log khi đạt 10MB để tránh đầy ổ đĩa
- **Tắt an toàn** - Tất cả process được dọn dẹp khi server dừng

### Cài đặt

#### Yêu cầu

- Node.js >= 18
- npm

#### Các bước

```bash
# Clone repository
git clone https://github.com/h004888/mcp_terminal_process.git
cd mcp-terminal

# Cài đặt dependencies
npm install

# Build
npm run build
```

### Cấu hình Claude Code

Thêm vào file `.claude.json` của Claude Code:

**Windows:** `%USERPROFILE%\.claude.json`
**macOS/Linux:** `~/.claude.json`

```json
{
  "mcpServers": {
    "mcp-terminal": {
      "command": "node",
      "args": ["C:/đường-dẫn/đến/mcp-terminal/dist/index.js"]
    }
  }
}
```

### Cấu hình OpenCode

Thêm vào file `opencode.json` của OpenCode:

**Đường dẫn mặc định:** `~/.config/opencode/opencode.json`

```json
{
  "mcp": {
    "mcp-terminal": {
      "type": "local",
      "command": ["node", "/đường-dẫn/đến/mcp-terminal/dist/index.js"],
      "environment": {},
      "timeout": 5000
    }
  }
}
```

---

## English

## Features

- **Start/Stop Processes** - Launch long-running processes and terminate them gracefully
- **Real-time Log Capture** - All stdout/stderr automatically written to log files
- **Log Search** - Search logs by keyword or regex
- **Process Management** - List all running processes
- **Log Rotation** - Automatic rotation at 10MB to prevent disk exhaustion
- **Graceful Shutdown** - All processes cleaned up when server stops

## Installation

### Prerequisites

- Node.js >= 18
- npm

### Steps

```bash
# Clone the repository
git clone https://github.com/h004888/mcp_terminal_process.git
cd mcp-terminal

# Install dependencies
npm install

# Build
npm run build
```

## Claude Code Configuration

Add to your Claude Code `.claude.json`:

**Windows:** `%USERPROFILE%\.claude.json`
**macOS/Linux:** `~/.claude.json`

```json
{
  "mcpServers": {
    "mcp-terminal": {
      "command": "node",
      "args": ["C:/path/to/mcp-terminal/dist/index.js"]
    }
  }
}
```

After configuration, restart Claude Code to load the MCP server.

## OpenCode Configuration

Add to your OpenCode `opencode.json`:

**Default location:** `~/.config/opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "mcp-terminal": {
      "type": "local",
      "command": ["node", "/path/to/mcp-terminal/dist/index.js"],
      "environment": {},
      "timeout": 5000,
      "enabled": true
    }
  }
}
```

**Example with full path (Windows):**
```json
{
  "mcp": {
    "mcp-terminal": {
      "type": "local",
      "command": ["node", "C:/Users/ADMIN/Downloads/mcp-terminal/dist/index.js"],
      "environment": {},
      "timeout": 5000,
       "enabled": true
    }
  }
}
```

**Example using npx (if published to npm):**
```json
{
  "mcp": {
    "mcp-terminal": {
      "type": "local",
      "command": ["npx", "-y", "mcp-terminal"],
      "timeout": 5000,
       "enabled": true
    }
  }
}
```

After configuration, restart OpenCode to load the MCP server.

## Tools

### start_process

Start a long-running process using execFile (secure, no shell).

```json
{
  "id": "backend",
  "command": "node",
  "args": ["server.js"],
  "cwd": "C:/path/to/project",
  "group": "services",
  "autoRestart": true,
  "maxRestarts": 3,
  "env": { "NODE_ENV": "production" }
}
```

**Parameters:**
- `id` (required) - Unique process identifier (a-zA-Z0-9_-)
- `command` (required) - Command to execute (must be in allowlist)
- `args` (optional) - Command arguments as array
- `cwd` (optional) - Working directory
- `group` (optional) - Process group for batch operations
- `autoRestart` (optional) - Auto-restart on crash (default: true)
- `maxRestarts` (optional) - Maximum restarts (default: 5)
- `env` (optional) - Environment variables

### stop_process

Stop a running process. Uses `taskkill` on Windows, `SIGTERM→SIGKILL` on Unix.

```json
{ "id": "backend" }
```

### restart_process

Stop and restart a running process with the same parameters.

```json
{ "id": "backend" }
```

### get_logs

Retrieve logs from a process (streaming tail, memory-safe).

```json
{ "id": "backend", "lines": 100 }
```

**Parameters:**
- `id` (required) - Process identifier
- `lines` (optional) - Return last N lines only

### search_logs

Search logs for a keyword or regex (streaming search, safe for large files).

```json
{ "id": "backend", "keyword": "ERROR", "regex": false }
```

### list_processes

List all running processes, with optional group filter.

```json
{ "group": "backend" }
```

### get_process_status

Get detailed status including CPU, memory, uptime, restart count.

```json
{ "id": "backend" }
```

**Returns:**
```json
{
  "id": "backend",
  "status": "running",
  "cpu": "2.3",
  "memory": "45MB",
  "uptime": "2h 13m",
  "restarts": 0,
  "group": "services",
  "command": "node server.js",
  "logFile": "logs/backend/2026-07-12T10-00-00.log",
  "startedAt": "2026-07-12T10:00:00.000Z"
}
```

### run_script

Execute a shell pipeline script. Uses shell mode — only use when shell features are needed.

```json
{ "id": "build", "command": "npm run build && echo done", "cwd": "C:/project" }
```

### stop_process_group

Stop all processes in a group.

```json
{ "group": "backend" }
```

### batch_start

Start multiple processes from a JSON array.

```json
{
  "commands": [
    { "id": "api", "command": "node", "args": ["api.js"], "group": "backend" },
    { "id": "web", "command": "node", "args": ["web.js"], "group": "frontend" }
  ]
}
```

## Configuration

See [CONFIGURATION.md](CONFIGURATION.md) for all config options including command allowlist, log retention, and auto-restart settings.

## Usage Examples

### Start a backend server with auto-restart
```
/mcp start_process {"id": "backend", "command": "node", "args": ["server.js"], "group": "services", "cwd": "C:/my-project"}
```

### Monitor a process
```
/mcp get_process_status {"id": "backend"}
```

### Check logs
```
/mcp get_logs {"id": "backend", "lines": 50}
```

### Search for errors
```
/mcp search_logs {"id": "backend", "keyword": "Exception"}
```

### Restart a process
```
/mcp restart_process {"id": "backend"}
```

### Start a full stack
```
/mcp batch_start {"commands": [{"id":"db","command":"docker","args":["compose","up"],"group":"backend"},{"id":"api","command":"node","args":["server.js"],"group":"backend"}]}
```

### Stop all processes in a group
```
/mcp stop_process_group {"group": "backend"}
```

### List all running processes
```
/mcp list_processes {}
```

### Stop a process
```
/mcp stop_process {"id": "backend"}
```

## Architecture

```
User (Claude Code) → MCP Protocol → MCP Terminal Server
                                       │
                          ┌────────────┴────────────┐
                          │ Process Manager          │
                          │  ├─ execFile (secure)    │
                          │  ├─ process groups       │
                          │  ├─ auto-restart         │
                          │  ├─ health checker       │
                          │  └─ platform kill        │
                          │    (taskkill / SIGTERM)  │
                          │                          │
                          │ Log Service               │
                          │  ├─ session-based logs   │
                          │  ├─ streaming tail read  │
                          │  ├─ 7-day retention      │
                          │  └─ 50MB rotation        │
                          └──────────────────────────┘

Logs: logs/{processId}/{sessionId}.log
Config: mcp-terminal.config.json
```

## Log Files

Logs are stored in `logs/` directory with session-based organization:
- `logs/{processId}/{timestamp}.log` - Current session log
- `logs/{processId}/{timestamp}.1.log` - Rotated (old) logs

Features:
- **Session-based**: Each restart creates a new log file — no mixing
- **Streaming reads**: `get_logs` uses binary tail, safe for multi-GB files
- **Auto-cleanup**: Logs older than 7 days are deleted automatically
- **Rotation**: Files >50MB are rotated (configurable)

## License

MIT
