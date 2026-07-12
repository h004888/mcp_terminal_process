import { LogService } from '../src/logService';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('LogService', () => {
  const testLogsDir = path.join(__dirname, 'test-logs', 'logservice');

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

  test('rotateLog renames existing file and creates new one', async () => {
    const logService = new LogService(testLogsDir, 100, 3); // 100 bytes max
    const logFile = path.join(testLogsDir, 'test.log');

    // Create initial file
    await logService.appendLog(logFile, 'A'.repeat(50) + '\n');
    expect(fs.existsSync(logFile)).toBe(true);
    expect(fs.existsSync(logFile + '.1')).toBe(false);

    // Append to trigger rotation
    await logService.appendLog(logFile, 'B'.repeat(50) + '\n');

    // Should have rotated: .1 has old content, main file has new content
    expect(fs.existsSync(logFile + '.1')).toBe(true);
    expect(fs.readFileSync(logFile + '.1', 'utf-8')).toBe('A'.repeat(50) + '\n');
    expect(fs.readFileSync(logFile, 'utf-8')).toBe('B'.repeat(50) + '\n');
  });

  test('concurrent appends to same file are serialized (no race)', async () => {
    const logService = new LogService(testLogsDir, 10 * 1024 * 1024, 5);
    const logFile = path.join(testLogsDir, 'concurrent.log');

    const promises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(logService.appendLog(logFile, `Line ${i}\n`));
    }

    await Promise.all(promises);

    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(content).toContain(`Line ${i}`);
    }
  });

  test('readLog with lines param returns only last N lines', async () => {
    const logService = new LogService(testLogsDir, 10 * 1024 * 1024, 5);
    const logFile = path.join(testLogsDir, 'lines.log');

    for (let i = 1; i <= 10; i++) {
      await logService.appendLog(logFile, `Line ${i}\n`);
    }

    const result = await logService.readLog(logFile, 3);
    const lines = result.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Line 8');
    expect(lines[1]).toBe('Line 9');
    expect(lines[2]).toBe('Line 10');
  });

  test('readLog without lines param returns full content', async () => {
    const logService = new LogService(testLogsDir, 10 * 1024 * 1024, 5);
    const logFile = path.join(testLogsDir, 'full.log');

    await logService.appendLog(logFile, 'Line 1\n');
    await logService.appendLog(logFile, 'Line 2\n');

    const result = await logService.readLog(logFile);
    expect(result).toBe('Line 1\nLine 2\n');
  });

  test('searchLog returns matching lines', async () => {
    const logService = new LogService(testLogsDir, 10 * 1024 * 1024, 5);
    const logFile = path.join(testLogsDir, 'search.log');

    await logService.appendLog(logFile, 'INFO: Starting\n');
    await logService.appendLog(logFile, 'ERROR: Failed\n');
    await logService.appendLog(logFile, 'INFO: Done\n');

    const matches = await logService.searchLog(logFile, 'ERROR');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe('ERROR: Failed');
  });

  test('searchLog with regex returns matching lines', async () => {
    const logService = new LogService(testLogsDir, 10 * 1024 * 1024, 5);
    const logFile = path.join(testLogsDir, 'regex.log');

    await logService.appendLog(logFile, 'Error 503: timeout\n');
    await logService.appendLog(logFile, 'Info: ok\n');
    await logService.appendLog(logFile, 'Error 404: not found\n');

    const matches = await logService.searchLog(logFile, 'Error\\s+\\d+', true);
    expect(matches).toHaveLength(2);
  });

  test('cleanupOldLogs removes files older than retention period', async () => {
    const logService = new LogService(testLogsDir, 10 * 1024 * 1024, 5);
    const logFile = path.join(testLogsDir, 'old.log');

    await logService.appendLog(logFile, 'old data\n');

    // Set mtime to 8 days ago
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await fs.promises.utimes(logFile, oldDate, oldDate);

    const deleted = await logService.cleanupOldLogs(7);
    expect(deleted).toBe(1);
    expect(fs.existsSync(logFile)).toBe(false);
  });

  test('cleanupOldLogs keeps files within retention period', async () => {
    const logService = new LogService(testLogsDir, 10 * 1024 * 1024, 5);
    const logFile = path.join(testLogsDir, 'recent.log');

    // Use direct write to avoid queue issues
    await fs.promises.writeFile(logFile, 'recent data\n', 'utf-8');

    const deleted = await logService.cleanupOldLogs(7);
    expect(deleted).toBe(0);
    expect(fs.existsSync(logFile)).toBe(true);
  });
});
