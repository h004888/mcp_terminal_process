# MCP Terminal Phase 1 — Kế hoạch triển khai Security & Stability

**Mục tiêu:** Loại bỏ hoàn toàn lỗ hổng command injection, sửa race condition log rotation, thêm platform-aware process kill, và thiết lập nền tảng cho multi-process management (process groups, session-based logs, auto-restart).

**Cách tiếp cận:** Incremental — từng bước deploy được, không phá vỡ API surface hiện tại. Mỗi bước là một task riêng có thể kiểm chứng độc lập.

**Đã tra cứu codebase (codebase-memory-mcp):**
- `get_architecture`: dự án TypeScript, 7 file nguồn, kiến trúc 3 lớp: `src/index.ts` (entry point + MCP handlers) → `processManager` (process lifecycle) → `logService` (log I/O). 126 nodes, 174 edges.
- `index_repository`: đã index project `C-Users-ADMIN-Downloads-mcp_terminal` ở mode fast.
- `trace_path(startProcess, inbound)`: `startProcess` được gọi từ `src/index.ts` (CallToolRequestSchema handler).
- `trace_path(appendLog, inbound)`: `appendLog` được gọi từ `startProcess` (stdout/stderr data events) và gián tiếp từ `src/index.ts`.
- `trace_path(stopProcess, inbound)`: `stopProcess` được gọi từ `src/index.ts` và `gracefulShutdown`.
- `search_graph`: xác nhận các interface `StartProcessInput`, `ProcessInfo`, `StopProcessOutput`, `GetLogsOutput` tại `src/types.ts` lines 1-58.
- File thực tế đã đọc: `src/index.ts` (153 dòng), `src/processManager.ts` (143 dòng), `src/logService.ts` (87 dòng), `src/types.ts` (59 dòng), `src/config.ts` (13 dòng), `tests/logService.test.ts` (63 dòng), `tests/processManager.test.ts` (219 dòng).

## Global Constraints

1. **Backward compatibility:** Tất cả API tool MCP hiện tại (`start_process`, `stop_process`, `get_logs`, `search_logs`, `list_processes`) phải giữ nguyên tên và schema output. Chỉ mở rộng input schema (thêm optional fields).
2. **No shell injection:** Không dùng `shell: true` trong bất kỳ đường code mới nào. `execFile` với argument array là chuẩn duy nhất.
3. **Windows + Unix parity:** Mọi tính năng process management phải hoạt động trên cả 3 nền tảng (Windows, Linux, macOS).
4. **Incremental deploy:** Mỗi task kết thúc bằng `npm run build` thành công và test pass. Không merge code không build được.
5. **Không thay đổi kiến trúc tổng thể:** Process Manager vẫn là class in-memory, không tách service riêng.
6. **Config mới:** Thêm file `mcp-terminal.config.json` ở project root cho allowlist và các policy config.

---

### Task 1: Thêm cấu trúc session-based log và config file

**Đối tượng liên quan (đã xác nhận qua codebase-memory-mcp):**
- Chỉnh sửa: `src/config.ts` (đã đọc: 13 dòng, export `config` object với logsDir, maxFileSize, maxRotatedFiles, killTimeout)
- Chỉnh sửa: `src/types.ts` (đã đọc: 59 dòng, chứa interface `StartProcessInput`, `ProcessInfo`, `GetLogsOutput`, `SearchLogsOutput`, `ListProcessesOutput`)

**Ảnh hưởng liên quan (từ trace_path):**
- `config` được import bởi: `src/processManager.ts` (dòng 5), `src/index.ts` (dòng 8)
- `types` được import bởi: `src/processManager.ts` (dòng 6), không nơi nào khác (ngoài node_modules)

**Giao diện/Kết nối với các task khác:**
- Nhận đầu vào từ: brainstorming decisions (allowlist command list, log retention = 7 ngày)
- Cung cấp đầu ra cho: Task 2, Task 3, Task 4, Task 5, Task 6

