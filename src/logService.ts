import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export class LogService {
  private writeQueues: Map<string, Promise<void>> = new Map();

  constructor(
    public logsDir: string,
    private maxFileSize: number,
    private maxRotatedFiles: number
  ) {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Start retention cleanup scheduler (every 1 hour)
    const timer = setInterval(() => {
      this.cleanupOldLogs(config.logRetentionDays).catch(() => {});
    }, 3600000);
    timer.unref(); // Don't keep process alive for cleanup
  }

  /**
   * Append content to log file with queue-based single-writer pattern.
   * Each log file has its own promise chain to prevent race conditions.
   */
  async appendLog(logFile: string, content: string): Promise<void> {
    // Build a promise chain per file to serialize writes
    const prev = this.writeQueues.get(logFile) || Promise.resolve();

    // Use a non-async handler to avoid unhandled rejections
    const next = prev.then(
      () => this.doAppend(logFile, content),
      () => this.doAppend(logFile, content) // Also run if prev rejected (recover)
    );

    this.writeQueues.set(logFile, next);
    return next;
  }

  private async doAppend(logFile: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check rotation before appending
    if (fs.existsSync(logFile)) {
      const stats = await fs.promises.stat(logFile);
      if (stats.size + Buffer.byteLength(content, 'utf-8') > this.maxFileSize) {
        await this.rotateLog(logFile);
      }
    }

    // Use appendFile (creates file if not exists, appends if exists)
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

  /**
   * Read log file, optionally returning only the last N lines.
   * Uses streaming to avoid loading entire file into memory.
   */
  async readLog(logFile: string, lines?: number): Promise<string> {
    if (!fs.existsSync(logFile)) {
      throw new Error(`Log file not found: ${logFile}`);
    }

    if (lines !== undefined) {
      return this.tailFile(logFile, lines);
    }

    // Full read (user explicitly requested no line limit)
    const content = await fs.promises.readFile(logFile, 'utf-8');
    return content;
  }

  /**
   * Read last N lines from a file using binary seek from end.
   * Memory usage: O(chunkSize) = 4KB per chunk, regardless of file size.
   */
  private async tailFile(filePath: string, lines: number): Promise<string> {
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const stat = await fd.stat();
      if (stat.size === 0) return '';

      const chunkSize = 4096;
      let position = stat.size;
      const result: string[] = [];
      let leftover = '';

      while (position > 0 && result.length < lines) {
        const readSize = Math.min(chunkSize, position);
        position -= readSize;
        const buffer = Buffer.alloc(readSize);
        await fd.read(buffer, 0, readSize, position);
        const chunk = buffer.toString('utf-8', 0, readSize);
        const combined = chunk + leftover;
        const parts = combined.split('\n');
        leftover = parts[0] || '';
        // Add complete lines, filtering trailing empty from final \n
        const completeLines = parts.slice(1).filter(Boolean);
        result.unshift(...completeLines);
        if (result.length > lines) {
          result.splice(0, result.length - lines);
        }
      }

      // If we have leftover (first/incomplete line from the first read),
      // add it as a complete line since we can't read further back
      if (leftover.length > 0 && result.length < lines) {
        result.unshift(leftover);
      }

      return result.join('\n');
    } finally {
      await fd.close();
    }
  }

  /**
   * Search log file for keyword or regex pattern.
   * Uses streaming read to handle large files without OOM.
   */
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
      leftover = lines.pop() || '';

      for (const line of lines) {
        if (isRegex ? regex!.test(line) : line.includes(keyword)) {
          matches.push(line);
        }
      }
    }

    // Handle last line (may be incomplete)
    if (leftover.length > 0) {
      if (isRegex ? regex!.test(leftover) : leftover.includes(keyword)) {
        matches.push(leftover);
      }
    }

    return matches;
  }

  /**
   * Delete log files older than the specified number of days.
   * Returns the count of deleted files.
   */
  async cleanupOldLogs(retentionDays: number): Promise<number> {
    if (!fs.existsSync(this.logsDir)) return 0;

    const now = Date.now();
    const maxAge = retentionDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    const entries = await fs.promises.readdir(this.logsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Scan session log files inside process directories
        const processDir = path.join(this.logsDir, entry.name);
        const files = await fs.promises.readdir(processDir);
        for (const file of files) {
          const filePath = path.join(processDir, file);
          try {
            const stat = await fs.promises.stat(filePath);
            if (now - stat.mtimeMs > maxAge) {
              await fs.promises.unlink(filePath);
              deletedCount++;
            }
          } catch {
            // Skip files that can't be accessed
          }
        }

        // Remove empty directories
        try {
          const remaining = await fs.promises.readdir(processDir);
          if (remaining.length === 0) {
            await fs.promises.rmdir(processDir);
          }
        } catch {
          // Ignore errors on directory cleanup
        }
      } else if (entry.isFile() && entry.name.endsWith('.log')) {
        // Top-level log files (legacy format)
        const filePath = path.join(this.logsDir, entry.name);
        try {
          const stat = await fs.promises.stat(filePath);
          if (now - stat.mtimeMs > maxAge) {
            await fs.promises.unlink(filePath);
            deletedCount++;
          }
        } catch {
          // Skip files that can't be accessed
        }
      }
    }

    if (deletedCount > 0) {
      console.error(`Log cleanup: deleted ${deletedCount} file(s) older than ${retentionDays} days`);
    }

    return deletedCount;
  }
}
