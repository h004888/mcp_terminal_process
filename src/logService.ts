import fs from 'fs';
import path from 'path';

export class LogService {
  constructor(
    public logsDir: string,
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

    // Check if rotation needed (before appending)
    if (fs.existsSync(logFile)) {
      const stats = await fs.promises.stat(logFile);
      if (stats.size + Buffer.byteLength(content, 'utf-8') > this.maxFileSize) {
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