- [ ] **Bước 1: Tạo `mcp-terminal.config.json`** ở project root
  Nội dung mẫu:
  ```json
  {
    "allowedCommands": [
      "node", "npm", "npx", "pnpm", "yarn", "bun",
      "python", "python3", "pip",
      "git", "docker", "docker-compose",
      "bash", "sh", "zsh",
      "curl", "wget",
      "ls", "cat", "echo", "grep", "find", "ps", "top"
    ],
    "logRetentionDays": 7,
    "maxLogSize": 52428800,
    "autoRestart": true,
    "maxRestarts": 5,
    "restartDelayMs": 2000,
    "healthCheckIntervalMs": 30000,
    "killTimeoutMs": 5000
  }
  ```

- [ ] **Bước 2: Sửa `src/config.ts`** — thêm config loader + session-based log config
  - Thêm `Config` interface với tất cả field từ config file
  - Thêm `loadConfig()` function: đọc `mcp-terminal.config.json` nếu tồn tại, fallback về defaults
  - Thêm `sessionLogDir` vào config: `path.resolve(logsDir, sessionId)` với sessionId = ISO timestamp
  - Thêm `ALLOWED_COMMANDS` constant dạng `Set<string>`

- [ ] **Bước 3: Sửa `src/types.ts`** — thêm interface mới
  - Thêm `ProcessGroup` interface: `{ id: string; processes: string[] }`
  - Thêm `StartProcessOptions` interface (mở rộng `StartProcessInput`): thêm `group?`, `autoRestart?`, `maxRestarts?`, `env?`
  - Thêm `ProcessStatus` interface: `{ id, status, cpu?, memory?, uptime?, restarts?, group?, command, logFile, startedAt }`
  - Thêm `BatchCommand` interface: `{ id, command, args, cwd?, group? }`
  - Sửa `ProcessInfo`: thêm `group`, `autoRestart`, `maxRestarts`, `restartCount`, `startedAt`, `pid`

- [ ] **Bước 4: Xác nhận hoàn tất**
  Cách kiểm tra: `npx tsx src/config.ts` import không lỗi. `npx tsc --noEmit` pass.
  Kết quả mong đợi: TypeScript compile không lỗi.

---

### Task 2: Input Validation Layer — ExecFile + Allowlist (QUAN TRỌNG NHẤT)

**Đối tượng liên quan (đã xác nhận qua codebase-memory-mcp):**
- Tạo mới: `src/validator.ts`
- Chỉnh sửa: `src/processManager.ts` (đã đọc: 143 dòng)
- Chỉnh sửa: `src/index.ts` (đã đọc: 153 dòng)

**Ảnh hưởng liên quan (từ trace_path):**
- `startProcess` (processManager.ts dòng 17) được gọi từ `src/index.ts` dòng 95
- `stopProcess` (processManager.ts dòng 65) được gọi từ `src/index.ts` dòng 99 và `gracefulShutdown` dòng 135
- `processManager['processes']` được access private từ `src/index.ts` dòng 132

**Giao diện/Kết nối với các task khác:**
- Nhận đầu vào từ: Task 1 (config với allowlist + session log path)
- Cung cấp đầu ra cho: Task 3 (platform kill sau khi đã validate input)

