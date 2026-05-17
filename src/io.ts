// src/io.ts
// Pluggable I/O adapters for speak/listen.
// Same adapter pattern as skillos_x_robot.

import { execFile } from 'child_process';
import * as readline from 'readline';

// ── Interface ───────────────────────────────────────────────────

export interface IOAdapter {
  speak(text: string): Promise<void>;
  listen(timeoutMs?: number): Promise<string>;
  destroy(): void;
}

// ── ConsoleIOAdapter ────────────────────────────────────────────

export class ConsoleIOAdapter implements IOAdapter {
  private rl: readline.Interface | null = null;

  private getRL(): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }
    return this.rl;
  }

  async speak(text: string): Promise<void> {
    console.log(`\n  Assistant: ${text}\n`);
  }

  async listen(timeoutMs = 30000): Promise<string> {
    return new Promise<string>((resolve) => {
      const rl = this.getRL();
      const timer = setTimeout(() => {
        resolve('[silence]');
      }, timeoutMs);

      rl.question('  You: ', (answer) => {
        clearTimeout(timer);
        resolve(answer.trim() || '[silence]');
      });
    });
  }

  destroy(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

// ── MacOSSayAdapter ─────────────────────────────────────────────

export class MacOSSayAdapter implements IOAdapter {
  private rl: readline.Interface | null = null;
  private voice: string;

  constructor(voice = 'Samantha') {
    this.voice = voice;
  }

  private getRL(): readline.Interface {
    if (!this.rl) {
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }
    return this.rl;
  }

  async speak(text: string): Promise<void> {
    console.log(`\n  Assistant: ${text}\n`);
    return new Promise<void>((resolve) => {
      execFile('say', ['-v', this.voice, text], () => {
        resolve();
      });
    });
  }

  async listen(timeoutMs = 30000): Promise<string> {
    return new Promise<string>((resolve) => {
      const rl = this.getRL();
      const timer = setTimeout(() => {
        resolve('[silence]');
      }, timeoutMs);

      rl.question('  You: ', (answer) => {
        clearTimeout(timer);
        resolve(answer.trim() || '[silence]');
      });
    });
  }

  destroy(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

// ── StubIOAdapter ───────────────────────────────────────────────

export class StubIOAdapter implements IOAdapter {
  private responses: string[];
  private index = 0;
  private spoken: string[] = [];

  constructor(responses?: string[]) {
    this.responses = responses ?? [
      'Good morning! I slept OK but my knees are stiff today.',
      'Yes, I took the Lisinopril and Metformin already. But I forgot the Vitamin D again... I think the bottle is almost empty.',
      'Oh right, I need to ask Miguel to pick some up this weekend. What about my exercises?',
      'My knees are about a 3 out of 10 today. I can do upper body but let\'s skip the marching.',
      'Done! Those shoulder rolls really helped with the stiffness. What\'s next?',
      'I think the arm circles are getting easier. I did 10 on each side today!',
      'Is it almost time for Sofia\'s call? I want to ask her about Lucas\'s school play.',
      'She hasn\'t called yet... she might be busy with her classes today. I\'ll wait a bit.',
      'I\'m feeling a little tired now. Maybe I\'ll rest before my afternoon medications.',
      'Thank you for checking on me. You always make my mornings better.',
      'Goodbye! Don\'t forget to remind me about the evening Metformin.',
    ];
  }

  async speak(text: string): Promise<void> {
    this.spoken.push(text);
    console.log(`  [stub-speak] ${text}`);
  }

  async listen(_timeoutMs?: number): Promise<string> {
    const response = this.responses[this.index % this.responses.length];
    this.index++;
    console.log(`  [stub-listen] -> "${response}"`);
    return response;
  }

  getSpoken(): string[] {
    return [...this.spoken];
  }

  destroy(): void {}
}

// ── WebSocketIOAdapter ─────────────────────────────────────────

export class WebSocketIOAdapter implements IOAdapter {
  private messageQueue: string[] = [];
  private waitingResolve: ((msg: string) => void) | null = null;
  private onWaitingForInput: (() => void) | null = null;

  constructor(opts?: { onWaitingForInput?: () => void }) {
    this.onWaitingForInput = opts?.onWaitingForInput ?? null;
  }

  /** Called when a user message arrives from the WebSocket */
  pushMessage(text: string): void {
    if (this.waitingResolve) {
      const resolve = this.waitingResolve;
      this.waitingResolve = null;
      resolve(text);
    } else {
      this.messageQueue.push(text);
    }
  }

  async speak(text: string): Promise<void> {
    console.log(`  [ws-speak] ${text}`);
  }

  async listen(timeoutMs = 300000): Promise<string> {
    // Check queue first
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!;
    }

    // Signal to UI that we're waiting for input
    if (this.onWaitingForInput) this.onWaitingForInput();

    // Wait for message from WebSocket
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        this.waitingResolve = null;
        resolve('[silence]');
      }, timeoutMs);

      this.waitingResolve = (msg: string) => {
        clearTimeout(timer);
        resolve(msg);
      };
    });
  }

  /** Check if there's a pending listen() waiting for input */
  isWaitingForInput(): boolean {
    return this.waitingResolve !== null;
  }

  destroy(): void {
    if (this.waitingResolve) {
      this.waitingResolve('[disconnect]');
      this.waitingResolve = null;
    }
  }
}

// ── Factory ─────────────────────────────────────────────────────

export type IOAdapterType = 'console' | 'macos' | 'stub' | 'websocket';

export function createIOAdapter(type: IOAdapterType): IOAdapter {
  switch (type) {
    case 'console':   return new ConsoleIOAdapter();
    case 'macos':     return new MacOSSayAdapter();
    case 'stub':      return new StubIOAdapter();
    case 'websocket': return new WebSocketIOAdapter();
    default:          return new ConsoleIOAdapter();
  }
}
