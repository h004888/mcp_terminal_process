import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { LogService } from './logService.js';
import { config } from './config.js';
import type { StartProcessInput, ProcessInfo } from './types.js';

export class ProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();
  private logFiles: Map<string, string> = new Map();
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

    const logFile = path.join(this.logService.logsDir, `${input.id}.log`);

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

    // Store log file path for retrieval after process exits
    this.logFiles.set(input.id, logFile);

    // Auto-cleanup when process exits naturally
    childProcess.on('exit', () => {
      this.processes.delete(input.id);
    });

    return { id: input.id, status: 'started' };
  }

  getProcess(id: string): ProcessInfo | undefined {
    return this.processes.get(id);
  }

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
}