- [ ] **Bước 1: Tạo `src/validator.ts`** — Input validation + command sanitizer
  ```typescript
  // Chức năng chính:
  // 1. parseCommand(input: string): { command: string; args: string[] }
  //    - Tách string thành command + args array (dùng split theo space, tôn trọng quotes)
  //    - Nếu input chứa shell meta chars (&&, |, ;, $(), `` ` ``, >, <) → throw error
  //    - Gợi ý: "Dùng tool run_script nếu cần shell pipeline"
  //
  // 2. validateCommand(cmd: string, args: string[], allowlist: Set<string>): void
  //    - Kiểm tra cmd có trong allowlist không
  //    - Kiểm tra từng arg: maxLength 256, không chứa path traversal (../)
  //    - Kiểm tra args tổng: max 50 items
  //
  // 3. validateInput(input: StartProcessOptions): StartProcessOptions
  //    - Validate id: chỉ a-zA-Z0-9_- , max 64 ký tự
  //    - Validate cwd: nếu có, kiểm tra path tồn tại + không chứa ..
  //    - Validate group: như id pattern
  //    - Validate autoRestart: boolean
  //    - Gọi parseCommand + validateCommand bên trong
  ```

- [ ] **Bước 2: Sửa `src/processManager.ts`** — Thay spawn string bằng execFile
  - Sửa import: thêm `import { spawn } from 'child_process'` → đổi thành `import { spawn, execFile } from 'child_process'`
  - Sửa method `startProcess`:
    - Nhận `args` từ input (array), không parse từ string
    - Gọi `execFile(command, args, { shell: false, cwd, stdio: ['ignore', 'pipe', 'pipe'] })` thay vì `spawn(commandString, [], { shell: true })`
    - Giữ nguyên phần còn lại (pipe stdout/stderr → LogService)
  - Thêm method `startProcessShell` (dùng spawn + shell:true, chỉ cho run_script tool):
    - BỔ SUNG validation: validate id, cwd
    - Log warning: "Using shell mode — reduced security"
    - Không nằm trong allowlist validation

- [ ] **Bước 3: Sửa `src/index.ts`** — Thêm validation layer vào MCP handler
  - Import `Validator` từ `./validator.js`
  - Tạo instance `validator` ở đầu file (cùng cấp với `processManager`)
  - Sửa `callToolRequestHandler`:
    - Trước case `start_process`: gọi `validator.validateInput(args)` → throw error nếu invalid
    - Nếu args có `args` array → dùng `execFile` path (startProcess)
    - Nếu args có `command` string (backward compat) → parse thành args array
  - Sửa private access `processManager['processes']`:
    - Thêm method `getAllProcessIds(): string[]` vào ProcessManager
    - Gọi `processManager.getAllProcessIds()` trong gracefulShutdown thay vì `processManager['processes'].keys()`

- [ ] **Bước 4: Thêm tool `run_script` vào MCP handler**
  - Thêm vào `ListToolsRequestSchema` handler:
    ```typescript
    {
      name: 'run_script',
      description: 'Execute a shell pipeline script (e.g., "npm run build && echo done"). Less secure than start_process — only for commands requiring shell features.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', description: 'Unique process identifier' },
          command: { type: 'string', description: 'Shell script to execute (full string, including pipes, &&, etc.)' },
          cwd: { type: 'string', description: 'Working directory (optional)' }
        },
        required: ['id', 'command']
      }
    }
    ```
  - Thêm case `run_script` trong `callToolRequestHandler`: gọi `processManager.startProcessShell(args)`
  - **LƯU Ý:** tool này vẫn dùng `shell: true` — nhưng được expose riêng, user phải chủ động chọn. Ghi rõ trong description: "Less secure than start_process — only for commands requiring shell features."

- [ ] **Bước 5: Xác nhận hoàn tất**
  Cách kiểm tra: `npx tsc --noEmit` pass. `npx tsx src/index.ts` server start không lỗi.
  Kết quả mong đợi: TypeScript compile sạch. Server listen trên stdio.

---

### Task 3: Platform-Aware Process Kill

**Đối tượng liên quan (đã xác nhận qua codebase-memory-mcp):**
- Chỉnh sửa: `src/processManager.ts` — method `stopProcess` tại dòng 65-89

**Ảnh hưởng liên quan (từ trace_path):**
- `stopProcess` được gọi từ `src/index.ts` (CallToolRequestHandler) và `gracefulShutdown`
- `gracefulShutdown` tại `src/index.ts` dòng 129-143

**Giao diện/Kết nối với các task khác:**
- Nhận đầu vào từ: Task 2 (ProcessManager đã refactor)
- Cung cấp đầu ra cho: không task nào downstream phụ thuộc (task độc lập)

- [ ] **Bước 1: Thêm platform detection utility**
  - Ở đầu `processManager.ts` hoặc function riêng:
    ```typescript
    const IS_WINDOWS = process.platform === 'win32';
    ```

- [ ] **Bước 2: Viết `killProcess(proc: ChildProcess, pid: number): Promise<void>`**
  ```typescript
  async function killProcess(proc: ChildProcess, pid: number, timeout: number): Promise<void> {
    if (IS_WINDOWS) {
      // Windows: taskkill để kill process tree (/T flag)
      return new Promise((resolve, reject) => {
        const taskkill = spawn('taskkill', ['/PID', pid.toString(), '/F', '/T']);
        taskkill.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`taskkill failed with code ${code}`));
        });
        taskkill.on('error', reject);
      });
    } else {
      // Unix: SIGTERM → wait → SIGKILL
      proc.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, timeout));
      if (proc.exitCode === null) { // vẫn còn sống
        proc.kill('SIGKILL');
      }
    }
  }
  ```
  **LƯU Ý:** Do `ChildProcess` trên Windows không có `pid` hữu ích (shell process PID), cần dùng `process.pid` hoặc `spawn` options `{ windowsHide: true }`.

- [ ] **Bước 3: Sửa `stopProcess` method**
  - Trong `ProcessManager.stopProcess`:
    ```typescript
    async stopProcess(input: { id: string }): Promise<{ id: string; status: 'stopped' }> {
      const processInfo = this.processes.get(input.id);
      if (!processInfo) throw new Error(`Process '${input.id}' not found`);

      await killProcess(processInfo.process, processInfo.process.pid, config.killTimeout);
      this.processes.delete(input.id);
      this.logFiles.delete(input.id); // Xóa cả log reference
      return { id: input.id, status: 'stopped' };
    }
    ```
  - (Thay vì dùng Promise resolve trong 'once exit' handler như hiện tại)

- [ ] **Bước 4: Xác nhận hoàn tất**
  Cách kiểm tra: `npx tsc --noEmit`. Unit test `stopProcess` pass.
  Kết quả mong đợi: Compile OK. Test stop process trên Windows dùng taskkill.

---

### Task 4: Atomic Log Write + Session-Based Log Files

**Đối tượng liên quan (đã xác nhận qua codebase-memory-mcp):**
- Chỉnh sửa: `src/logService.ts` (đã đọc: 87 dòng, toàn bộ class LogService)
- Chỉnh sửa: `src/processManager.ts` (log file path generation tại dòng 26, 31-41, 51)
- Chỉnh sửa: `tests/logService.test.ts` (đã đọc: 63 dòng)

**Ảnh hưởng liên quan (từ trace_path):**
- `appendLog` được gọi từ stdout/stderr data events trong `startProcess` (2 calls)
- `rotateLog` là private, chỉ được gọi từ `appendLog` (dòng 25)
- `readLog` được gọi từ `getLogs` (processManager.ts dòng 102)
- `searchLog` được gọi từ `searchLogs` (processManager.ts dòng 117-121)

**Giao diện/Kết nối với các task khác:**
- Nhận đầu vào từ: Task 1 (sessionLogDir config)
- Cung cấp đầu ra cho: Task 5 (streaming reads kế thừa file path structure mới)

- [ ] **Bước 1: Sửa `LogService` — implement atomic append pattern**
  - Thêm `writeQueue: Map<string, Promise<void>>` — đảm bảo mỗi file chỉ có 1 write đang chạy
  - Sửa `appendLog`:
    ```typescript
    async appendLog(logFile: string, content: string): Promise<void> {
      // Queue-based write để tránh race condition
      const dir = path.dirname(logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write to temp file, then rename (atomic on same filesystem)
      const tempFile = logFile + '.tmp';
      await fs.promises.appendFile(tempFile, content, 'utf-8');
      await fs.promises.rename(tempFile, logFile);
      // Lưu ý: dùng appendFile + rename pattern
      // Thay vì check-then-act (stat → rotate → append)
    }
    ```
  - **CẢI TIẾN:** Thay vì rename (không append được), dùng:
    ```typescript
    // Single-writer queue per file
    if (!this.writeQueue.has(logFile)) {
      this.writeQueue.set(logFile, Promise.resolve());
    }
    this.writeQueue.set(logFile, this.writeQueue.get(logFile)!.then(async () => {
      // Kiểm tra rotation + append trong 1 promise chain
      if (fs.existsSync(logFile)) {
        const stats = await fs.promises.stat(logFile);
        if (stats.size + Buffer.byteLength(content, 'utf-8') > this.maxFileSize) {
          await this.rotateLog(logFile);
        }
      }
      await fs.promises.appendFile(logFile, content, 'utf-8');
    }));
    return this.writeQueue.get(logFile);
    ```

- [ ] **Bước 2: Thêm retention cleanup**
  - Thêm method `async cleanupOldLogs(retentionDays: number): Promise<number>`:
    - Duyệt tất cả `{sessionId}.log` trong `logsDir/`
    - Nếu file older than `retentionDays` → delete
    - Trả về số file đã xóa
  - Thêm scheduler (setInterval) trong constructor:
    ```typescript
    // Chạy cleanup mỗi 1 giờ
    setInterval(() => this.cleanupOldLogs(config.logRetentionDays), 3600000);
    ```

- [ ] **Bước 3: Sửa `src/processManager.ts` — session-based log path**
  - Trong `startProcess`:
    ```typescript
    // Tạo session ID (timestamp đến giây)
    const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    const logDir = path.join(this.logService.logsDir, input.id);
    const logFile = path.join(logDir, `${sessionId}.log`);
    ```
  - Lưu logFile (session-specific) thay vì `{id}.log`
  - Khi getLogs/searchLogs: tìm tất cả file trong `logsDir/{id}/` và trả về từ file mới nhất

- [ ] **Bước 4: Sửa tests cho log rotation**
  - Trong `tests/logService.test.ts`:
    - Thêm test: "appendLog with queue prevents race between concurrent writes"
    - Thêm test: "cleanupOldLogs removes files older than retention"
    - Sửa test hiện tại: dùng `await` cho append log thay vì setTimeout

- [ ] **Bước 5: Xác nhận hoàn tất**
  Cách kiểm tra: `npx jest tests/logService.test.ts` pass tất cả tests.
  Kết quả mong đợi: 6+ tests pass. Không có race condition warning.

---

### Task 5: Streaming Log Reads + Tail Implementation

**Đối tượng liên quan (đã xác nhận qua codebase-memory-mcp):**
- Chỉnh sửa: `src/logService.ts` — method `readLog` tại dòng 52-65

**Ảnh hưởng liên quan (từ trace_path):**
- `readLog` được gọi từ `getLogs` (processManager.ts dòng 102)
- `searchLog` được gọi từ `searchLogs` (processManager.ts dòng 117)

**Giao diện/Kết nối với các task khác:**
- Phụ thuộc vào: Task 4 (atomic log file structure)
- Cung cấp đầu ra cho: không task nào phụ thuộc (cải thiện performance, không thay đổi API)

- [ ] **Bước 1: Viết `tailFile(filePath: string, lines: number): Promise<string>`**
  ```typescript
  /**
   * Đọc N dòng cuối của file mà không load toàn bộ file vào memory.
   * Dùng binary seek từ cuối file lên.
   */
  async function tailFile(filePath: string, lines: number): Promise<string> {
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const stat = await fd.stat();
      const chunkSize = 4096; // Đọc 4KB mỗi lần từ cuối lên
      let position = stat.size;
      const buffer = Buffer.alloc(chunkSize);
      let foundLines: string[] = [];
      let leftover = '';

      while (position > 0 && foundLines.length < lines) {
        const readSize = Math.min(chunkSize, position);
        position -= readSize;
        await fd.read(buffer, 0, readSize, position);
        const chunk = buffer.toString('utf-8', 0, readSize);
        const combined = chunk + leftover;
        const parts = combined.split('\n');
        leftover = parts[0]; // Phần đầu (có thể incomplete)
        foundLines = parts.slice(1).concat(foundLines); // Các dòng hoàn chỉnh
      }

      if (foundLines.length > lines) {
        foundLines = foundLines.slice(foundLines.length - lines);
      }

      return foundLines.join('\n');
    } finally {
      await fd.close();
    }
  }
  ```

- [ ] **Bước 2: Sửa `readLog` method**
  ```typescript
  async readLog(logFile: string, lines?: number): Promise<string> {
    if (!fs.existsSync(logFile)) {
      throw new Error(`Log file not found: ${logFile}`);
    }

    if (lines !== undefined) {
      return tailFile(logFile, lines);
    }

    // Không có lines limit → vẫn dùng readFile (user cần full log)
    const content = await fs.promises.readFile(logFile, 'utf-8');
    return content;
  }
  ```

- [ ] **Bước 3: Sửa `searchLog` method — streaming read + chunk processing**
  ```typescript
  async searchLog(logFile: string, keyword: string, isRegex: boolean = false): Promise<string[]> {
    if (!fs.existsSync(logFile)) {
      throw new Error(`Log file not found: ${logFile}`);
    }

    const matches: string[] = [];
    const regex = isRegex ? new RegExp(keyword) : null;
    const stream = fs.createReadStream(logFile, { encoding: 'utf-8', highWaterMark: 65536 });

    let leftover = '';
    for await (const chunk of stream) {
      const lines = (leftover + chunk).split('\n');
      leftover = lines.pop() || ''; // Dòng cuối có thể incomplete
      for (const line of lines) {
        if (isRegex ? regex!.test(line) : line.includes(keyword)) {
          matches.push(line);
        }
      }
    }
    // Xử lý dòng cuối
    if (leftover && (isRegex ? regex!.test(leftover) : leftover.includes(keyword))) {
      matches.push(leftover);
    }

    return matches;
  }
  ```

- [ ] **Bước 4: Xác nhận hoàn tất**
  Cách kiểm tra: `npx jest tests/logService.test.ts` pass. Test manual với file log 100MB: peak memory < 10MB.
  Kết quả mong đợi: Tất cả test pass. Memory usage của `getLogs { lines: 100 }` không phụ thuộc vào file size.

---

### Task 6: Process Groups + Auto-Restart Foundation

**Đối tượng liên quan (đã xác nhận qua codebase-memory-mcp):**
- Chỉnh sửa: `src/processManager.ts` — thêm group tracking, auto-restart logic
- Chỉnh sửa: `src/index.ts` — thêm handler cho group operations + batch start
- Chỉnh sửa: `src/types.ts` — thêm input/output types cho tools mới

**Ảnh hưởng liên quan (từ trace_path):**
- `startProcess` có inbound call từ `src/index.ts` → cần mở rộng schema input
- `listProcesses` có inbound call từ `src/index.ts` → cần thêm filter theo group

**Giao diện/Kết nối với các task khác:**
- Nhận đầu vào từ: Task 1 (ProcessInfo type đã có group field), Task 2 (execFile validation), Task 4 (session-based logs)
- Cung cấp đầu ra cho: không task Phase 1 — Phase 2 sẽ mở rộng

- [ ] **Bước 1: Thêm group tracking vào `ProcessManager`**
  ```typescript
  private groups: Map<string, Set<string>> = new Map(); // group → Set<processId>

  // Khi startProcess:
  if (input.group) {
    if (!this.groups.has(input.group)) {
      this.groups.set(input.group, new Set());
    }
    this.groups.get(input.group)!.add(input.id);
  }

  // Khi process exit/stop:
  removeFromGroups(id: string): void {
    for (const [, members] of this.groups) {
      members.delete(id);
    }
  }
  ```

- [ ] **Bước 2: Thêm auto-restart logic**
  - Khi process exit handler chạy:
    ```typescript
    childProcess.on('exit', (code) => {
      const info = this.processes.get(input.id);
      if (info && info.autoRestart && info.restartCount < info.maxRestarts) {
        const delay = info.restartDelay || config.restartDelayMs;
        info.restartCount++;
        console.error(`Auto-restarting ${input.id} (${info.restartCount}/${info.maxRestarts}) after ${delay}ms`);
        setTimeout(() => this.startProcess(info.originalInput), delay);
      } else {
        this.processes.delete(input.id);
        this.removeFromGroups(input.id);
      }
    });
    ```
  - **LƯU Ý:** Cần lưu `originalInput` trong `ProcessInfo` để có thể restart với cùng params
  - Thêm vào `ProcessInfo`: `originalInput: StartProcessOptions`

- [ ] **Bước 3: Sửa `src/index.ts` — thêm filter group vào `list_processes`**
  - Sửa `list_processes` tool: thêm optional param `group?: string`
  - Nếu có group → gọi `processManager.listProcesses({ group })` (filter internal)
  - Nếu không → trả về tất cả (behavior hiện tại)

- [ ] **Bước 4: Xác nhận hoàn tất**
  Cách kiểm tra: `npx tsc --noEmit` pass. `npx jest tests/processManager.test.ts` pass.
  Kết quả mong đợi: Tất cả tests pass. Group tracking hoạt động (verify qua log).

---

### Task 7: Rewrite Tests — Await Events Thay setTimeout

**Đối tượng liên quan (đã xác nhận qua codebase-memory-mcp):**
- Chỉnh sửa: `tests/processManager.test.ts` (đã đọc: 219 dòng)
- Có thể chỉnh sửa: `tests/logService.test.ts` (đã đọc: 63 dòng)
- File test logs: `tests/test-logs/proc1.log`, `tests/test-logs/proc2.log` (tồn tại từ test trước)

**Ảnh hưởng liên quan:**
- Không ảnh hưởng production code
- Các test hiện tại dùng `setTimeout(resolve, 1000)` và `setTimeout(resolve, 500)` — flaky

**Giao diện/Kết nối với các task khác:**
- Phụ thuộc: Task 2 (ProcessManager đã refactor với execFile)
- Phụ thuộc: Task 4 (LogService đã refactor với atomic write)

- [ ] **Bước 1: Thêm helper function `waitForProcess(proc: ChildProcess): Promise<void>`**
  ```typescript
  async function waitForProcess(proc: ChildProcess): Promise<void> {
    if (proc.exitCode !== null) return; // Đã exit
    return new Promise((resolve) => {
      proc.once('exit', () => resolve());
    });
  }
  ```

- [ ] **Bước 2: Sửa tất cả test dùng setTimeout trong `processManager.test.ts`**
  - Test "processes that exit naturally are removed from tracking":
    ```typescript
    // OLD: await new Promise(resolve => setTimeout(resolve, 1000));
    // NEW:
    const processInfo = processManager.getProcess('quick')!;
    await waitForProcess(processInfo.process);
    await new Promise(resolve => process.nextTick(resolve)); // Đảm bảo exit handler chạy
    ```
  - Test "getLogs returns logs from process log file":
    ```typescript
    const processInfo = processManager.getProcess('echo-test')!;
    await waitForProcess(processInfo.process);
    // Không cần setTimeout(500) nữa
    ```
  - Test "searchLogs returns matching lines": tương tự
  - Test "getLogs returns logs after process exits": tương tự
  - Test "searchLogs returns matches after process exits": tương tự

- [ ] **Bước 3: Xác nhận hoàn tất**
  Cách kiểm tra: `npx jest tests/processManager.test.ts` chạy 3 lần liên tiếp, không fail lần nào.
  Kết quả mong đợi: 12-14 tests pass sau 3 lần chạy (0 flaky failures).

---

## Tổng quan dependencies giữa các task

```
Task 1: Config + Types
  │
  ├──→ Task 2: Validator + execFile (cần Config/allowlist từ Task 1)
  │       │
  │       ├──→ Task 3: Platform kill (cần ProcessManager đã refactor)
  │       │
  │       └──→ Task 7: Test rewrite (cần execFile + new process API)
  │
  ├──→ Task 4: Atomic log + session (cần config.logRetentionDays từ Task 1)
  │       │
  │       └──→ Task 5: Streaming reads (cần session-based file paths)
  │
  └──→ Task 6: Groups + auto-restart (cần Config.autoRestart + ProcessInfo mới)
```

**Thứ tự khuyến nghị:**
1. Task 1 (nền tảng)
2. Task 2 + Task 4 (song song — độc lập nhau)
3. Task 3 + Task 5 (sau Task 2 và Task 4)
4. Task 6 (sau Task 1 + Task 2)
5. Task 7 (sau Task 2 + Task 4 — test phải reflect code mới)
