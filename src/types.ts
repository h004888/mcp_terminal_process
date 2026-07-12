import { ChildProcess } from 'node:child_process';

export interface StartProcessInput {
  id: string;
  command: string;
  cwd?: string;
}

export interface StartProcessOptions {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  group?: string;
  autoRestart?: boolean;
  maxRestarts?: number;
  env?: Record<string, string>;
}

export interface StartProcessOutput {
  id: string;
  status: "started";
}

export interface StopProcessInput {
  id: string;
}

export interface StopProcessOutput {
  id: string;
  status: "stopped";
}

export interface GetLogsInput {
  id: string;
  lines?: number;
}

export interface GetLogsOutput {
  id: string;
  logs: string;
}

export interface SearchLogsInput {
  id: string;
  keyword: string;
  regex?: boolean;
}

export interface SearchLogsOutput {
  id: string;
  matches: string[];
}

export interface ListProcessesOutput {
  processes: {
    id: string;
    status: "running";
    command: string;
    logFile: string;
    group?: string;
  }[];
}

export interface ProcessStatus {
  id: string;
  status: "running" | "stopped" | "crashed";
  cpu?: string;
  memory?: string;
  uptime?: string;
  restarts: number;
  group?: string;
  command: string;
  logFile: string;
  startedAt: string;
}

export interface ProcessInfo {
  id: string;
  process: ChildProcess;
  logFile: string;
  status: "running" | "stopped" | "crashed";
  group?: string;
  autoRestart: boolean;
  maxRestarts: number;
  restartCount: number;
  startedAt: Date;
  originalInput: StartProcessOptions;
}

export interface BatchCommand {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  group?: string;
}
