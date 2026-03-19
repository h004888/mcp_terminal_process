# list_processes Tool Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `list_processes` MCP tool to list all running processes.

**Architecture:** Add `listProcesses()` method to ProcessManager, register tool in MCP server, update types.

**Tech Stack:** Node.js, TypeScript, @modelcontextprotocol/sdk

---

## Task 1: Add listProcesses to ProcessManager

**Files:**
- Modify: `src/processManager.ts`
- Modify: `src/types.ts`
- Modify: `tests/processManager.test.ts`

- [ ] **Step 1: Add ListProcessesOutput type to types.ts**

Add to `src/types.ts`:
```typescript
export interface ListProcessesOutput {
  processes: {
    id: string;
    status: "running";
    command: string;
    logFile: string;
  }[];
}
```

- [ ] **Step 2: Write failing test for listProcesses**

Append to `tests/processManager.test.ts`:
```typescript
test('listProcesses returns all running processes', async () => {
  const processManager = new ProcessManager(testLogsDir);

  // Start two processes
  await processManager.startProcess({
    id: 'proc1',
    command: 'echo test1',
  });

  await processManager.startProcess({
    id: 'proc2',
    command: 'echo test2',
  });

  const result = await processManager.listProcesses();

  expect(result.processes).toHaveLength(2);
  expect(result.processes.some(p => p.id === 'proc1')).toBe(true);
  expect(result.processes.some(p => p.id === 'proc2')).toBe(true);
});

test('listProcesses returns empty array when no processes', async () => {
  const processManager = new ProcessManager(testLogsDir);

  const result = await processManager.listProcesses();

  expect(result.processes).toEqual([]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/processManager.test.ts::'listProcesses returns'`
Expected: FAIL - listProcesses not defined

- [ ] **Step 4: Add listProcesses method to ProcessManager**

Add to `src/processManager.ts`:
```typescript
async listProcesses(): Promise<{ processes: { id: string; status: "running"; command: string; logFile: string }[] }> {
  const processes: { id: string; status: "running"; command: string; logFile: string }[] = [];

  for (const [id, processInfo] of this.processes) {
    // Get command from spawn arguments (stored in process.spawnargs)
    const command = processInfo.process.spawnargs?.join(' ') || '';

    processes.push({
      id,
      status: 'running',
      command,
      logFile: processInfo.logFile,
    });
  }

  return { processes };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/processManager.test.ts::'listProcesses'`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/processManager.ts src/types.ts tests/processManager.test.ts && git commit -m "feat: add listProcesses to ProcessManager"
```

---

## Task 2: Register list_processes tool in MCP server

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add list_processes to tool list in index.ts**

In the `ListToolsRequestSchema` handler, add to tools array:
```typescript
{
  name: 'list_processes',
  description: 'List all running processes managed by this MCP server',
  inputSchema: {
    type: 'object',
    properties: {},
  },
},
```

- [ ] **Step 2: Add case for list_processes in CallToolRequestSchema handler**

```typescript
case 'list_processes': {
  const result = await processManager.listProcesses();
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src/index.ts && git commit -m "feat: add list_processes MCP tool"
```

---

## Verification

After completing all tasks:

1. **Build**: `npm run build`
2. **Test**: `npm test`
3. **Manual test**:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run dev
   ```

Expected: `list_processes` appears in tools list

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add listProcesses method to ProcessManager |
| 2 | Register list_processes in MCP server |
