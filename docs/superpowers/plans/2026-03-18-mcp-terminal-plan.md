# MCP Terminal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that enables AI agents (Claude Code) to start/stop processes and query their logs in real-time.

**Architecture:** Node.js MCP server using @modelcontextprotocol/sdk. Process Manager spawns child processes and streams their output to rotating log files. Log Service handles file-based storage with 10MB rotation.

**Tech Stack:** Node.js, TypeScript, @modelcontextprotocol/sdk, Node.js built-in modules (fs, child_process, path)

---

## File Structure

```
mcp-terminal/
├── package.json              # Dependencies + scripts
├── tsconfig.json            # TypeScript config
├── src/
│   ├── index.ts            # MCP server entry point
│   ├── processManager.ts   # Process lifecycle (spawn, kill, track)
│   ├── logService.ts       # Log file + rotation
│   ├── config.ts           # Configuration constants
│   └── types.ts            # TypeScript interfaces
├── tests/
│   ├── logService.test.ts  # Log rotation tests
│   └── processManager.test.ts # Process management tests
└── logs/                   # Runtime log files (gitignored)
```

---

## Chunk 1: Project Setup

### Task 1: Initialize Node.js project with TypeScript

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "mcp-terminal",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "prepack": "npm run build"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: packages installed successfully

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npm run build`
Expected: dist/ folder created with compiled JS

- [ ] **Step 5: Commit**

```bash
git init && git add package.json tsconfig.json && git commit -m "chore: initialize Node.js TypeScript project"
```

---

### Task 2: Create types and config

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
export interface StartProcessInput {
  id: string;
  command: string;
  cwd?: string;
}

export interface StartProcessOutput {
  id: string;
  status: "started";
}

export interface StopProcessInput {
  id: string;
}

export interface StopProcessOutput {
  id: string;
  status: "stopped";
}

export interface GetLogsInput {
  id: string;
  lines?: number;
}

export interface GetLogsOutput {
  id: string;
  logs: string;
}

export interface SearchLogsInput {
  id: string;
  keyword: string;
  regex?: boolean;
}

export interface SearchLogsOutput {
  id: string;
  matches: string[];
}

export interface ProcessInfo {
  id: string;
  process: globalThis.ChildProcess;
  logFile: string;
  status: "running" | "stopped";
}
```

- [ ] **Step 2: Create src/config.ts**

```typescript
export const config = {
  logsDir: "logs",
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxRotatedFiles: 5,
  killTimeout: 5000, // 5s before SIGKILL
};
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/config.ts && git commit -m "feat: add types and configuration"
```

---

## Chunk 2: Log Service with Rotation

### Task 3: LogService - Create and append logs

**Files:**
- Create: `src/logService.ts`
- Create: `tests/logService.test.ts`

- [ ] **Step 1: Write failing test for appendLog**

```typescript
// tests/logService.test.ts
import { LogService } from '../src/logService';
import fs from 'fs';
import path from 'path';

describe('LogService', () => {
  const testLogsDir = path.join(__dirname, 'test-logs');

  beforeEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
    fs.mkdirSync(testLogsDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
  });

  test('appendLog creates file if not exists', async () => {
    const logService = new LogService(testLogsDir, 10 * 1024 * 1024, 5);
    const logFile = path.join(testLogsDir, 'test.log');

    await logService.appendLog(logFile, 'Hello, World!\n');

    expect(fs.existsSync(logFile)).toBe(true);
    expect(fs.readFileSync(logFile, 'utf-8')).toBe('Hello, World!\n');
  });

  test('appendLog appends to existing file', async () => {
    const logService = new LogService(testLogsDir, 10 * 1024 * 1024, 5);
    const logFile = path.join(testLogsDir, 'test.log');

    await logService.appendLog(logFile, 'Line 1\n');
    await logService.appendLog(logFile, 'Line 2\n');

    expect(fs.readFileSync(logFile, 'utf-8')).toBe('Line 1\nLine 2\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/logService.test.ts`
Expected: FAIL - LogService not found

- [ ] **Step 3: Write minimal LogService implementation**

