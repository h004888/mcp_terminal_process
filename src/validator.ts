import fs from 'fs';
import path from 'path';
import { ALLOWED_COMMANDS } from './config.js';
import type { StartProcessOptions } from './types.js';

export class Validator {
  /**
   * Parse a command string into command + args array.
   * Rejects shell metacharacters (&&, |, ;, $(), backticks, etc.)
   */
  parseCommand(input: string): { command: string; args: string[] } {
    // Reject shell metacharacters
    const shellMetaChars = /[;&|`$(){}<>!]/;
    if (shellMetaChars.test(input)) {
      throw new Error(
        `Command contains shell metacharacters. Use 'start_process' with 'args' array, or use 'run_script' tool if shell pipeline is required.`
      );
    }

    const parts = input.trim().split(/\s+/);
    if (parts.length === 0 || parts[0] === '') {
      throw new Error('Command is required');
    }

    return {
      command: parts[0],
      args: parts.slice(1),
    };
  }

  /**
   * Validate that command is in the allowlist.
   */
  validateCommand(cmd: string, args: string[]): void {
    if (!ALLOWED_COMMANDS.has(cmd)) {
      throw new Error(
        `Command '${cmd}' is not in the allowed list. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`
      );
    }

    for (let i = 0; i < args.length; i++) {
      if (args[i].length > 256) {
        throw new Error(`Argument ${i + 1} exceeds maximum length of 256 characters`);
      }
      if (args[i].includes('..') && (args[i].includes('/') || args[i].includes('\\'))) {
        throw new Error(`Argument ${i + 1} contains path traversal (..)`);
      }
    }

    if (args.length > 50) {
      throw new Error(`Too many arguments (max 50, got ${args.length})`);
    }
  }

  /**
   * Parse and validate a StartProcessOptions input.
   * Returns sanitized options with args array guaranteed.
   */
  validateInput(input: Record<string, unknown>): StartProcessOptions {
    if (!input.id || typeof input.id !== 'string') {
      throw new Error('id is required and must be a string');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(input.id)) {
      throw new Error('id must contain only letters, numbers, underscores, and hyphens');
    }
    if (input.id.length > 64) {
      throw new Error('id must not exceed 64 characters');
    }

    if (!input.command || typeof input.command !== 'string') {
      throw new Error('command is required');
    }

    let command: string;
    let args: string[];

    if (Array.isArray(input.args)) {
      // Args provided explicitly (new API)
      command = input.command;
      args = (input.args as string[]).filter(a => typeof a === 'string');
    } else {
      // Parse from command string (backward compat)
      const parsed = this.parseCommand(input.command);
      command = parsed.command;
      args = parsed.args;
    }

    this.validateCommand(command, args);

    const options: StartProcessOptions = {
      id: input.id as string,
      command,
      args,
    };

    if (typeof input.cwd === 'string' && input.cwd.length > 0) {
      if (input.cwd.includes('..')) {
        throw new Error('cwd must not contain path traversal (..)');
      }
      if (input.cwd.length > 512) {
        throw new Error('cwd must not exceed 512 characters');
      }
      if (!fs.existsSync(path.resolve(input.cwd))) {
        throw new Error(`cwd directory does not exist: ${input.cwd}`);
      }
      options.cwd = input.cwd;
    }

    if (typeof input.group === 'string') {
      if (!/^[a-zA-Z0-9_-]+$/.test(input.group)) {
        throw new Error('group must contain only letters, numbers, underscores, and hyphens');
      }
      options.group = input.group;
    }

    if (typeof input.autoRestart === 'boolean') {
      options.autoRestart = input.autoRestart;
    }

    if (typeof input.maxRestarts === 'number') {
      options.maxRestarts = input.maxRestarts;
    }

    if (typeof input.env === 'object' && input.env !== null && !Array.isArray(input.env)) {
      options.env = input.env as Record<string, string>;
    }

    return options;
  }

  /**
   * Lightweight validation for shell-mode (run_script tool).
   * Only validates id and cwd, not command content.
   */
  validateShellInput(input: Record<string, unknown>): { id: string; command: string; cwd?: string } {
    if (!input.id || typeof input.id !== 'string') {
      throw new Error('id is required and must be a string');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(input.id)) {
      throw new Error('id must contain only letters, numbers, underscores, and hyphens');
    }
    if (input.id.length > 64) {
      throw new Error('id must not exceed 64 characters');
    }

    if (!input.command || typeof input.command !== 'string') {
      throw new Error('command is required');
    }

    const result: { id: string; command: string; cwd?: string } = {
      id: input.id as string,
      command: input.command as string,
    };

    if (typeof input.cwd === 'string' && input.cwd.length > 0) {
      if (input.cwd.includes('..')) {
        throw new Error('cwd must not contain path traversal (..)');
      }
      result.cwd = input.cwd;
    }

    return result;
  }
}
