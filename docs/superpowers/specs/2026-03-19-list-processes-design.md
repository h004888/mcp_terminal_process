# MCP Terminal - list_processes Tool

## Overview

Add a new MCP tool `list_processes` to list all currently running processes managed by the MCP Terminal server.

## Tool Specification

### list_processes

**Input:** `{}` (empty object, no parameters required)

**Output:**
```typescript
{
  processes: [
    {
      id: string;       // Process identifier
      status: "running";
      command: string;  // The command that was executed
      logFile: string;  // Path to log file
    }
  ]
}
```

**Behavior:**
- Iterate through internal `ProcessManager.processes` Map
- Return array of all running processes with their metadata
- If no processes running, return empty array `[]`

**Error cases:** None - always succeeds with valid response

---

## Files to Modify

1. `src/types.ts` - Add `ListProcessesOutput` interface
2. `src/processManager.ts` - Add `listProcesses()` method
3. `src/index.ts` - Register `list_processes` tool in MCP server

---

## Acceptance Criteria

1. `list_processes` returns all running process IDs with status "running"
2. `list_processes` returns empty array when no processes are running
3. Tool is registered in MCP server and callable via Claude Code
