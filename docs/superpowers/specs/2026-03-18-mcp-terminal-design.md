# MCP Terminal - AI Agent Process Management

## Overview

Local MCP server enabling AI agents (Claude Code) to manage persistent processes and query logs via MCP protocol.

## Architecture

```
User (Claude Code) → MCP Protocol → MCP Server → Process Manager → logs/*.log
```

**Components:**
- **MCP Server**: Node.js with @modelcontextprotocol/sdk, handles protocol and exposes tools
- **Process Manager**: Spawns, tracks, and kills child processes
- **Log Service**: File-based log storage with rotation

## MCP Tools

### start_process

**Input:**
```typescript
{
  id: string;      // Process identifier, e.g., "backend"
  command: string; // Command to execute, e.g., "mvn spring-boot:run"
  cwd?: string;    // Working directory, defaults to process.cwd()
}
```

**Output:**
```typescript
{ id: string; status: "started" }
```

**Errors:**
- `Command is required` - empty command
- `Process '${id}' is already running` - duplicate ID

---

### stop_process

**Input:**
```typescript
{ id: string; }
```

**Output:**
```typescript
{ id: string; status: "stopped" }
```

**Errors:**
- `Process '${id}' not found`

---

### get_logs

**Input:**
```typescript
{
  id: string;
  lines?: number; // Return last N lines, default: all
}
```

**Output:**
```typescript
{ id: string; logs: string }
```

**Errors:**
- `Process '${id}' not found`
- `No logs found for process '${id}'`

---

### search_logs

**Input:**
```typescript
{
  id: string;
  keyword: string;
  regex?: boolean; // true = regex search, default: false
}
```

**Output:**
```typescript
{ id: string; matches: string[] }
```

**Errors:**
- `Process '${id}' not found`
- `No logs found for process '${id}'`

---

## Data Flow

### start_process
1. Validate input
2. Create log file: `logs/{id}.log`
3. Spawn child process with piped stdout/stderr
4. Stream stdout/stderr → log file (append mode)
5. Store process in `Map<id, ChildProcess>`
6. Return `{ id, status: "started" }`

### stop_process
1. Find process in Map
2. Send SIGTERM
3. Force SIGKILL after 5s timeout
4. Remove from Map
5. Return `{ id, status: "stopped" }`

### Graceful Shutdown
When MCP server stops → kill all managed processes.

---

## Log Rotation

```
logs/
├── backend.log      # Current active log
├── backend.1.log   # Rotated (oldest)
├── backend.2.log
├── ...
```

**Rules:**
- Max file size: 10MB
- Max 5 rotated files per process
- When file > 10MB: rotate with deletion of oldest

---

## Project Structure

```
mcp-terminal/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── processManager.ts  # Process lifecycle management
│   ├── logService.ts      # Log file + rotation
│   ├── config.ts          # Configuration constants
│   └── types.ts           # TypeScript types
└── logs/                  # Auto-created log files
```

---

## Configuration

```typescript
// src/config.ts
export const config = {
  logsDir: "logs",
  maxFileSize: 10 * 1024 * 1024,  // 10MB
  maxRotatedFiles: 5,
  killTimeout: 5000,  // 5s before SIGKILL
};
```

---

## Error Handling

All errors return structured responses:
```typescript
{ error: "Error message" }
```

| Operation | Error Cases |
|-----------|-------------|
| start_process | Empty command, duplicate ID, file creation failure, spawn failure |
| stop_process | Process not found, kill failure |
| get_logs | Process not found, log file not found, read error |
| search_logs | Process not found, log file not found |

---

## Acceptance Criteria

1. Claude Code can start a long-running process via `start_process`
2. Process stdout/stderr are captured to log file in real-time
3. Claude Code can retrieve logs via `get_logs`
4. Claude Code can search logs via `search_logs` with keyword/regex
5. Claude Code can stop process via `stop_process`
6. Log rotation prevents disk space exhaustion
7. All processes are cleaned up when MCP server shuts down
8. Clear error messages for all failure cases
