// src/agent.ts
// Agent loop: model + tools + skills + memory.
// Adapted from skillos_x_robot for mobile care assistant use case.

import type { ChatMessage, ToolCall, WsMessage, Skill, AgentRunResult } from './types';
import type { MobileHAL } from './mobile_hal';
import type { MemoryStore } from './memory';
import type { Backend } from './backend';
import { TOOL_DEFINITIONS, dispatchToolCall, ToolContext } from './tools';
import { buildSkillMetadataPrompt } from './skills';
import { buildMemoryPrompt } from './memory';

// ── Agent ──────────────────────────────────────────────────────

export interface AgentConfig {
  backend: Backend;
  hal: MobileHAL;
  skills: Skill[];
  memoryStores: Map<string, MemoryStore>;
  maxTurns?: number;
  broadcast?: (msg: WsMessage) => void;
}

export class Agent {
  private backend: Backend;
  private hal: MobileHAL;
  private skills: Skill[];
  private memoryStores: Map<string, MemoryStore>;
  private maxTurns: number;
  private broadcast: (msg: WsMessage) => void;
  private step = 0;
  private skillsLoaded: string[] = [];
  private memoryReads = 0;
  private memoryWrites = 0;

  constructor(config: AgentConfig) {
    this.backend = config.backend;
    this.hal = config.hal;
    this.skills = config.skills;
    this.memoryStores = config.memoryStores;
    this.maxTurns = config.maxTurns ?? 50;
    this.broadcast = config.broadcast ?? (() => {});
  }

  async run(task: string): Promise<AgentRunResult> {
    const startTime = Date.now();
    this.skillsLoaded = [];
    this.memoryReads = 0;
    this.memoryWrites = 0;

    const systemPrompt = this.buildSystemPrompt();
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ];

    console.log(`\n  [agent] Task: "${task}"`);
    console.log(`  [agent] Model: ${this.backend.getModel()}`);
    console.log(`  [agent] Skills available: ${this.skills.map(s => s.meta.name).join(', ') || 'none'}`);
    console.log(`  [agent] Memory stores: ${[...this.memoryStores.keys()].join(', ') || 'none'}`);
    console.log(`  [agent] Max turns: ${this.maxTurns}\n`);

    let outcome: AgentRunResult['outcome'] = 'success';

    for (let turn = 0; turn < this.maxTurns; turn++) {
      this.step = turn + 1;
      console.log(`  [agent] --- Turn ${this.step} ---`);

      let result;
      try {
        result = await this.backend.generate(messages, TOOL_DEFINITIONS);
      } catch (err) {
        console.error(`  [agent] Backend error: ${err}`);
        this.broadcast({ type: 'halt', status: 'error' });
        outcome = 'failure';
        break;
      }

      // If the model returned tool calls, execute them
      if (result.tool_calls && result.tool_calls.length > 0) {
        messages.push({
          role: 'assistant',
          content: result.message,
          tool_calls: result.tool_calls,
        });

        for (const tc of result.tool_calls) {
          console.log(`  [agent] tool_call: ${tc.function.name}(${tc.function.arguments})`);

          const output = await this.executeToolCall(tc);

          messages.push({
            role: 'tool',
            content: JSON.stringify(output),
            tool_call_id: tc.id,
          });
        }
        continue;
      }

      // No tool calls — model is speaking or done
      if (result.message) {
        console.log(`  [agent] assistant: ${result.message}`);
        messages.push({ role: 'assistant', content: result.message });
      }

      if (result.finish_reason === 'stop') {
        console.log(`  [agent] Model signaled stop. Done.`);
        this.broadcast({ type: 'halt', status: 'complete' });
        break;
      }

      if (!result.tool_calls?.length && result.finish_reason !== 'tool_calls') {
        console.log(`  [agent] No tool calls and finish_reason="${result.finish_reason}". Halting.`);
        this.broadcast({ type: 'halt', status: 'complete' });
        break;
      }
    }

    if (this.step >= this.maxTurns) {
      console.log(`  [agent] Max turns reached (${this.maxTurns}). Halting.`);
      this.broadcast({ type: 'halt', status: 'max_turns' });
      outcome = 'max_turns';
    }

