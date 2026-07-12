import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from './processManager.js';
import { Validator } from './validator.js';
import { config } from './config.js';
import { startHttpServer } from './httpServer.js';

const server = new Server(
  {
    name: 'mcp-terminal',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const processManager = new ProcessManager(config.logsDir);
const validator = new Validator();

// Start health checker
processManager.startHealthChecker();

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'start_process',
        description: 'Start a long-running process using execFile (secure, no shell). Provide command and args array. For shell pipelines, use run_script instead.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', description: 'Unique process identifier' },
            command: { type: 'string', description: 'Command to execute (e.g., "node")' },
            args: { type: 'array', items: { type: 'string' }, description: 'Command arguments (e.g., ["server.js"])' },
            cwd: { type: 'string', description: 'Working directory (optional)' },
            group: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', description: 'Process group for batch operations (optional)' },
            autoRestart: { type: 'boolean', description: 'Auto-restart on crash (default: true)' },
            maxRestarts: { type: 'number', description: 'Maximum number of restarts (default: 5)' },
            env: { type: 'object', description: 'Environment variables (optional)' },
          },
          required: ['id', 'command'],
        },
      },
      {
        name: 'stop_process',
        description: 'Stop a running process',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Process identifier to stop' },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_logs',
        description: 'Get logs from a process',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Process identifier' },
            lines: { type: 'number', description: 'Number of lines to return (optional)' },
          },
          required: ['id'],
        },
      },
      {
        name: 'search_logs',
        description: 'Search logs for a keyword or regex',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Process identifier' },
            keyword: { type: 'string', description: 'Keyword or regex to search for' },
            regex: { type: 'boolean', description: 'Use regex search (optional)' },
          },
          required: ['id', 'keyword'],
        },
      },
      {
        name: 'list_processes',
        description: 'List all running processes managed by this MCP server',
        inputSchema: {
          type: 'object',
          properties: {
            group: { type: 'string', description: 'Filter by process group (optional)' },
          },
        },
      },
      {
        name: 'run_script',
        description: 'Execute a shell pipeline script (e.g., "npm run build && echo done"). Uses shell mode — less secure than start_process. Only use when shell features (pipes, &&, ||) are required.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', description: 'Unique process identifier' },
            command: { type: 'string', description: 'Shell script to execute (full string, supports pipes, &&, etc.)' },
            cwd: { type: 'string', description: 'Working directory (optional)' },
          },
          required: ['id', 'command'],
        },
      },
      {
        name: 'get_process_status',
        description: 'Get detailed status of a process including CPU, memory, uptime, and restart count',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Process identifier' },
          },
          required: ['id'],
        },
      },
      {
        name: 'restart_process',
        description: 'Stop and restart a running process with the same parameters',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Process identifier to restart' },
          },
          required: ['id'],
        },
      },
      {
        name: 'stop_process_group',
        description: 'Stop all processes in a group',
        inputSchema: {
          type: 'object',
          properties: {
            group: { type: 'string', description: 'Group name to stop' },
          },
          required: ['group'],
        },
      },
      {
        name: 'batch_start',
        description: 'Start multiple processes from a JSON array of commands',
        inputSchema: {
          type: 'object',
          properties: {
            commands: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  command: { type: 'string' },
                  args: { type: 'array', items: { type: 'string' } },
                  cwd: { type: 'string' },
                  group: { type: 'string' },
                  autoRestart: { type: 'boolean' },
                },
                required: ['id', 'command'],
              },
              description: 'Array of commands to start',
            },
          },
          required: ['commands'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'start_process': {
        const validated = validator.validateInput(args as Record<string, unknown>);
        const result = await processManager.startProcess(validated);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'stop_process': {
        const result = await processManager.stopProcess(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'get_logs': {
        const result = await processManager.getLogs(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'search_logs': {
        const result = await processManager.searchLogs(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'list_processes': {
        const result = await processManager.listProcesses(args as { group?: string });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'run_script': {
        const validated = validator.validateShellInput(args as Record<string, unknown>);
        const result = await processManager.startProcessShell(validated);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'get_process_status': {
        const { id } = args as { id: string };
        const result = await processManager.getProcessStatus(id);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'restart_process': {
        const { id } = args as { id: string };
        const result = await processManager.restartProcess(id);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'stop_process_group': {
        const { group } = args as { group: string };
        const result = await processManager.stopProcessGroup(group);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      case 'batch_start': {
        const { commands } = args as { commands: any[] };
        const result = await processManager.batchStart(commands);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: (error as Error).message }) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();

  // Graceful shutdown - kill all processes when server exits
  async function gracefulShutdown() {
    console.error('Shutting down MCP Terminal server...');

    const processes = processManager.getAllProcessIds();
    for (const id of processes) {
      try {
        await processManager.stopProcess({ id });
        console.error(`Stopped process: ${id}`);
      } catch (error) {
        console.error(`Failed to stop process ${id}:`, error);
      }
    }

    process.exit(0);
  }

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

  await server.connect(transport);
  console.error('MCP Terminal server started');

  // Start optional HTTP server (enable with HTTP_PORT env var)
  startHttpServer(processManager);
}

main().catch(console.error);
