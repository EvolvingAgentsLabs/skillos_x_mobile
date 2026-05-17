// src/types.ts
// Shared interfaces for skillos_x_mobile.

// ── Mobile context ──────────────────────────────────────────

export interface TimeInfo {
  iso: string;       // ISO 8601 timestamp
  hour: number;      // 0-23
  minute: number;    // 0-59
  dayOfWeek: string; // e.g., "Monday"
  date: string;      // e.g., "2026-05-12"
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  sentAt: string;
}

export interface Alarm {
  id: string;
  time: string;      // HH:MM
  label: string;
  active: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;     // ISO timestamp
  end: string;       // ISO timestamp
  location?: string;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

// ── Skills ─────────────────────────────────────────────────

export interface SkillMeta {
  name: string;
  description: string;
}

export interface Skill {
  meta: SkillMeta;
  instructions: string;
  filePath: string;
}

// ── OpenAI-compatible function calling ─────────────────────

export interface ToolFunctionParameter {
  type: string;
  description?: string;
  enum?: string[];
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolFunctionParameter>;
    required?: string[];
  };
}

export interface ToolDefinition {
  type: 'function';
  function: ToolFunction;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

// ── Chat messages ──────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// ── Backend ────────────────────────────────────────────────

export interface GenerateResult {
  message: string | null;
  tool_calls?: ToolCall[];
  finish_reason: string;
  model: string;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

// ── Memory ─────────────────────────────────────────────────

export interface MemoryManifest {
  name: string;
  description: string;
  instructions: string;
  access: 'read_write' | 'read_only';
  created: string;
  maxSizeBytes: number;
}

export interface MemoryDocument {
  path: string;
  content: string;
  sha256: string;
  version: number;
  lastModified: string;
}

// ── Session traces ─────────────────────────────────────────

export interface SessionTraceMeta {
  timestamp: string;
  task: string;
  outcome: 'success' | 'failure' | 'max_turns';
  durationMs: number;
  turns: number;
  model: string;
  skillsLoaded: string[];
  memoryReads: number;
  memoryWrites: number;
}

export interface ParsedTranscript {
  meta: SessionTraceMeta;
  summary: string;
  filePath: string;
}

// ── Agent result ───────────────────────────────────────────

export interface AgentRunResult {
  outcome: 'success' | 'failure' | 'max_turns';
  turns: number;
  durationMs: number;
  messages: ChatMessage[];
  skillsLoaded: string[];
  memoryReads: number;
  memoryWrites: number;
}

// ── Dream ──────────────────────────────────────────────────

export interface DreamResult {
  status: 'completed' | 'failed';
  transcriptsProcessed: number;
  memoriesRead: number;
  memoriesWritten: number;
  insights: string[];
  journalEntry: string;
  durationMs: number;
}

// ── WebSocket messages ─────────────────────────────────────

export type WsMessage =
  | { type: 'speak'; text: string; step: number }
  | { type: 'listen'; text: string; step: number }
  | { type: 'notification'; title: string; body: string; step: number }
  | { type: 'alarm'; time: string; label: string; step: number }
  | { type: 'checklist'; items: ChecklistItem[]; step: number }
  | { type: 'halt'; status: string }
  | { type: 'tool_call'; name: string; args: unknown; step: number }
  | { type: 'user_message'; text: string }
  | { type: 'waiting_for_input' }
  | { type: 'dream_progress'; stage: string; detail: string }
  | { type: 'dream_complete'; result: DreamResult };
