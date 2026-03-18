import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ProcessManager } from './processManager.js';
import { config } from './config.js';

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

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'start_process',
        description: 'Start a long-running process and capture its output to a log file',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique process identifier' },
            command: { type: 'string', description: 'Command to execute' },
            cwd: { type: 'string', description: 'Working directory (optional)' },
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
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'start_process': {
        const result = await processManager.startProcess(args as any);
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

    const processes = Array.from(processManager['processes'].keys());
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
}

main().catch(console.error);
