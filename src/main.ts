// src/main.ts
// Entry point for skillos_x_mobile.
// Sets up MobileHAL, loads skills + memory stores, starts WebSocket + HTTP servers,
// runs the agent, and saves session traces.

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';

import type { WsMessage } from './types';
import { StubMobileHAL } from './mobile_hal';
import { createBackend, BackendType } from './backend';
import { loadSkills } from './skills';
import { MemoryStore } from './memory';
import { SessionTraceRecorder } from './session_trace';
import { Agent } from './agent';
import { createIOAdapter, WebSocketIOAdapter } from './io';

// ── Load env ───────────────────────────────────────────────────

dotenv.config();

// ── CLI args ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const useStub = args.includes('--stub');
const taskIdx = args.indexOf('--task');
const task = taskIdx >= 0 && args[taskIdx + 1]
  ? args[taskIdx + 1]
  : 'Good morning! Please help me with my daily wellness routine. Check my schedule, remind me about medications, guide me through some exercises, and help me stay connected with family.';
const backendIdx = args.indexOf('--backend');
const backendType: BackendType = (backendIdx >= 0 && args[backendIdx + 1]
  ? args[backendIdx + 1] as BackendType
  : (process.env.AGENT_BACKEND as BackendType) || 'gemma4');
const wsPort = parseInt(process.env.WS_PORT || '9093', 10);
const httpPort = parseInt(process.env.HTTP_PORT || '9094', 10);

// ── WebSocket server ───────────────────────────────────────────

const wss = new WebSocketServer({ port: wsPort });
const wsClients = new Set<WebSocket>();

// Will be set in main() for interactive mode
let wsIOAdapter: WebSocketIOAdapter | null = null;

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'user_message' && msg.text && wsIOAdapter) {
        console.log(`  [ws] User message from UI: "${msg.text}"`);
        wsIOAdapter.pushMessage(msg.text);
      }
    } catch { /* ignore parse errors */ }
  });
});

function broadcast(msg: WsMessage): void {
  const data = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

// ── HTTP server (serve web UI) ─────────────────────────────────

const uiHtmlPath = path.resolve(__dirname, '../sim/mobile_ui.html');
const httpServer = http.createServer((_req, res) => {
  fs.readFile(uiHtmlPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
  });
});
httpServer.listen(httpPort);

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const interactive = !useStub;

  console.log(`
  ┌────────────────────────────────────────────────┐
  │  skillos_x_mobile — care assistant agent       │
  │  Web UI: http://localhost:${httpPort}               │
  │  WebSocket: ws://localhost:${wsPort}              │
  │  Backend: ${backendType.padEnd(36)}│
  │  Mode: ${useStub ? 'stub (automated)' : 'interactive (web chat)'}          │
  └────────────────────────────────────────────────┘
  `);

  // I/O adapter
  const io = useStub
    ? createIOAdapter('stub')
    : new WebSocketIOAdapter({
        onWaitingForInput: () => broadcast({ type: 'waiting_for_input' }),
      });

  if (!useStub) {
    wsIOAdapter = io as WebSocketIOAdapter;
  }

  // Mobile HAL
  const hal = new StubMobileHAL(io);

  // Backend
  const backend = createBackend(backendType);

  // Skills
  const skillsDir = path.resolve(__dirname, '../skills');
  const skills = loadSkills(skillsDir);
  console.log(`  [main] Loaded ${skills.length} skill(s) from ${skillsDir}`);

  // Memory stores
  const memoryDir = process.env.MEMORY_DIR
    ? path.resolve(process.env.MEMORY_DIR)
    : path.resolve(__dirname, '../memory');
  const memoryStores = MemoryStore.loadAll(memoryDir);
  console.log(`  [main] Loaded ${memoryStores.size} memory store(s) from ${memoryDir}`);

  // Session trace recorder
  const tracesDir = process.env.TRACES_DIR
    ? path.resolve(process.env.TRACES_DIR)
    : path.resolve(__dirname, '../traces');
  const recorder = new SessionTraceRecorder(tracesDir);

  // Agent
  const agent = new Agent({
    backend,
    hal,
    skills,
    memoryStores,
    maxTurns: 50,
    broadcast,
  });

  // ── Run agent ─────────────────────────────────────────────────

  async function runSession(sessionTask: string) {
    try {
      const result = await agent.run(sessionTask);

      // Save session trace
      const tracePath = recorder.save(
        {
          timestamp: new Date().toISOString(),
          task: sessionTask,
          outcome: result.outcome,
          durationMs: result.durationMs,
          turns: result.turns,
          model: backend.getModel(),
          skillsLoaded: result.skillsLoaded,
          memoryReads: result.memoryReads,
          memoryWrites: result.memoryWrites,
        },
        result.messages,
      );
      console.log(`  [main] Session trace saved to ${tracePath}`);
    } catch (err) {
      console.error(`  [main] Agent error: ${err}`);
    }
  }

  // Run the initial session
  await runSession(task);

  if (!interactive) {
    // Stub mode: single run then exit
    io.destroy();
    wss.close();
    httpServer.close();
    console.log('  [main] Servers closed. Goodbye.');
    return;
  }

  // Interactive mode: keep servers alive, wait for new user messages
  console.log(`\n  [main] Session complete. Waiting for new messages from the web UI...`);
  console.log(`  [main] Open http://localhost:${httpPort} to chat with CareCompanion.`);
  console.log(`  [main] Press Ctrl+C to exit.\n`);

  // Broadcast that we're ready for input
  broadcast({ type: 'waiting_for_input' });

  // Continuous loop: wait for user messages, run new sessions
  const wsAdapter = io as WebSocketIOAdapter;
  while (true) {
    const userMsg = await wsAdapter.listen(86400000); // 24h timeout
    if (userMsg === '[disconnect]') break;
    if (userMsg === '[silence]') continue;

    console.log(`  [main] New message from user: "${userMsg}"`);
    await runSession(userMsg);
    console.log(`  [main] Session complete. Waiting for next message...\n`);
    broadcast({ type: 'waiting_for_input' });
  }
}

main().catch(console.error);
