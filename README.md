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

Thêm vào file `settings.json` của Claude Code:

**Windows:** `%USERPROFILE%\.claude\settings.json`
**macOS/Linux:** `~/.claude/settings.json`

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

Thêm vào file `config.json` của OpenCode:

**Đường dẫn mặc định:** `~/.config/opencode/config.json`

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

Add to your Claude Code `settings.json`:

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

Start a long-running process.

```json
{
  "id": "backend",
  "command": "npm run dev",
  "cwd": "C:/path/to/project"
}
```

**Parameters:**
- `id` (required) - Unique process identifier
- `command` (required) - Command to execute
- `cwd` (optional) - Working directory

---

### stop_process

Stop a running process.

```json
{
  "id": "backend"
}
```

---

### get_logs

Retrieve logs from a process.

```json
{
  "id": "backend",
  "lines": 100
}
```

**Parameters:**
- `id` (required) - Process identifier
- `lines` (optional) - Return last N lines only

---

### search_logs

Search logs for a keyword or regex.

```json
{
  "id": "backend",
  "keyword": "ERROR",
  "regex": false
}
```

**Parameters:**
- `id` (required) - Process identifier
- `keyword` (required) - Search term
- `regex` (optional) - Use regex search (default: false)

---

### list_processes

List all running processes.

```json
{}
```

Returns all currently running processes with their IDs, status, command, and log file paths.

## Usage Examples

### Start a backend server

```
/mcp start_process {"id": "backend", "command": "npm run dev", "cwd": "C:/my-project"}
```

### Check logs

```
/mcp get_logs {"id": "backend"}
```

### Search for errors

```
/mcp search_logs {"id": "backend", "keyword": "Exception"}
```

### List all processes

```
/mcp list_processes {}
```

### Stop a process

```
/mcp stop_process {"id": "backend"}
```

## Architecture

```
User (Claude Code) → MCP Protocol → MCP Server → Process Manager → logs/*.log
```

**Components:**
- **MCP Server** - Handles MCP protocol and exposes tools
- **Process Manager** - Spawns, tracks, and kills child processes
- **Log Service** - File-based log storage with 10MB rotation

## Log Files

Logs are stored in the `logs/` directory:
- `logs/{id}.log` - Current active log
- `logs/{id}.1.log` - Rotated log (oldest)
- etc.

Logs are rotated when they exceed 10MB. Maximum 5 rotated files kept per process.

## License

MIT
