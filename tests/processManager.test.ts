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

  test('getLogs returns logs after process exits', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'quick',
      command: 'echo quick',
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const result = await processManager.getLogs({ id: 'quick' });
    expect(result.id).toBe('quick');
    expect(result.logs).toContain('quick');
  });

  test('searchLogs throws error for non-existent process', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await expect(
      processManager.searchLogs({ id: 'nonexistent', keyword: 'test' })
    ).rejects.toThrow("Process 'nonexistent' not found");
  });

  test('searchLogs returns matches after process exits', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'quick',
      command: 'echo quick && echo test',
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const result = await processManager.searchLogs({ id: 'quick', keyword: 'test' });
    expect(result.id).toBe('quick');
    expect(result.matches.some(m => m.includes('test'))).toBe(true);
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
});
