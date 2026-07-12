/**
 * MCP Terminal — End-to-End Test Script
 *
 * Uses the official @modelcontextprotocol/sdk Client to connect to the
 * MCP Terminal server and exercise every tool in a single session.
 *
 * Usage: npx tsx tests/end-to-end.test.ts
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); failed++; }
}

const sleepCmd = 'node';
const sleepArgs = ['-e', 'setTimeout(()=>{},10000)']; // 10s persistent process
const WAIT = 300;

async function main() {
  console.log('═══ MCP Terminal — End-to-End Test ═══\n');

  // ── Connect ──
  console.log('1. Connect & Handshake');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.resolve(__dirname, '..', 'dist', 'index.js')],
  });
  const client = new Client({ name: 'e2e-test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  assert(true, 'Server started, handshake completed');

  // ── List Tools ──
  console.log('\n2. List Tools');
  const { tools } = await client.listTools();
  assert(tools.length >= 10, `Expected >= 10 tools, got ${tools.length}`);

  const names = tools.map(t => t.name);
  const expected = ['start_process', 'stop_process', 'get_logs', 'search_logs',
    'list_processes', 'run_script', 'get_process_status',
    'restart_process', 'stop_process_group', 'batch_start'];
  for (const n of expected) assert(names.includes(n), `Tool '${n}' registered`);

  // Helper to parse tool call results
  function parse(res: any) {
    return JSON.parse(res.content[0].text);
  }

  // ── start_process + echo ──
  console.log('\n3. start_process (short-lived) + get_logs');
  const startRes = parse(await client.callTool({
    name: 'start_process',
    arguments: { id: 'echo-test', command: 'echo', args: ['Hello E2E'] },
  }));
  assert(startRes.status === 'started', `start_process: status = ${startRes.status}`);

  await new Promise(r => setTimeout(r, 1500));

  // Read full logs (no lines limit) for short-lived processes
  const logsRes = parse(await client.callTool({
    name: 'get_logs', arguments: { id: 'echo-test' },
  }));
  // Strip \r for cross-platform CRLF handling
  const normalized = logsRes.logs.replace(/\r/g, '');
  assert(normalized.includes('Hello E2E'), 'get_logs contains expected output');
  assert(logsRes.id === 'echo-test', 'get_logs correct ID');
  assert(logsRes.id === 'echo-test', 'get_logs correct ID');

  // ── start_process (long-running) + group ──
  console.log('\n4. start_process (long-running) + group');
  await client.callTool({
    name: 'start_process',
    arguments: { id: 'svc-a', command: sleepCmd, args: sleepArgs, group: 'backend' },
  });
  await client.callTool({
    name: 'start_process',
    arguments: { id: 'svc-b', command: sleepCmd, args: sleepArgs, group: 'backend' },
  });
  await new Promise(r => setTimeout(r, WAIT));
  assert(true, 'Two persistent processes started with group=backend');

  // ── list_processes ──
  console.log('\n5. list_processes');
  const all = parse(await client.callTool({ name: 'list_processes', arguments: {} }));
  assert(all.processes.length >= 2, `Total: ${all.processes.length}`);

  const grp = parse(await client.callTool({
    name: 'list_processes', arguments: { group: 'backend' },
  }));
  assert(grp.processes.length >= 2, `Group backend: ${grp.processes.length}`);

  // ── get_process_status ──
  console.log('\n6. get_process_status');
  const status = parse(await client.callTool({
    name: 'get_process_status', arguments: { id: 'svc-a' },
  }));
  assert(status.status === 'running', `status = ${status.status}`);
  assert(status.uptime !== undefined, 'uptime field present');

  // ── search_logs ──
  console.log('\n7. search_logs');
  const search = parse(await client.callTool({
    name: 'search_logs', arguments: { id: 'echo-test', keyword: 'Hello' },
  }));
  assert(search.matches.length > 0, `Found ${search.matches.length} matches`);

  // ── batch_start ──
  console.log('\n8. batch_start');
  const batch = parse(await client.callTool({
    name: 'batch_start',
    arguments: {
      commands: [
        { id: 'batch-a', command: sleepCmd, args: sleepArgs, group: 'workers' },
        { id: 'batch-b', command: sleepCmd, args: sleepArgs, group: 'workers' },
      ],
    },
  }));
  assert(batch.started === 2, `Started ${batch.started}/2`);
  assert(batch.errors.length === 0, '0 errors');

  // ── restart_process ──
  console.log('\n9. restart_process');
  const restart = parse(await client.callTool({
    name: 'restart_process', arguments: { id: 'svc-a' },
  }));
  assert(restart.status === 'started', `restart_process: ${restart.status}`);
  // Verify it's running again
  await new Promise(r => setTimeout(r, WAIT));
  const afterRestart = parse(await client.callTool({
    name: 'get_process_status', arguments: { id: 'svc-a' },
  }));
  assert(afterRestart.status === 'running', 'Process running after restart');

  // ── stop_process_group ──
  console.log('\n10. stop_process_group');
  const stopG = parse(await client.callTool({
    name: 'stop_process_group', arguments: { group: 'backend' },
  }));
  assert(stopG.stopped >= 1, `Stopped ${stopG.stopped} in backend`);
  await new Promise(r => setTimeout(r, WAIT));
  const afterStop = parse(await client.callTool({
    name: 'list_processes', arguments: { group: 'backend' },
  }));
  assert(afterStop.processes.length === 0, 'Backend group is empty');

  // ── run_script ──
  console.log('\n11. run_script');
  const script = parse(await client.callTool({
    name: 'run_script',
    arguments: { id: 'script-test', command: 'echo "Shell pipeline test"' },
  }));
  assert(script.status === 'started', `run_script: ${script.status}`);
  await new Promise(r => setTimeout(r, 1500));
  const scriptLogs = parse(await client.callTool({
    name: 'get_logs', arguments: { id: 'script-test' },
  }));
  assert(scriptLogs.logs.replace(/\r/g, '').includes('Shell pipeline test'), 'run_script output captured');

  // ── stop_process ──
  console.log('\n12. stop_process (individual)');
  const stop = parse(await client.callTool({
    name: 'stop_process', arguments: { id: 'batch-a' },
  }));
  assert(stop.status === 'stopped', `stop_process: ${stop.status}`);

  // ── Error handling ──
  console.log('\n13. Error handling');
  const err1 = await client.callTool({
    name: 'stop_process', arguments: { id: 'nonexistent' },
  });
  assert(err1.isError === true, 'stop_process(nonexistent) returns error');

  const err2 = await client.callTool({
    name: 'get_logs', arguments: { id: 'nonexistent' },
  });
  assert(err2.isError === true, 'get_logs(nonexistent) returns error');

  const err3 = await client.callTool({
    name: 'stop_process_group', arguments: { group: 'ghost' },
  });
  assert(err3.isError === true, 'stop_process_group(ghost) returns error');

  const err4 = await client.callTool({
    name: 'restart_process', arguments: { id: 'nonexistent' },
  });
  assert(err4.isError === true, 'restart_process(nonexistent) returns error');

  // ── Security validation ──
  console.log('\n14. Security validation');
  const blocked = await client.callTool({
    name: 'start_process',
    arguments: { id: 'hack', command: 'rm', args: ['-rf', '/'] },
  });
  assert(blocked.isError === true, 'Blocked command returns error');
  const blockedText = JSON.parse(blocked.content[0]?.text || '{}');
  assert(blockedText.error?.includes('not in the allowed list'), 'Error mentions allowlist');

  // ── Results ──
  console.log(`\n═══ Results: ${passed}/${passed + failed} passed ═══`);
  await client.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
