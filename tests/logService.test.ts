import { LogService } from '../src/logService';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  test('rotateLog renames existing file and creates new one', async () => {
    const logService = new LogService(testLogsDir, 100, 3); // 100 bytes max
    const logFile = path.join(testLogsDir, 'test.log');

    // Create initial file
    await logService.appendLog(logFile, 'A'.repeat(50) + '\n');
    expect(fs.existsSync(logFile)).toBe(true);
    expect(fs.existsSync(logFile + '.1')).toBe(false);

    // Append to trigger rotation (before appending, check if 51+51 > 100, so rotate)
    await logService.appendLog(logFile, 'B'.repeat(50) + '\n');

    // Should have rotated: .1 has old content, main file has new content
    expect(fs.existsSync(logFile + '.1')).toBe(true);
    expect(fs.readFileSync(logFile + '.1', 'utf-8')).toBe('A'.repeat(50) + '\n'); // Old content
    expect(fs.readFileSync(logFile, 'utf-8')).toBe('B'.repeat(50) + '\n'); // New content
  });
});
