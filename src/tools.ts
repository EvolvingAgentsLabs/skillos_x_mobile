// src/tools.ts
// Tool definitions (OpenAI function calling format) and unified dispatcher.
// Includes mobile HAL tools, skill tools, and memory tools.

import type { ToolDefinition, ToolCall, Skill } from './types';
import type { MobileHAL } from './mobile_hal';
import type { MemoryStore } from './memory';
import { loadSkillBody } from './skills';
import { dispatchMemoryToolCall, MEMORY_TOOL_DEFINITIONS } from './memory_tools';

// ── Tool context ───────────────────────────────────────────────

export interface ToolContext {
  hal: MobileHAL;
  skills: Skill[];
  memoryStores: Map<string, MemoryStore>;
}

// ── Mobile HAL tool definitions ────────────────────────────────

export const MOBILE_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time. Returns hour, minute, day of week, and ISO timestamp.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_notification',
      description: 'Send a push notification to the user\'s phone with a title and body message.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The notification title (short, attention-getting).',
          },
          body: {
            type: 'string',
            description: 'The notification body text with details.',
          },
        },
        required: ['title', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_alarm',
      description: 'Set an alarm or reminder at a specific time. Format: HH:MM (24-hour).',
      parameters: {
        type: 'object',
        properties: {
          time: {
            type: 'string',
            description: 'The alarm time in HH:MM format (24-hour clock).',
          },
          label: {
            type: 'string',
            description: 'A label describing what the alarm is for.',
          },
        },
        required: ['time', 'label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_alarms',
      description: 'List all active alarms and reminders.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_alarm',
      description: 'Cancel an active alarm by its ID.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The alarm ID to cancel.',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_calendar_events',
      description: 'Get calendar events for a specific date or today if no date is specified.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Optional date in YYYY-MM-DD format. Defaults to today.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_checklist',
      description: 'Display a checklist on the user\'s screen with items to complete.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'string',
            description: 'Comma-separated list of checklist items.',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_checklist',
      description: 'Mark a checklist item as done or not done.',
      parameters: {
        type: 'object',
        properties: {
          index: {
            type: 'number',
            description: 'The zero-based index of the checklist item.',
          },
          done: {
            type: 'string',
            description: '"true" to mark as done, "false" to unmark.',
          },
        },
        required: ['index', 'done'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'speak',
      description: 'Speak text aloud to the user via text-to-speech.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to speak.',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listen',
      description: 'Listen for the user\'s spoken response via speech-to-text.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

// ── Skill tool definition ──────────────────────────────────────

export const SKILL_TOOL_DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: 'load_skill',
    description: 'Load the full instructions for a named skill. Call this when you need to execute a skill from the Available Skills table.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The skill name to load (from the Available Skills table).',
        },
      },
      required: ['name'],
    },
  },
};

// ── Combined tool definitions ──────────────────────────────────

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  ...MOBILE_TOOL_DEFINITIONS,
  SKILL_TOOL_DEFINITION,
  ...MEMORY_TOOL_DEFINITIONS,
];

// ── Memory tool names ──────────────────────────────────────────

const MEMORY_TOOL_NAMES = new Set(
  MEMORY_TOOL_DEFINITIONS.map(t => t.function.name),
);

// ── Unified dispatcher ─────────────────────────────────────────

export async function dispatchToolCall(
  ctx: ToolContext,
  toolCall: ToolCall,
): Promise<unknown> {
  const name = toolCall.function.name;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    return { error: `Invalid JSON arguments: ${toolCall.function.arguments}` };
  }

  // Skill tool
  if (name === 'load_skill') {
    const skillName = String(args.name || '');
    const body = loadSkillBody(ctx.skills, skillName);
    if (body === null) {
      return { error: `Skill not found: "${skillName}". Available: ${ctx.skills.map(s => s.meta.name).join(', ')}` };
    }
    return { skill: skillName, instructions: body };
  }

  // Memory tools
  if (MEMORY_TOOL_NAMES.has(name)) {
    return dispatchMemoryToolCall(ctx.memoryStores, toolCall);
  }

  // Mobile HAL tools
  switch (name) {
    case 'get_current_time':
      return ctx.hal.get_current_time();
    case 'send_notification':
      return ctx.hal.send_notification(
        String(args.title || ''),
        String(args.body || ''),
      );
    case 'set_alarm':
      return ctx.hal.set_alarm(
        String(args.time || ''),
        String(args.label || ''),
      );
    case 'get_alarms':
      return ctx.hal.get_alarms();
    case 'cancel_alarm':
      return ctx.hal.cancel_alarm(String(args.id || ''));
    case 'get_calendar_events':
      return ctx.hal.get_calendar_events(args.date ? String(args.date) : undefined);
    case 'show_checklist': {
      const itemsStr = String(args.items || '');
      const items = itemsStr.split(',').map(s => s.trim()).filter(Boolean);
      return ctx.hal.show_checklist(items);
    }
    case 'update_checklist':
      return ctx.hal.update_checklist(
        Number(args.index) || 0,
        String(args.done) === 'true',
      );
    case 'speak':
      return ctx.hal.speak(String(args.text || ''));
    case 'listen':
      return ctx.hal.listen();
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
