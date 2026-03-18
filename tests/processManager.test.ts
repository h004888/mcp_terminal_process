import { ProcessManager } from '../src/processManager';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
});