```typescript
// src/logService.ts
import fs from 'fs';
import path from 'path';

export class LogService {
  constructor(
    private logsDir: string,
    private maxFileSize: number,
    private maxRotatedFiles: number
  ) {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  async appendLog(logFile: string, content: string): Promise<void> {
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await fs.promises.appendFile(logFile, content, 'utf-8');
  }

  async readLog(logFile: string, lines?: number): Promise<string> {
    if (!fs.existsSync(logFile)) {
      throw new Error(`Log file not found: ${logFile}`);
    }

    const content = await fs.promises.readFile(logFile, 'utf-8');

    if (lines === undefined) {
      return content;
    }

    const allLines = content.split('\n');
    return allLines.slice(-lines).join('\n');
  }

  async searchLog(logFile: string, keyword: string, isRegex: boolean = false): Promise<string[]> {
    if (!fs.existsSync(logFile)) {
      throw new Error(`Log file not found: ${logFile}`);
    }

    const content = await fs.promises.readFile(logFile, 'utf-8');
    const lines = content.split('\n');

    if (isRegex) {
      let regex: RegExp;
      try {
        regex = new RegExp(keyword);
      } catch {
        throw new Error('Invalid regex');
      }
      return lines.filter(line => regex.test(line));
    }

    return lines.filter(line => line.includes(keyword));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/logService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/logService.ts tests/logService.test.ts && git commit -m "feat: add LogService with appendLog"
```

---

### Task 4: LogService - Log rotation

**Files:**
- Modify: `tests/logService.test.ts`

- [ ] **Step 1: Write failing test for rotation**

```typescript
test('rotateLog renames existing file and creates new one', async () => {
  const logService = new LogService(testLogsDir, 100, 3); // 100 bytes max
  const logFile = path.join(testLogsDir, 'test.log');

  // Create initial file
  await logService.appendLog(logFile, 'A'.repeat(50) + '\n');
  expect(fs.existsSync(logFile)).toBe(true);
  expect(fs.existsSync(logFile + '.1')).toBe(false);

  // Append to trigger rotation
  await logService.appendLog(logFile, 'B'.repeat(50) + '\n');

  // Should have rotated
  expect(fs.existsSync(logFile + '.1')).toBe(true);
  expect(fs.readFileSync(logFile, 'utf-8')).toBe(''); // New empty file
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/logService.test.ts::'rotateLog renames'`
Expected: FAIL - rotation not implemented

- [ ] **Step 3: Implement rotation in appendLog**

```typescript
// src/logService.ts - Updated appendLog method
async appendLog(logFile: string, content: string): Promise<void> {
  const dir = path.dirname(logFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Check if rotation needed
  if (fs.existsSync(logFile)) {
    const stats = await fs.promises.stat(logFile);
    if (stats.size >= this.maxFileSize) {
      await this.rotateLog(logFile);
    }
  }

  await fs.promises.appendFile(logFile, content, 'utf-8');
}

private async rotateLog(logFile: string): Promise<void> {
  // Delete oldest rotated file if exists
  const oldestFile = `${logFile}.${this.maxRotatedFiles}`;
  if (fs.existsSync(oldestFile)) {
    await fs.promises.unlink(oldestFile);
  }

  // Shift remaining rotated files
  for (let i = this.maxRotatedFiles - 1; i >= 1; i--) {
    const currentFile = `${logFile}.${i}`;
    const nextFile = `${logFile}.${i + 1}`;
    if (fs.existsSync(currentFile)) {
      await fs.promises.rename(currentFile, nextFile);
    }
  }

  // Rename current to .1
  await fs.promises.rename(logFile, `${logFile}.1`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/logService.test.ts::'rotateLog renames'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/logService.ts tests/logService.test.ts && git commit -m "feat: add log rotation to LogService"
```

---

## Chunk 3: Process Manager

### Task 5: ProcessManager - Start and track processes

**Files:**
- Create: `src/processManager.ts`
- Create: `tests/processManager.test.ts`

- [ ] **Step 1: Write failing test for startProcess**

```typescript
// tests/processManager.test.ts
import { ProcessManager } from '../src/processManager';
import fs from 'fs';
import path from 'path';

describe('ProcessManager', () => {
  const testLogsDir = path.join(__dirname, 'test-logs');

  beforeEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
    fs.mkdirSync(testLogsDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup any running processes
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
  });

  test('startProcess spawns a process and returns started status', async () => {
    const processManager = new ProcessManager(testLogsDir);

    const result = await processManager.startProcess({
      id: 'test',
      command: 'echo hello',
    });

    expect(result).toEqual({ id: 'test', status: 'started' });
    expect(processManager.getProcess('test')).toBeDefined();
  });

  test('startProcess throws error for duplicate id', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({ id: 'test', command: 'echo hello' });

    await expect(
      processManager.startProcess({ id: 'test', command: 'echo world' })
    ).rejects.toThrow("Process 'test' is already running");
  });

  test('startProcess throws error for empty command', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await expect(
      processManager.startProcess({ id: 'test', command: '' })
    ).rejects.toThrow('Command is required');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/processManager.test.ts`
