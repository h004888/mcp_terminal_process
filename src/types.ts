export interface StartProcessInput {
  id: string;
  command: string;
  cwd?: string;
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

import { ChildProcess } from "node:child_process";

export interface ListProcessesOutput {
  processes: {
    id: string;
    status: "running";
    command: string;
    logFile: string;
  }[];
}

export interface ProcessInfo {
  id: string;
  process: ChildProcess;
  logFile: string;
  status: "running" | "stopped";
}
