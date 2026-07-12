import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AppConfig {
  logsDir: string;
  maxFileSize: number;
  maxRotatedFiles: number;
  killTimeout: number;
  allowedCommands: string[];
  logRetentionDays: number;
  autoRestart: boolean;
  maxRestarts: number;
  restartDelayMs: number;
  healthCheckIntervalMs: number;
}

const DEFAULT_CONFIG: AppConfig = {
  logsDir: path.resolve(__dirname, '..', 'logs'),
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxRotatedFiles: 5,
  killTimeout: 5000, // 5s before SIGKILL
  allowedCommands: [
    'node', 'npm', 'npx', 'pnpm', 'yarn', 'bun',
    'python', 'python3', 'pip',
    'git', 'docker', 'docker-compose',
    'bash', 'sh', 'zsh',
    'curl', 'wget',
    'ls', 'cat', 'echo', 'grep', 'find', 'ps', 'top',
  ],
  logRetentionDays: 7,
  autoRestart: true,
  maxRestarts: 5,
  restartDelayMs: 2000,
  healthCheckIntervalMs: 30000,
};

export const ALLOWED_COMMANDS: Set<string> = new Set(DEFAULT_CONFIG.allowedCommands);

function loadConfigFile(): Partial<AppConfig> {
  const configPath = path.resolve(__dirname, '..', 'mcp-terminal.config.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const partial: Partial<AppConfig> = {};
      if (Array.isArray(parsed.allowedCommands)) partial.allowedCommands = parsed.allowedCommands;
      if (typeof parsed.logRetentionDays === 'number') partial.logRetentionDays = parsed.logRetentionDays;
      if (typeof parsed.maxLogSize === 'number') partial.maxFileSize = parsed.maxLogSize;
      if (typeof parsed.autoRestart === 'boolean') partial.autoRestart = parsed.autoRestart;
      if (typeof parsed.maxRestarts === 'number') partial.maxRestarts = parsed.maxRestarts;
      if (typeof parsed.restartDelayMs === 'number') partial.restartDelayMs = parsed.restartDelayMs;
      if (typeof parsed.healthCheckIntervalMs === 'number') partial.healthCheckIntervalMs = parsed.healthCheckIntervalMs;
      if (typeof parsed.killTimeoutMs === 'number') partial.killTimeout = parsed.killTimeoutMs;
      return partial;
    } catch {
      console.error('Warning: Failed to parse mcp-terminal.config.json, using defaults');
    }
  }
  return {};
}

const configOverrides = loadConfigFile();
export const config: AppConfig = { ...DEFAULT_CONFIG, ...configOverrides };

// Re-initialize ALLOWED_COMMANDS with merged values
ALLOWED_COMMANDS.clear();
for (const cmd of config.allowedCommands) {
  ALLOWED_COMMANDS.add(cmd);
}