    const durationMs = Date.now() - startTime;
    console.log(`  [agent] Finished after ${this.step} turns (${durationMs}ms).`);
    console.log(`  [agent] Skills loaded: ${this.skillsLoaded.join(', ') || 'none'}`);
    console.log(`  [agent] Memory ops: ${this.memoryReads} reads, ${this.memoryWrites} writes`);

    return {
      outcome,
      turns: this.step,
      durationMs,
      messages,
      skillsLoaded: [...this.skillsLoaded],
      memoryReads: this.memoryReads,
      memoryWrites: this.memoryWrites,
    };
  }

  // ── Private ────────────────────────────────────────────────

  private async executeToolCall(tc: ToolCall): Promise<unknown> {
    const name = tc.function.name;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || '{}');
    } catch { /* use empty args */ }

    // Broadcast the tool call event
    this.broadcast({
      type: 'tool_call',
      name,
      args,
      step: this.step,
    });

    const ctx: ToolContext = {
      hal: this.hal,
      skills: this.skills,
      memoryStores: this.memoryStores,
    };

    const output = await dispatchToolCall(ctx, tc);

    // Track skill loads
    if (name === 'load_skill' && args.name) {
      const skillName = String(args.name);
      if (!this.skillsLoaded.includes(skillName)) {
        this.skillsLoaded.push(skillName);
      }
    }

    // Track memory operations
    if (name === 'read_memory') this.memoryReads++;
    if (name === 'write_memory') this.memoryWrites++;
    if (name === 'delete_memory') this.memoryWrites++;

    // Broadcast specific events for UI
    if (name === 'speak') {
      this.broadcast({ type: 'speak', text: String(args.text || ''), step: this.step });
    } else if (name === 'listen') {
      const result = output as { text: string };
      this.broadcast({ type: 'listen', text: result.text, step: this.step });
    } else if (name === 'send_notification') {
      this.broadcast({
        type: 'notification',
        title: String(args.title || ''),
        body: String(args.body || ''),
        step: this.step,
      });
    } else if (name === 'set_alarm') {
      this.broadcast({
        type: 'alarm',
        time: String(args.time || ''),
        label: String(args.label || ''),
        step: this.step,
      });
    } else if (name === 'show_checklist') {
      const result = output as { items: Array<{ text: string; done: boolean }> };
      this.broadcast({ type: 'checklist', items: result.items, step: this.step });
    }

    return output;
  }

  private buildSystemPrompt(): string {
    const skillSection = buildSkillMetadataPrompt(this.skills);
    const memorySection = buildMemoryPrompt(this.memoryStores);

    return `You are CareCompanion, a personal wellness assistant running on the user's mobile phone. You help adults manage their daily health routines: medication reminders, exercise coaching, social connections, and overall wellbeing.

## Your capabilities

You have tools to interact with the user's phone:
- get_current_time() — check the current date, time, and day of week
- send_notification(title, body) — send a push notification to the user
- set_alarm(time, label) — set a reminder alarm (HH:MM format)
- get_alarms() — list all active alarms
- cancel_alarm(id) — cancel an alarm
- get_calendar_events(date?) — check the user's schedule for today or a specific date
- show_checklist(items) — display a checklist on screen (comma-separated items)
- update_checklist(index, done) — mark checklist items as completed
- speak(text) — speak to the user via text-to-speech
- listen() — listen for the user's spoken response

## Care protocol

1. **Start each session** by checking the current time and the user's calendar.
2. **Check memory** for the user's health profile, medication schedule, and recent daily logs.
3. **Prioritize** based on time of day:
   - Morning: medication check, daily plan review
   - Midday: exercise coaching, social check-in
   - Afternoon: medication check, activity review
   - Evening: daily summary, next-day preparation
4. **Be conversational** — ask how they're feeling, listen to their responses, adapt your approach.
5. **Log everything** to memory: medications taken, exercises completed, mood observations.
6. **Set reminders** for upcoming medications or activities.
7. When a task is complete, stop calling tools and provide a warm summary.

## Important rules

- Always check memory at the start to recall prior interactions and health information.
- Be warm, patient, and encouraging — never rush or pressure.
- If the user reports pain or discomfort, acknowledge it and adjust recommendations.
- Keep track of what has been done today to avoid repeating reminders.
- Write important observations to memory for future sessions.
- Use notifications for time-sensitive reminders (medications).
- Use checklists for multi-step activities (exercise routines).
${skillSection}${memorySection}`;
  }
}