Expected: FAIL - ProcessManager not found

- [ ] **Step 3: Write minimal ProcessManager implementation**

```typescript
// src/processManager.ts
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { LogService } from './logService.js';
import { config } from './config.js';
import type { StartProcessInput, ProcessInfo } from './types.js';

export class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();
  private logService: LogService;

  constructor(logsDir: string = config.logsDir) {
    this.logService = new LogService(logsDir, config.maxFileSize, config.maxRotatedFiles);
  }

  async startProcess(input: StartProcessInput): Promise<{ id: string; status: 'started' }> {
    if (!input.command || input.command.trim() === '') {
      throw new Error('Command is required');
    }

    if (this.processes.has(input.id)) {
      throw new Error(`Process '${input.id}' is already running`);
    }

    const logFile = path.join(config.logsDir, `${input.id}.log`);

    const childProcess = spawn(input.command, [], {
      shell: true,
      cwd: input.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Stream stdout and stderr to log file
    childProcess.stdout?.on('data', (data) => {
      this.logService.appendLog(logFile, data.toString());
    });

    childProcess.stderr?.on('data', (data) => {
      this.logService.appendLog(logFile, data.toString());
    });

    this.processes.set(input.id, {
      id: input.id,
      process: childProcess,
      logFile,
      status: 'running',
    });

    return { id: input.id, status: 'started' };
  }

  getProcess(id: string): ProcessInfo | undefined {
    return this.processes.get(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/processManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/processManager.ts tests/processManager.test.ts && git commit -m "feat: add ProcessManager with startProcess"
```

---

### Task 6: ProcessManager - Stop process with graceful shutdown

**Files:**
- Modify: `tests/processManager.test.ts`
- Modify: `src/processManager.ts`

- [ ] **Step 1: Write failing test for stopProcess**

```typescript
test('stopProcess kills the process and returns stopped status', async () => {
  const processManager = new ProcessManager(testLogsDir);

  // Start a long-running process
  await processManager.startProcess({
    id: 'sleep',
    command: 'sleep 60',
  });

  const result = await processManager.stopProcess({ id: 'sleep' });

  expect(result).toEqual({ id: 'sleep', status: 'stopped' });
  expect(processManager.getProcess('sleep')).toBeUndefined();
});

test('stopProcess throws error for non-existent process', async () => {
  const processManager = new ProcessManager(testLogsDir);

  await expect(
    processManager.stopProcess({ id: 'nonexistent' })
  ).rejects.toThrow("Process 'nonexistent' not found");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/processManager.test.ts::'stopProcess kills'`
Expected: FAIL - stopProcess not implemented

- [ ] **Step 3: Implement stopProcess with SIGTERM/SIGKILL timeout**

```typescript
// Add to src/processManager.ts

async stopProcess(input: { id: string }): Promise<{ id: string; status: 'stopped' }> {
  const processInfo = this.processes.get(input.id);

  if (!processInfo) {
    throw new Error(`Process '${input.id}' not found`);
  }

  return new Promise((resolve) => {
    const proc = processInfo.process;

    proc.once('exit', () => {
      this.processes.delete(input.id);
      resolve({ id: input.id, status: 'stopped' });
    });

    proc.kill('SIGTERM');

    // Force kill after timeout
    setTimeout(() => {
      if (this.processes.has(input.id)) {
        proc.kill('SIGKILL');
      }
    }, config.killTimeout);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/processManager.test.ts::'stopProcess kills'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/processManager.ts tests/processManager.test.ts && git commit -m "feat: add stopProcess with SIGTERM/SIGKILL"
```

---

### Task 6b: ProcessManager - Auto-cleanup naturally exited processes

**Files:**
- Modify: `src/processManager.ts`

**Issue:** Processes that exit on their own (e.g., `echo hello`) remain in the Map indefinitely - memory leak.

- [ ] **Step 1: Write failing test for auto-cleanup**

```typescript
test('processes that exit naturally are removed from tracking', async () => {
  const processManager = new ProcessManager(testLogsDir);

  // Start a short-lived process that exits quickly
  await processManager.startProcess({
    id: 'quick',
    command: 'echo done',
  });

  // Wait for natural exit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Process should be auto-cleaned
  expect(processManager.getProcess('quick')).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/processManager.test.ts::'processes that exit naturally'`
