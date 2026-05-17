// src/main.ts
// Entry point for skillos_x_mobile.
// Sets up MobileHAL, loads skills + memory stores, starts WebSocket + HTTP servers,
// runs the agent, and saves session traces. Provides REST API for dashboard UI.

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
import { DreamEngine } from './dream';
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

// ── HTTP server (created early, handler set in main) ──────────

const uiHtmlPath = path.resolve(__dirname, '../sim/mobile_ui.html');
const httpServer = http.createServer();
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

  // ── REST API + UI serving ─────────────────────────────────────

  let dreamRunning = false;

  const serveUI = (_req: http.IncomingMessage, res: http.ServerResponse) => {
    fs.readFile(uiHtmlPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  };

  const json = (res: http.ServerResponse, data: unknown, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const readBody = (req: http.IncomingMessage): Promise<string> => new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });

  httpServer.on('request', async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${httpPort}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      // ── GET / ── serve UI
      if ((pathname === '/' || pathname === '/index.html') && method === 'GET') {
        serveUI(req, res);
        return;
      }

      // ── GET /api/skills ── list all skills
      if (pathname === '/api/skills' && method === 'GET') {
        json(res, skills.map(s => ({
          name: s.meta.name,
          description: s.meta.description,
        })));
        return;
      }

      // ── GET /api/skills/:name ── get skill body
      const skillMatch = pathname.match(/^\/api\/skills\/([^/]+)$/);
      if (skillMatch && method === 'GET') {
        const name = decodeURIComponent(skillMatch[1]);
        const skill = skills.find(s => s.meta.name === name);
        if (!skill) { json(res, { error: 'Skill not found' }, 404); return; }
        json(res, {
          name: skill.meta.name,
          description: skill.meta.description,
          instructions: skill.instructions,
        });
        return;
      }

      // ── GET /api/memory ── list all stores
      if (pathname === '/api/memory' && method === 'GET') {
        const storeList = [];
        for (const [, store] of memoryStores) {
          const m = store.getManifest();
          storeList.push({
            name: m.name,
            description: m.description,
            access: m.access,
            documents: store.list().length,
          });
        }
        json(res, storeList);
        return;
      }

      // ── GET /api/memory/:store ── list documents in store
      const storeMatch = pathname.match(/^\/api\/memory\/([^/]+)$/);
      if (storeMatch && method === 'GET') {
        const storeName = decodeURIComponent(storeMatch[1]);
        const store = memoryStores.get(storeName);
        if (!store) { json(res, { error: 'Store not found' }, 404); return; }
        json(res, {
          name: storeName,
          manifest: store.getManifest(),
          documents: store.list(),
        });
        return;
      }

      // ── GET/POST /api/memory/:store/:path+ ── read or write document
      const docMatch = pathname.match(/^\/api\/memory\/([^/]+)\/(.+)$/);
      if (docMatch) {
        const storeName = decodeURIComponent(docMatch[1]);
        const docPath = decodeURIComponent(docMatch[2]);
        const store = memoryStores.get(storeName);
        if (!store) { json(res, { error: 'Store not found' }, 404); return; }

        if (method === 'GET') {
          const doc = store.read(docPath);
          if (!doc) { json(res, { error: 'Document not found' }, 404); return; }
          json(res, doc);
          return;
        }

        if (method === 'POST') {
          const body = await readBody(req);
          let parsed: { content?: string };
          try { parsed = JSON.parse(body); } catch { json(res, { error: 'Invalid JSON' }, 400); return; }
          if (!parsed.content) { json(res, { error: 'Missing content field' }, 400); return; }
          const result = store.write(docPath, parsed.content);
          json(res, result);
          return;
        }
      }

      // ── GET /api/traces ── list session traces
      if (pathname === '/api/traces' && method === 'GET') {
        const transcripts = SessionTraceRecorder.loadTranscripts(tracesDir, 50);
        json(res, transcripts.map(t => ({
          timestamp: t.meta.timestamp,
          task: t.meta.task,
          outcome: t.meta.outcome,
          turns: t.meta.turns,
          durationMs: t.meta.durationMs,
          model: t.meta.model,
          skillsLoaded: t.meta.skillsLoaded,
          memoryReads: t.meta.memoryReads,
          memoryWrites: t.meta.memoryWrites,
          summary: t.summary,
        })));
        return;
      }

      // ── POST /api/dream ── trigger dream consolidation
      if (pathname === '/api/dream' && method === 'POST') {
        if (dreamRunning) {
          json(res, { error: 'Dream consolidation is already running' }, 409);
          return;
        }

        dreamRunning = true;
        broadcast({ type: 'dream_progress', stage: 'starting', detail: 'Initializing dream engine...' });

        try {
          const dreamBackend = createBackend(backendType);
          const engine = new DreamEngine(
            {
              memoryDir,
              tracesDir,
              outputStore: 'consolidated',
              maxTranscripts: 100,
            },
            dreamBackend,
          );

          broadcast({ type: 'dream_progress', stage: 'consolidating', detail: 'Processing transcripts and memories...' });
          const result = await engine.dream();
          broadcast({ type: 'dream_complete', result });

          // Reload memory stores to pick up new consolidated data
          const newStores = MemoryStore.loadAll(memoryDir);
          memoryStores.clear();
          for (const [k, v] of newStores) memoryStores.set(k, v);

          json(res, result);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          json(res, { error: errMsg }, 500);
        } finally {
          dreamRunning = false;
        }
        return;
      }

      // ── Fallback: serve UI
      serveUI(req, res);
    } catch (err) {
      console.error(`  [http] Error: ${err}`);
      json(res, { error: 'Internal server error' }, 500);
    }
  });

  console.log(`  [main] REST API ready at http://localhost:${httpPort}/api/`);

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
