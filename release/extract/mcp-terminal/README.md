# MCP Terminal

MCP server for managing long-running processes and logs.

## Installation

```bash
npm install
```

## Usage

```bash
npm run build
node dist/index.js
```

## MCP Configuration

Add to your Claude Code `settings.json`:

```json
{
  "mcpServers": {
    "mcp-terminal": {
      "command": "node",
      "args": ["/path/to/mcp-terminal/dist/index.js"]
    }
  }
}
```

## Tools

- `start_process` - Start a long-running process
- `stop_process` - Stop a running process
- `get_logs` - Get logs from a process
- `search_logs` - Search logs for a keyword
- `list_processes` - List all running processes