Expected: FAIL - process not auto-cleaned

- [ ] **Step 3: Implement auto-cleanup on process exit**

```typescript
// In startProcess, add exit listener:
childProcess.on('exit', () => {
  this.processes.delete(input.id);
});

// Remove from stopProcess Promise resolve since exit handler handles it
async stopProcess(input: { id: string }): Promise<{ id: string; status: 'stopped' }> {
  const processInfo = this.processes.get(input.id);

  if (!processInfo) {
    throw new Error(`Process '${input.id}' not found`);
  }

  return new Promise((resolve, reject) => {
    const proc = processInfo.process;

    // Handler will fire for both natural exit and killed exit
    const handler = (code: number | null) => {
      this.processes.delete(input.id);
      resolve({ id: input.id, status: 'stopped' });
    };

    proc.once('exit', handler);

    proc.kill('SIGTERM');

    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Process may have already exited
      }
    }, config.killTimeout);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/processManager.test.ts::'processes that exit naturally'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/processManager.ts tests/processManager.test.ts && git commit -m "fix: auto-cleanup processes that exit naturally"
```

---

### Task 7: ProcessManager - Get logs and search logs

**Files:**
- Modify: `tests/processManager.test.ts`
- Modify: `src/processManager.ts`

- [ ] **Step 1: Write failing test for getLogs and searchLogs**

```typescript
test('getLogs returns logs from process log file', async () => {
  const processManager = new ProcessManager(testLogsDir);

  await processManager.startProcess({
    id: 'echo-test',
    command: 'echo "Hello World"',
  });

  // Wait for process to complete
  await new Promise(resolve => setTimeout(resolve, 500));

  const result = await processManager.getLogs({ id: 'echo-test' });

  expect(result.id).toBe('echo-test');
  expect(result.logs).toContain('Hello World');
});

test('searchLogs returns matching lines', async () => {
  const processManager = new ProcessManager(testLogsDir);

  await processManager.startProcess({
    id: 'echo-test',
    command: 'echo "Hello World" && echo "Error occurred" && echo "World"',
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  const result = await processManager.searchLogs({
    id: 'echo-test',
    keyword: 'Error',
  });

  expect(result.matches.some(m => m.includes('Error'))).toBe(true);
});

test('getLogs throws error for non-existent process', async () => {
  const processManager = new ProcessManager(testLogsDir);

  await expect(
    processManager.getLogs({ id: 'nonexistent' })
  ).rejects.toThrow("Process 'nonexistent' not found");
});

test('getLogs throws error when log file does not exist', async () => {
  const processManager = new ProcessManager(testLogsDir);

  // Manually create a process entry without actual log file
  // This simulates a process that exited and was cleaned up but logs exist
  await processManager.startProcess({
    id: 'quick',
    command: 'echo quick',
  });

  // Wait for process to exit naturally
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Should throw "No logs found"
  await expect(
    processManager.getLogs({ id: 'quick' })
  ).rejects.toThrow("No logs found for process 'quick'");
});

test('searchLogs throws error for non-existent process', async () => {
  const processManager = new ProcessManager(testLogsDir);

  await expect(
    processManager.searchLogs({ id: 'nonexistent', keyword: 'test' })
  ).rejects.toThrow("Process 'nonexistent' not found");
});

test('searchLogs throws error when log file does not exist', async () => {
  const processManager = new ProcessManager(testLogsDir);

  await processManager.startProcess({
    id: 'quick',
    command: 'echo quick',
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  await expect(
    processManager.searchLogs({ id: 'quick', keyword: 'test' })
  ).rejects.toThrow("No logs found for process 'quick'");
});

test('searchLogs throws error for invalid regex', async () => {
  const processManager = new ProcessManager(testLogsDir);

  await processManager.startProcess({
    id: 'echo-test',
    command: 'echo "Hello World"',
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  await expect(
    processManager.searchLogs({ id: 'echo-test', keyword: '[unclosed', regex: true })
  ).rejects.toThrow('Invalid regex');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/processManager.test.ts::'getLogs returns'`
Expected: FAIL - methods not implemented

- [ ] **Step 3: Implement getLogs and searchLogs**

