import { ProcessManager } from '../src/processManager';
import type { ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function waitForProcess(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    proc.once('exit', () => resolve());
  });
}

describe('ProcessManager', () => {
  const testLogsDir = path.join(__dirname, 'test-logs', 'processmanager');

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

  test('startProcess spawns a process and returns started status', async () => {
    const processManager = new ProcessManager(testLogsDir);

    const result = await processManager.startProcess({
      id: 'test',
      command: 'echo',
      args: ['hello'],
    });

    expect(result).toEqual({ id: 'test', status: 'started' });
    expect(processManager.getProcess('test')).toBeDefined();
  });

  test('startProcess throws error for duplicate id', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({ id: 'test', command: 'echo', args: ['hello'] });

    await expect(
      processManager.startProcess({ id: 'test', command: 'echo', args: ['world'] })
    ).rejects.toThrow("Process 'test' is already running");
  });

  test('stopProcess kills the process and returns stopped status', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'sleep',
      command: process.platform === 'win32' ? 'timeout' : 'sleep',
      args: process.platform === 'win32' ? ['/T', '10', '/NOBREAK'] : ['10'],
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

    await processManager.startProcess({
      id: 'quick',
      command: 'echo',
      args: ['done'],
    });

    const processInfo = processManager.getProcess('quick');
    expect(processInfo).toBeDefined();

    await waitForProcess(processInfo!.process);

    // Small delay for exit handler to fire
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(processManager.getProcess('quick')).toBeUndefined();
  });

  test('getLogs returns logs from process log file', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'echo-test',
      command: 'echo',
      args: ['Hello World'],
    });

    const processInfo = processManager.getProcess('echo-test');
    await waitForProcess(processInfo!.process);

    const result = await processManager.getLogs({ id: 'echo-test' });

    expect(result.id).toBe('echo-test');
    expect(result.logs).toContain('Hello World');
  });

  test('searchLogs returns matching lines', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'echo-test',
      command: 'echo',
      args: ['Hello World'],
    });

    const processInfo = processManager.getProcess('echo-test');
    await waitForProcess(processInfo!.process);

    // Also run another command to have both messages in log
    await processManager.startProcess({
      id: 'echo-test-2',
      command: 'echo',
      args: ['Error occurred'],
    });
    const info2 = processManager.getProcess('echo-test-2');
    await waitForProcess(info2!.process);

    const result = await processManager.searchLogs({
      id: 'echo-test',
      keyword: 'Hello',
    });

    expect(result.matches.some(m => m.includes('Hello'))).toBe(true);
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
      command: 'echo',
      args: ['quick'],
    });

    const processInfo = processManager.getProcess('quick');
    await waitForProcess(processInfo!.process);

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
      command: 'echo',
      args: ['quick'],
    });

    const processInfo = processManager.getProcess('quick');
    await waitForProcess(processInfo!.process);

    // Start another to put different content in log
    await processManager.startProcess({
      id: 'quick-2',
      command: 'echo',
      args: ['test marker'],
    });
    const info2 = processManager.getProcess('quick-2');
    await waitForProcess(info2!.process);

    const result = await processManager.searchLogs({ id: 'quick-2', keyword: 'test' });
    expect(result.id).toBe('quick-2');
    expect(result.matches.some(m => m.includes('test'))).toBe(true);
  });

  test('searchLogs throws error for invalid regex', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'echo-test',
      command: 'echo',
      args: ['Hello World'],
    });

    const processInfo = processManager.getProcess('echo-test');
    await waitForProcess(processInfo!.process);

    await expect(
      processManager.searchLogs({ id: 'echo-test', keyword: '[unclosed', regex: true })
    ).rejects.toThrow();
  });

  test('listProcesses returns all running processes', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'proc1',
      command: 'echo',
      args: ['test1'],
    });

    await processManager.startProcess({
      id: 'proc2',
      command: 'echo',
      args: ['test2'],
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

  test('startProcess with group tracks processes correctly', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'proc1',
      command: 'echo',
      args: ['hello'],
      group: 'backend',
    });

    const info = processManager.getProcess('proc1');
    expect(info?.group).toBe('backend');

    const result = await processManager.listProcesses({ group: 'backend' });
    expect(result.processes).toHaveLength(1);
    expect(result.processes[0].group).toBe('backend');

    // Other group should return empty
    const otherGroup = await processManager.listProcesses({ group: 'frontend' });
    expect(otherGroup.processes).toHaveLength(0);
  });

  test('getAllProcessIds returns all process IDs', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({ id: 'a', command: 'echo', args: ['1'] });
    await processManager.startProcess({ id: 'b', command: 'echo', args: ['2'] });

    const ids = processManager.getAllProcessIds();
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  // ── Phase 2: get_process_status ──

  test('getProcessStatus returns status for running process', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'status-test',
      command: process.platform === 'win32' ? 'timeout' : 'sleep',
      args: process.platform === 'win32' ? ['/T', '5', '/NOBREAK'] : ['5'],
    });

    const status = await processManager.getProcessStatus('status-test');

    expect(status.id).toBe('status-test');
    expect(status.status).toBe('running');
    expect(status.command).toContain('timeout');

    // Cleanup
    await processManager.stopProcess({ id: 'status-test' });
  });

  test('getProcessStatus returns stopped for non-existent process', async () => {
    const processManager = new ProcessManager(testLogsDir);

    const status = await processManager.getProcessStatus('nonexistent');

    expect(status.id).toBe('nonexistent');
    expect(status.status).toBe('stopped');
  });

  test('getProcessStatus includes uptime for running process', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'uptime-test',
      command: process.platform === 'win32' ? 'timeout' : 'sleep',
      args: process.platform === 'win32' ? ['/T', '5', '/NOBREAK'] : ['5'],
    });

    const status = await processManager.getProcessStatus('uptime-test');

    expect(status.uptime).toBeDefined();
    // Should show at least "0s" or "0m"
    expect(status.uptime!.length).toBeGreaterThan(0);

    await processManager.stopProcess({ id: 'uptime-test' });
  });

  // ── Phase 2: restart_process ──

  test('restartProcess stops and starts process with same ID', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'restart-me',
      command: 'echo',
      args: ['first run'],
    });

    const result = await processManager.restartProcess('restart-me');

    expect(result.id).toBe('restart-me');
    expect(result.status).toBe('started');

    // Process should be running again
    const info = processManager.getProcess('restart-me');
    expect(info).toBeDefined();
    expect(info!.status).toBe('running');
  });

  test('restartProcess throws error for non-existent process', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await expect(
      processManager.restartProcess('nonexistent')
    ).rejects.toThrow("Process 'nonexistent' not found");
  });

  // ── Phase 2: stop_process_group ──

  test('stopProcessGroup stops all processes in a group', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await processManager.startProcess({
      id: 'svc-a',
      command: process.platform === 'win32' ? 'timeout' : 'sleep',
      args: process.platform === 'win32' ? ['/T', '10', '/NOBREAK'] : ['10'],
      group: 'backend',
    });

    await processManager.startProcess({
      id: 'svc-b',
      command: process.platform === 'win32' ? 'timeout' : 'sleep',
      args: process.platform === 'win32' ? ['/T', '10', '/NOBREAK'] : ['10'],
      group: 'backend',
    });

    const result = await processManager.stopProcessGroup('backend');

    expect(result.group).toBe('backend');
    expect(result.stopped).toBe(2);
    expect(processManager.getProcess('svc-a')).toBeUndefined();
    expect(processManager.getProcess('svc-b')).toBeUndefined();
  });

  test('stopProcessGroup throws error for empty group', async () => {
    const processManager = new ProcessManager(testLogsDir);

    await expect(
      processManager.stopProcessGroup('nonexistent-group')
    ).rejects.toThrow("Group 'nonexistent-group' not found or empty");
  });

  // ── Phase 2: batch_start ──

  test('batchStart starts multiple processes concurrently', async () => {
    const processManager = new ProcessManager(testLogsDir);

    const result = await processManager.batchStart([
      { id: 'batch-a', command: 'echo', args: ['a'] },
      { id: 'batch-b', command: 'echo', args: ['b'] },
    ]);

    expect(result.started).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(processManager.getProcess('batch-a')).toBeDefined();
    expect(processManager.getProcess('batch-b')).toBeDefined();
  });

  test('batchStart returns partial errors on failure', async () => {
    const processManager = new ProcessManager(testLogsDir);

    // First, occupy one ID
    await processManager.startProcess({ id: 'occupied', command: 'echo', args: ['busy'] });

    const result = await processManager.batchStart([
      { id: 'new-a', command: 'echo', args: ['a'] },
      { id: 'occupied', command: 'echo', args: ['conflict'] }, // This will fail
    ]);

    expect(result.started).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe('occupied');
    expect(result.errors[0].error).toContain('already running');
  });

  // ── Phase 2: formatUptime ──

  test('formatUptime formats milliseconds correctly', () => {
    // Access private method via prototype
    const pm = new ProcessManager(testLogsDir);
    const formatUptime = (pm as any).formatUptime.bind(pm);

    expect(formatUptime(5000)).toBe('5s');
    expect(formatUptime(65000)).toBe('1m 5s');
    expect(formatUptime(3600000)).toBe('1h 0m');
    expect(formatUptime(3661000)).toBe('1h 1m');
    expect(formatUptime(0)).toBe('0s');
  });

  // ── Phase 2: Health Checker ──

  test('startHealthChecker and stopHealthChecker manage timer', () => {
    const processManager = new ProcessManager(testLogsDir);

    // Should not throw
    processManager.startHealthChecker();
    processManager.startHealthChecker(); // Idempotent
    processManager.stopHealthChecker();
    processManager.stopHealthChecker(); // Idempotent
  });
});
