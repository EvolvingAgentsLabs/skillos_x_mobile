# CareCompanion — Skills, Memory & Dreams for AI Agents

**A personal wellness assistant that demonstrates how open-weight models (Gemma 4, Gemini) can replicate Anthropic's managed agent primitives: Skills, Memory, and Dreams.**

Built for the [Gemma 4 Good Hackathon](https://www.kaggle.com/competitions/gemma-4-good-hackathon) — Health & Sciences Track.

## Demo Video

[![CareCompanion Demo](https://img.youtube.com/vi/8ho3SpY-rDU/maxresdefault.jpg)](https://youtu.be/8ho3SpY-rDU)

> *3-minute narrative showing CareCompanion helping Maria — a 72-year-old managing diabetes, hypertension, and knee arthritis — through her daily wellness routine. Features Gemmy, our animated Gemma 4 mascot.*

---

## The Problem

Medication non-adherence costs **$300 billion annually** in the US alone and causes 125,000 preventable deaths per year. Elderly patients managing multiple chronic conditions face a compounding challenge: cognitive decline, social isolation, and physical limitations all reduce their ability to maintain health routines.

Existing medication reminder apps are passive — they beep, the patient ignores them. What's needed is an **active care companion** that understands context, adapts to the patient, remembers patterns across sessions, and identifies concerning trends before they become emergencies.

## The Solution

CareCompanion is a mobile AI agent that manages daily wellness routines through three Anthropic-equivalent primitives — implemented entirely with **Gemma 4** via OpenRouter:

### 1. Skills — Progressive Disclosure

Skills are reusable expertise modules (markdown files) loaded on-demand via function calling:

```
skills/
  medication-reminder.skill.md   # Medication check, adherence tracking
  exercise-coaching.skill.md     # Seated exercise routines, pain adaptation
  social-checkin.skill.md        # Emotional wellbeing, family connection
  daily-routine.skill.md         # Master orchestrator by time of day
```

**Level 1**: Only skill name + description appear in the system prompt (~100 tokens/skill).
**Level 2**: Agent calls `load_skill(name)` to get full instructions when needed.

This keeps the context window efficient while allowing deep expertise on demand.

### 2. Memory — Persistent Health Records

Memory stores are directories of versioned markdown documents that persist across sessions:

```
memory/
  health-profile/
    _manifest.json
    medications.md     # Prescriptions, dosages, schedules, adherence patterns
    exercise.md        # Mobility level, preferred exercises, progress tracking
    social.md          # Family contacts, emotional indicators, loneliness patterns
  daily-log/
    _manifest.json
    2026-05-14.md      # What happened today: meds taken, exercises done, mood
```

The agent reads memory at session start to recall the patient's full context, and writes observations at session end. Every write is **SHA256-versioned** for audit trails.

4 memory tools: `read_memory`, `write_memory`, `list_memories`, `delete_memory`

### 3. Dreams — Offline Memory Consolidation

The dream engine is an offline process that reads all session transcripts + memory stores, then uses LLM reasoning to **reorganize, deduplicate, and discover patterns**:

```bash
npm run dream
```

From 9 session transcripts over 5 days, the dream engine produced:

> **CONCERNING: Medication Non-Adherence** — Vitamin D3 missed 4 of 7 days; lab levels at 22 ng/mL (target >30)
>
> **CONCERNING: Evening Medication Gap** — Metformin missed 3 of last 7 evenings
>
> **TREND: Exercise Progress** — Increasing arm circle reps from 8 to 10 despite osteoarthritis
>
> **PATTERN: Afternoon Loneliness** — Consistently isolated 2-5 PM; social contact is primary mood regulator

These insights could be flagged to a caregiver, triggering proactive intervention before a hospitalization.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Agent Loop                         │
│  System prompt + Skills metadata + Memory context    │
│         ↕ generate() with tool definitions           │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Backend     │  │  Tools   │  │  Memory      │   │
│  │  (Gemma 4)   │  │  (15)    │  │  Stores      │   │
│  │  (Gemini)    │  │          │  │              │   │
│  │  (Anthropic) │  │          │  │              │   │
│  └─────────────┘  └──────────┘  └──────────────┘   │
│         ↕                ↕              ↕            │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  OpenRouter  │  │ MobileHAL│  │  Filesystem  │   │
│  │  / Anthropic │  │ (phone)  │  │  (markdown)  │   │
│  └─────────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────┘
         ↓ (after session)
┌─────────────────────────────────────────────────────┐
│               Session Trace Recorder                 │
│  YAML frontmatter + full conversation → traces/      │
└─────────────────────────────────────────────────────┘
         ↓ (offline, async)
┌─────────────────────────────────────────────────────┐
│                  Dream Engine                        │
│  Reads: memory/ + traces/                            │
│  Produces: consolidated knowledge + clinical insights│
│  Writes: memory/consolidated/                        │
└─────────────────────────────────────────────────────┘
```

## Multi-Backend Support

The same agent code runs identically across three backends:

| Backend | Model | Provider | Use Case |
|---------|-------|----------|----------|
| `gemma4` | Gemma 4 26B-A4B | OpenRouter | Default — demonstrates open-weight parity |
| `gemini` | Gemini 2.5 Flash | OpenRouter | Fast inference, good for demos |
| `anthropic` | Claude Sonnet 4 | Anthropic API | Reference implementation |

```bash
# Run with different backends
npm run start:gemma4     # Gemma 4 (default)
npm run start:gemini     # Gemini 2.5 Flash
npm run start:anthropic  # Claude (requires ANTHROPIC_API_KEY)
```

The `Backend` interface abstracts all provider differences:
- OpenRouter backends use the OpenAI-compatible API format
- Anthropic backend translates to native Anthropic format (separate system param, `tool_use` blocks, `tool_result` in user messages)

## Mobile HAL — Phone-Native Tools

CareCompanion uses 10 phone-native tools (+ 1 skill + 4 memory = 15 total):

| Tool | Description |
|------|-------------|
| `get_current_time()` | Current date/time for time-aware care |
| `send_notification(title, body)` | Push notifications for reminders |
| `set_alarm(time, label)` | Medication/activity alarms |
| `get_alarms()` / `cancel_alarm(id)` | Alarm management |
| `get_calendar_events(date?)` | Schedule awareness |
| `show_checklist(items)` | Exercise routine display |
| `update_checklist(index, done)` | Progress tracking |
| `speak(text)` | Text-to-speech output |
| `listen()` | Speech-to-text input |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/EvolvingAgentsLabs/skillos_x_mobile.git
cd skillos_x_mobile
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY

# 3. Run interactive chat mode
npm run chat

# 4. Open web UI and start chatting
# http://localhost:9094

# 5. Run dream consolidation (offline)
npm run dream
```

### Running Modes

| Command | Description |
|---------|-------------|
| `npm run chat` | **Interactive** — chat with CareCompanion via the browser |
| `npm run chat:gemini` | Interactive mode with Gemini backend |
| `npm run start:gemma4` | Automated demo (stub mode, pre-scripted responses) |
| `npm run dream` | Run dream consolidation on session traces |

See [tutorial.md](tutorial.md) for detailed usage instructions, health profile customization, and troubleshooting.

## Project Structure

```
skillos_x_mobile/
├── src/
│   ├── main.ts           # Entry point, WebSocket + HTTP servers
│   ├── agent.ts          # Agent loop with tool execution
│   ├── backend.ts        # Multi-backend: Gemma4, Gemini, Anthropic
│   ├── tools.ts          # 15 tool definitions + unified dispatcher
│   ├── mobile_hal.ts     # Phone HAL interface + stub implementation
│   ├── skills.ts         # SKILL.md parser + progressive disclosure
│   ├── memory.ts         # MemoryStore with SHA256 versioning
│   ├── memory_tools.ts   # Memory tool definitions + dispatcher
│   ├── session_trace.ts  # Conversation recorder for dream input
│   ├── dream.ts          # Dream engine — offline memory consolidation
│   ├── dream_cli.ts      # Dream CLI entry point
│   ├── io.ts             # I/O adapters (WebSocket, console, macOS TTS, stub)
│   └── types.ts          # Shared TypeScript interfaces
├── skills/
│   ├── medication-reminder.skill.md
│   ├── exercise-coaching.skill.md
│   ├── social-checkin.skill.md
│   └── daily-routine.skill.md
├── memory/
│   ├── health-profile/   # Patient health data (seeded)
│   ├── daily-log/        # Session-by-session logs
│   └── consolidated/     # Dream engine output
├── traces/               # Session transcripts for dream input
├── sim/
│   └── mobile_ui.html    # Phone-style web UI
└── package.json
```

## Why Gemma 4?

This project demonstrates that **Gemma 4 26B-A4B can fully replicate the Skills, Memory, and Dreams primitives** that Anthropic provides as managed services with their proprietary models.

Key findings:
- **Tool calling**: Gemma 4 handles 15 tools with complex multi-turn conversations reliably
- **Clinical reasoning**: The dream engine produces medically relevant insights from session data
- **Open-weight advantage**: The same architecture runs on any OpenAI-compatible provider — no vendor lock-in
- **Cost efficiency**: At 26B parameters with MoE, Gemma 4 provides enterprise-grade agent capabilities at a fraction of the cost

## Impact

For a single patient over 5 days, CareCompanion:
- Tracked 20+ medication events, identifying a 57% evening Metformin adherence gap
- Detected declining Vitamin D adherence linked to supply issues
- Correlated social isolation with medication non-compliance
- Discovered that afternoon loneliness (2-5 PM) is the primary mood disruptor
- Found that exercise participation follows a weekly energy cycle

Scale this to millions of patients and you have a system that could:
- Reduce medication-related hospital readmissions
- Provide early warning to caregivers about behavioral changes
- Maintain continuity of care across sessions without human note-taking
- Operate on any device with an internet connection, using open-weight models

## Documentation

- **[Skills, Memory & Dreams: Implementation Comparison](docs/skills-memory-dreams-implementation.md)** — Feature-by-feature comparison with Anthropic's official Managed Agents API, proving functional equivalence.
- **[CareCompanion: User Impact](docs/carecompanion-user-impact.md)** — Why this use case matters for older adults, with real scenarios and healthcare system impact analysis.

## License

Apache 2.0

## Authors

[EvolvingAgentsLabs](https://github.com/EvolvingAgentsLabs)