```typescript
// Add to src/processManager.ts

async getLogs(input: { id: string; lines?: number }): Promise<{ id: string; logs: string }> {
  const processInfo = this.processes.get(input.id);

  if (!processInfo) {
    throw new Error(`Process '${input.id}' not found`);
  }

  if (!fs.existsSync(processInfo.logFile)) {
    throw new Error(`No logs found for process '${input.id}'`);
  }

  const logs = await this.logService.readLog(processInfo.logFile, input.lines);
  return { id: input.id, logs };
}

async searchLogs(input: { id: string; keyword: string; regex?: boolean }): Promise<{ id: string; matches: string[] }> {
  const processInfo = this.processes.get(input.id);

  if (!processInfo) {
    throw new Error(`Process '${input.id}' not found`);
  }

  if (!fs.existsSync(processInfo.logFile)) {
    throw new Error(`No logs found for process '${input.id}'`);
  }

  const matches = await this.logService.searchLog(
    processInfo.logFile,
    input.keyword,
    input.regex
  );

  return { id: input.id, matches };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/processManager.test.ts::'getLogs returns'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/processManager.ts tests/processManager.test.ts && git commit -m "feat: add getLogs and searchLogs to ProcessManager"
```

---

## Chunk 4: MCP Server Integration

### Task 8: MCP Server - Wire up all tools

**Files:**
- Create: `src/index.ts`
- Note: MCP integration tests require stdio transport and are verified manually

- [ ] **Step 1: Write MCP server implementation**

(Note: MCP server testing requires stdio transport integration testing, verified manually after build)

- [ ] **Step 2: Write MCP server implementation**

```typescript
// src/index.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from './processManager.js';
import { config } from './config.js';

const server = new Server(
  {
    name: 'mcp-terminal',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const processManager = new ProcessManager(config.logsDir);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'start_process',
        description: 'Start a long-running process and capture its output to a log file',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique process identifier' },
            command: { type: 'string', description: 'Command to execute' },
            cwd: { type: 'string', description: 'Working directory (optional)' },
          },
          required: ['id', 'command'],
        },
      },
      {
        name: 'stop_process',
        description: 'Stop a running process',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Process identifier to stop' },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_logs',
        description: 'Get logs from a process',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Process identifier' },
            lines: { type: 'number', description: 'Number of lines to return (optional)' },
          },
          required: ['id'],
        },
      },
      {
        name: 'search_logs',
        description: 'Search logs for a keyword or regex',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Process identifier' },
            keyword: { type: 'string', description: 'Keyword or regex to search for' },
            regex: { type: 'boolean', description: 'Use regex search (optional)' },
          },
          required: ['id', 'keyword'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'start_process': {
        const result = await processManager.startProcess(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'stop_process': {
        const result = await processManager.stopProcess(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'get_logs': {
        const result = await processManager.getLogs(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'search_logs': {
        const result = await processManager.searchLogs(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Terminal server started');
}

main().catch(console.error);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src/index.ts && git commit -m "feat: add MCP server with all tools"
```

---

### Task 9: Graceful shutdown on SIGINT/SIGTERM

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update index.ts with graceful shutdown**

```typescript
// Add to main() in src/index.ts

// Graceful shutdown - kill all processes when server exits
async function gracefulShutdown() {
  console.error('Shutting down MCP Terminal server...');

  const processes = Array.from(processManager['processes'].keys());
  for (const id of processes) {
    try {
      await processManager.stopProcess({ id });
      console.error(`Stopped process: ${id}`);
    } catch (error) {
      console.error(`Failed to stop process ${id}:`, error);
    }
  }

  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

await server.connect(transport);
console.error('MCP Terminal server started');
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src/index.ts && git commit -m "feat: add graceful shutdown to kill all processes"
```

---

## Chunk 5: Finalization

### Task 10: Add .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

```
node_modules/
dist/
logs/
*.log
*.log.*
test-logs/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore && git commit -m "chore: add gitignore"
```

---

## Verification

After completing all tasks, verify the MCP server works:

1. **Build**: `npm run build`
2. **Test**: `npm test`
3. **Manual test**:
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run dev
   ```

Expected: Returns list of 4 tools

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Initialize Node.js project with TypeScript |
| 2 | Create types and config |
| 3 | LogService - append logs |
| 4 | LogService - log rotation |
| 5 | ProcessManager - start process |
| 6 | ProcessManager - stop process |
| 6b | ProcessManager - auto-cleanup naturally exited processes |
| 7 | ProcessManager - getLogs/searchLogs with error cases |
| 8 | MCP Server - wire up all tools |
| 9 | Graceful shutdown |
| 10 | Add .gitignore |
