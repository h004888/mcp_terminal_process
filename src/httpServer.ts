import http from 'http';
import { config } from './config.js';
import type { ProcessManager } from './processManager.js';

/**
 * Lightweight HTTP server for health checks and monitoring.
 * Runs alongside the MCP stdio transport.
 *
 * Usage: starts automatically when HTTP_PORT env var is set.
 *   HTTP_PORT=3000 node dist/index.js
 */

export function startHttpServer(processManager: ProcessManager): http.Server {
  const port = parseInt(process.env.HTTP_PORT || '0', 10);
  if (port === 0) {
    return null as any; // HTTP mode disabled
  }

  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Only accept GET requests
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    switch (url.pathname) {
      case '/health': {
        const processIds = processManager.getAllProcessIds();
        const healthData = {
          status: 'ok',
          server: 'mcp-terminal',
          version: '1.0.0',
          uptime: process.uptime(),
          processCount: processIds.length,
          processIds,
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(healthData, null, 2));
        break;
      }

      case '/health/live': {
        // Kubernetes liveness probe
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'alive' }));
        break;
      }

      case '/health/ready': {
        // Kubernetes readiness probe
        const processIds = processManager.getAllProcessIds();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready', processCount: processIds.length }));
        break;
      }

      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found', availableEndpoints: ['/health', '/health/live', '/health/ready'] }));
    }
  });

  server.listen(port, () => {
    console.error(`[mcp-terminal] HTTP server listening on port ${port}`);
    console.error(`[mcp-terminal] Health endpoint: http://localhost:${port}/health`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[mcp-terminal] Port ${port} is already in use. Set HTTP_PORT env var to a different port.`);
    } else {
      console.error(`[mcp-terminal] HTTP server error:`, err);
    }
  });

  return server;
}
