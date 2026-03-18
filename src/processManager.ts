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
}