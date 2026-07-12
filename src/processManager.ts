import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { LogService } from './logService.js';
import { config } from './config.js';
import type { StartProcessOptions, ProcessInfo, ProcessStatus } from './types.js';

const IS_WINDOWS = process.platform === 'win32';

export class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();
  private logFiles: Map<string, string> = new Map();
  private groups: Map<string, Set<string>> = new Map();
  private logService: LogService;

  constructor(logsDir: string = config.logsDir) {
    this.logService = new LogService(logsDir, config.maxFileSize, config.maxRotatedFiles);
  }

  async startProcess(input: StartProcessOptions): Promise<{ id: string; status: 'started' }> {
    if (this.processes.has(input.id)) {
      throw new Error(`Process '${input.id}' is already running`);
    }

    const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    const logDir = path.join(this.logService.logsDir, input.id);
    const logFile = path.join(logDir, `${sessionId}.log`);

    const childProcess = spawn(
      input.command,
      input.args || [],
      {
        shell: false,
        cwd: input.cwd || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: input.env ? { ...process.env, ...input.env } : undefined,
      }
    );

    // Stream stdout and stderr to log file
    childProcess.stdout?.on('data', (data) => {
      this.logService.appendLog(logFile, data.toString());
    });

    childProcess.stderr?.on('data', (data) => {
      this.logService.appendLog(logFile, data.toString());
    });

    const processInfo: ProcessInfo = {
      id: input.id,
      process: childProcess,
      logFile,
      status: 'running' as const,
      group: input.group,
      autoRestart: input.autoRestart ?? config.autoRestart,
      maxRestarts: input.maxRestarts ?? config.maxRestarts,
      restartCount: 0,
      startedAt: new Date(),
      originalInput: input,
    };

    this.processes.set(input.id, processInfo);

    // Track group membership
    if (input.group) {
      if (!this.groups.has(input.group)) {
        this.groups.set(input.group, new Set());
      }
      this.groups.get(input.group)!.add(input.id);
    }

    // Store log file path for retrieval after process exits
    this.logFiles.set(input.id, logFile);

    // Auto-cleanup and auto-restart when process exits naturally
    childProcess.on('exit', (code) => {
      const info = this.processes.get(input.id);
      // Only auto-restart if configured AND exit was a crash (non-zero code)
      if (info && info.autoRestart && info.restartCount < info.maxRestarts && code !== 0) {
        const delay = config.restartDelayMs;
        info.restartCount++;
        this.logService.appendLog(logFile, `[mcp-terminal] Process exited with code ${code}, auto-restarting (${info.restartCount}/${info.maxRestarts}) in ${delay}ms\n`);
        setTimeout(() => {
          this.startProcess(info.originalInput).catch(err => {
            this.logService.appendLog(logFile, `[mcp-terminal] Auto-restart failed: ${err.message}\n`);
          });
        }, delay);
      } else {
        this.processes.delete(input.id);
        this.removeFromGroups(input.id);
      }
    });

    return { id: input.id, status: 'started' };
  }

  /**
   * Start a process using shell (for run_script tool).
   * Less secure — only use when shell pipeline is required.
   */
  async startProcessShell(input: { id: string; command: string; cwd?: string }): Promise<{ id: string; status: 'started' }> {
    if (this.processes.has(input.id)) {
      throw new Error(`Process '${input.id}' is already running`);
    }

    const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    const logDir = path.join(this.logService.logsDir, input.id);
    const logFile = path.join(logDir, `${sessionId}.log`);

    const childProcess = spawn(input.command, [], {
      shell: true,
      cwd: input.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await this.logService.appendLog(logFile, `[mcp-terminal] Shell mode: ${input.command}\n`);

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
      status: 'running' as const,
      autoRestart: false,
      maxRestarts: 0,
      restartCount: 0,
      startedAt: new Date(),
      originalInput: { id: input.id, command: input.command, cwd: input.cwd },
    });

    this.logFiles.set(input.id, logFile);

    childProcess.on('exit', () => {
      this.processes.delete(input.id);
      this.removeFromGroups(input.id);
    });

    return { id: input.id, status: 'started' };
  }

  private removeFromGroups(id: string): void {
    for (const [, members] of this.groups) {
      members.delete(id);
    }
  }

  getProcess(id: string): ProcessInfo | undefined {
    return this.processes.get(id);
  }

  getAllProcessIds(): string[] {
    return Array.from(this.processes.keys());
  }

  async stopProcess(input: { id: string }): Promise<{ id: string; status: 'stopped' }> {
    const processInfo = this.processes.get(input.id);

    if (!processInfo) {
      throw new Error(`Process '${input.id}' not found`);
    }

    await this.killProcess(processInfo.process);

    this.processes.delete(input.id);
    this.logFiles.delete(input.id);
    this.removeFromGroups(input.id);

    return { id: input.id, status: 'stopped' };
  }

  private async killProcess(proc: ChildProcess): Promise<void> {
    if (proc.exitCode !== null) {
      return; // Process already exited
    }

    if (IS_WINDOWS && proc.pid) {
      // Windows: use taskkill to kill process tree (/T /F flags)
      return new Promise<void>((resolve) => {
        const taskkill = spawn('taskkill', ['/PID', proc.pid!.toString(), '/F', '/T']);
        taskkill.on('close', () => resolve()); // Resolve regardless of exit code
        taskkill.on('error', () => resolve()); // Resolve regardless of error
      });
    } else {
      // Unix: SIGTERM → wait → SIGKILL
      return new Promise<void>((resolve) => {
        proc.once('exit', () => resolve());
        proc.kill('SIGTERM');

        setTimeout(() => {
          if (proc.exitCode === null) {
            proc.kill('SIGKILL');
          }
          resolve();
        }, config.killTimeout);
      });
    }
  }

  async getLogs(input: { id: string; lines?: number }): Promise<{ id: string; logs: string }> {
    const logFile = this.logFiles.get(input.id);

    if (!logFile) {
      throw new Error(`Process '${input.id}' not found`);
    }

    if (!fs.existsSync(logFile)) {
      throw new Error(`No logs found for process '${input.id}'`);
    }

    const logs = await this.logService.readLog(logFile, input.lines);
    return { id: input.id, logs };
  }

  async searchLogs(input: { id: string; keyword: string; regex?: boolean }): Promise<{ id: string; matches: string[] }> {
    const logFile = this.logFiles.get(input.id);

    if (!logFile) {
      throw new Error(`Process '${input.id}' not found`);
    }

    if (!fs.existsSync(logFile)) {
      throw new Error(`No logs found for process '${input.id}'`);
    }

    const matches = await this.logService.searchLog(
      logFile,
      input.keyword,
      input.regex
    );

    return { id: input.id, matches };
  }

  async listProcesses(filter?: { group?: string }): Promise<{ processes: { id: string; status: "running"; command: string; logFile: string; group?: string }[] }> {
    const processes: { id: string; status: "running"; command: string; logFile: string; group?: string }[] = [];

    for (const [id, processInfo] of this.processes) {
      // Apply group filter if specified
      if (filter?.group && processInfo.group !== filter.group) {
        continue;
      }

      const command = processInfo.originalInput.command;

      processes.push({
        id,
        status: 'running',
        command,
        logFile: processInfo.logFile,
        group: processInfo.group,
      });
    }

    return { processes };
  }

  async getProcessStatus(id: string): Promise<ProcessStatus> {
    const info = this.processes.get(id);
    if (!info) {
      // Check if we have log files for a stopped process
      const logFile = this.logFiles.get(id);
      return {
        id,
        status: 'stopped',
        restarts: 0,
        command: '',
        logFile: logFile || '',
        startedAt: new Date(0).toISOString(),
      };
    }

    const now = Date.now();
    const uptimeMs = now - info.startedAt.getTime();
    const uptimeStr = this.formatUptime(uptimeMs);

    // Read CPU and memory from OS
    let cpu = '';
    let memory = '';
    if (info.process.pid) {
      try {
        const stats = await this.readProcessStats(info.process.pid);
        cpu = stats.cpu;
        memory = stats.memory;
      } catch {
        // Stats reading failed — process may have just exited
      }
    }

    return {
      id,
      status: info.status,
      cpu,
      memory,
      uptime: uptimeStr,
      restarts: info.restartCount,
      group: info.group,
      command: info.originalInput.command + (info.originalInput.args?.length ? ' ' + info.originalInput.args.join(' ') : ''),
      logFile: info.logFile,
      startedAt: info.startedAt.toISOString(),
    };
  }

  private async readProcessStats(pid: number): Promise<{ cpu: string; memory: string }> {
    if (IS_WINDOWS) {
      // Windows: use tasklist /FO CSV
      const output = await this.execCapture('tasklist', ['/FO', 'CSV', '/NH', '/PID', pid.toString()]);
      // Parse: "image.exe","pid","session","session#","memKB"
      const parts = output.split('","');
      if (parts.length >= 5) {
        const memKB = parts[4]?.replace(/[^0-9]/g, '') || '0';
        // tasklist doesn't give CPU%, approximate: 0
        return { cpu: '0.0', memory: `${Math.round(parseInt(memKB) / 1024)}MB` };
      }
    } else {
      // Unix: ps -o %cpu=,%mem= -p PID
      try {
        const output = await this.execCapture('ps', ['-o', '%cpu=,%mem=', '-p', pid.toString()]);
        const parts = output.trim().split(/\s+/);
        if (parts.length >= 2) {
          return {
            cpu: parseFloat(parts[0]).toFixed(1),
            memory: parseFloat(parts[1]).toFixed(1) + '%',
          };
        }
      } catch {
        // ps failed — process may not exist
      }
    }
    return { cpu: 'N/A', memory: 'N/A' };
  }

  private execCapture(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `Exit code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  async restartProcess(id: string): Promise<{ id: string; status: 'started' }> {
    const info = this.processes.get(id);
    if (!info) {
      throw new Error(`Process '${id}' not found`);
    }

    // Save original input before stopping
    const originalInput = info.originalInput;

    // Stop the running process
    await this.killProcess(info.process);
    this.processes.delete(id);
    this.logFiles.delete(id);
    this.removeFromGroups(id);

    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));

    // Start with same parameters
    return this.startProcess(originalInput);
  }

  async stopProcessGroup(group: string): Promise<{ group: string; stopped: number }> {
    const members = this.groups.get(group);
    if (!members || members.size === 0) {
      throw new Error(`Group '${group}' not found or empty`);
    }

    const ids = Array.from(members);
    let stopped = 0;
    const errors: string[] = [];

    await Promise.all(ids.map(async (id) => {
      try {
        await this.stopProcess({ id });
        stopped++;
      } catch (err) {
        errors.push(`${id}: ${(err as Error).message}`);
      }
    }));

    if (errors.length > 0 && stopped === 0) {
      throw new Error(`Failed to stop group '${group}': ${errors.join('; ')}`);
    }

    return { group, stopped };
  }

  async batchStart(commands: StartProcessOptions[]): Promise<{ started: number; errors: { id: string; error: string }[] }> {
    const errors: { id: string; error: string }[] = [];
    let started = 0;

    await Promise.all(commands.map(async (cmd) => {
      try {
        await this.startProcess(cmd);
        started++;
      } catch (err) {
        errors.push({ id: cmd.id, error: (err as Error).message });
      }
    }));

    return { started, errors };
  }

  // ── Health Checker ──

  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  startHealthChecker(): void {
    if (this.healthCheckTimer) return; // Already running

    this.healthCheckTimer = setInterval(() => {
      this.runHealthCheck();
    }, config.healthCheckIntervalMs);
    this.healthCheckTimer.unref();
  }

  stopHealthChecker(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async runHealthCheck(): Promise<void> {
    for (const [id, info] of this.processes) {
      if (info.process.exitCode !== null) {
        // Process has exited but wasn't cleaned up by auto-restart (exit code 0)
        if (info.status === 'running') {
          info.status = 'crashed';
          this.logService.appendLog(info.logFile, `[mcp-terminal] Health check: process '${id}' exited with code ${info.process.exitCode}\n`);
        }
      }
    }
  }
}
