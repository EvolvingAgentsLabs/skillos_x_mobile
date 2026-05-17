# Skills, Memory & Dreams: Implementation Comparison

## How CareCompanion implements the same primitives as Anthropic's Managed Agents API

This document compares the three core primitives — **Skills**, **Memory**, and **Dreams** — as implemented in CareCompanion (using Gemma 4 / Gemini via OpenRouter) against Anthropic's official Managed Agents API (beta, 2026).

---

## 1. Skills — Progressive Disclosure

### Anthropic's Implementation

Anthropic's Agent Skills ([docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)) are filesystem-based resources that provide domain expertise through a 3-level progressive disclosure architecture:

| Level | When Loaded | Token Cost | Content |
|-------|------------|------------|---------|
| Level 1: Metadata | Always (at startup) | ~100 tokens/skill | `name` and `description` from YAML frontmatter |
| Level 2: Instructions | When skill is triggered | Under 5k tokens | SKILL.md body with instructions and guidance |
| Level 3+: Resources | As needed | Effectively unlimited | Bundled files, scripts, reference materials |

- Skills are `SKILL.md` files with YAML frontmatter (`name`, `description`)
- Claude reads skill metadata at startup and includes it in the system prompt
- When a task matches a skill's description, Claude reads the full SKILL.md via bash
- Additional files (scripts, templates, reference docs) are accessed only when referenced
- Skills are filesystem-based directories discovered automatically

### CareCompanion's Implementation

Our implementation (`src/skills.ts`) replicates the same progressive disclosure pattern:

| Level | When Loaded | Token Cost | Content |
|-------|------------|------------|---------|
| Level 1: Metadata | Always (in system prompt) | ~100 tokens/skill | `name` and `description` table |
| Level 2: Instructions | When `load_skill(name)` is called | Variable | Full SKILL.md body |
| Level 3: Resources | Not yet implemented | — | Future: skill subdirectories |

**How it works:**

1. **Skill definition format** — Identical to Anthropic: YAML frontmatter with `name` + `description`, followed by markdown instructions.

```yaml
---
name: medication-reminder
description: Check medication schedule, confirm adherence, handle missed doses, set reminders.
---
## Instructions
...
```

2. **Level 1 — Metadata injection** — `buildSkillMetadataPrompt(skills)` generates a table in the system prompt:

```
## Available Skills
| Skill | Description |
|-------|-------------|
| medication-reminder | Check medication schedule, confirm adherence... |
| exercise-coaching | Guide the user through a personalized exercise... |

To use a skill, call `load_skill(name)` to get detailed instructions.
```

3. **Level 2 — On-demand loading** — The `load_skill` tool returns the full skill body when called:

```typescript
// Agent calls: load_skill({ name: "medication-reminder" })
// Returns: { skill: "medication-reminder", instructions: "## Instructions\n..." }
```

4. **Level 3 — Resources** — Not yet implemented (future: skill subdirectories with scripts).

### Functional Equivalence

| Feature | Anthropic | CareCompanion | Match |
|---------|-----------|---------------|-------|
| YAML frontmatter format | `name` + `description` | `name` + `description` | Identical |
| Metadata in system prompt | Automatic | `buildSkillMetadataPrompt()` | Equivalent |
| On-demand loading | Claude reads via bash | `load_skill()` tool call | Equivalent |
| Token efficiency | ~100 tokens/skill at startup | ~100 tokens/skill at startup | Identical |
| Bundled scripts/resources | Level 3 via filesystem | Not yet implemented | Partial |
| Auto-discovery | Filesystem scan | Directory scan at startup | Equivalent |

**Key difference**: Anthropic uses bash filesystem access in a VM; CareCompanion uses a dedicated `load_skill` tool. The functional result is identical — the model decides when to load a skill and gets the full instructions only when needed.

---

## 2. Memory — Persistent Stores

### Anthropic's Implementation

Anthropic's Memory Stores ([docs](https://platform.claude.com/docs/en/managed-agents/memory)) are workspace-scoped collections of text documents:

- **Store creation**: Named collections with `name`, `description`, `access` mode
- **Documents**: Addressed by path, capped at 100 kB per document
- **Access modes**: `read_write` or `read_only`
- **System prompt injection**: Each mounted store gets a description in the system prompt (path, access mode, description, instructions)
- **Versioning**: Every mutation creates an immutable **memory version** with SHA256 content hash
- **Optimistic concurrency**: `precondition.content_sha256` prevents clobbering concurrent writes
- **Operations**: create, read, update, delete, list (with path_prefix filtering)
- **Agent access**: Via standard agent toolset (file operations on mounted `/mnt/memory/` directory)
- **Per-session instructions**: Optional guidance text (max 4,096 chars) for how the agent should use the store
- **Max 8 stores per session**
- **Audit trail**: Versions retained 30 days, survive document deletion

### CareCompanion's Implementation

Our implementation (`src/memory.ts` + `src/memory_tools.ts`) replicates the same architecture:

- **Store creation**: Directories with `_manifest.json` containing `name`, `description`, `access`, `instructions`, `maxSizeBytes`
- **Documents**: Markdown files addressed by path within the store directory
- **Access modes**: `read_write` or `read_only` (enforced at write time)
- **System prompt injection**: `buildMemoryPrompt()` generates a table of stores with access modes and per-store instructions
- **Versioning**: Every write creates a `.v{N}` backup file with SHA256 hash tracking
- **Optimistic concurrency**: `preconditionSha256` parameter prevents clobbering
- **Operations**: `read_memory`, `write_memory`, `list_memories`, `delete_memory`
- **Agent access**: Via 4 dedicated tool definitions (OpenAI function calling format)

**Store manifest** (`_manifest.json`):
```json
{
  "name": "health-profile",
  "description": "Patient health data: medications, exercise, social connections.",
  "instructions": "Check at session start for health context. Write observations at session end.",
  "access": "read_write",
  "created": "2026-05-12T00:00:00Z",
  "maxSizeBytes": 102400
}
```

**System prompt injection** (generated by `buildMemoryPrompt()`):
```
## Memory Stores
| Store | Access | Description |
|-------|--------|-------------|
| health-profile | read_write | Patient health data: medications, exercise... |
| daily-log | read_write | Daily session logs with medication and exercise tracking |

### Memory Instructions
- **health-profile**: Check at session start for health context...
```

### Functional Equivalence

| Feature | Anthropic | CareCompanion | Match |
|---------|-----------|---------------|-------|
| Named stores with description | API-created, workspace-scoped | `_manifest.json` per directory | Equivalent |
| Access modes (read_write/read_only) | Enforced at mount level | Enforced at write time | Equivalent |
| Per-store instructions | `instructions` param (4096 chars) | `instructions` field in manifest | Equivalent |
| System prompt injection | Automatic mount description | `buildMemoryPrompt()` | Equivalent |
| Path-addressed documents | REST paths | Filesystem paths | Equivalent |
| SHA256 versioning | Immutable `memory_version` objects | `.v{N}` backup files with SHA256 | Equivalent |
| Optimistic concurrency | `precondition.content_sha256` | `preconditionSha256` parameter | Equivalent |
| Document size cap | 100 kB | `maxSizeBytes` in manifest | Equivalent |
| CRUD operations | create/read/update/delete/list | read_memory/write_memory/list/delete | Equivalent |
| Audit trail | 30-day version retention | All `.v{N}` files preserved | Equivalent |
| Max stores per session | 8 | Unlimited (filesystem-based) | CareCompanion more flexible |
| Version redaction | `memory_versions.redact()` | Not implemented | Anthropic only |
| Store archival | `archive()` endpoint | Not implemented | Anthropic only |

**Key difference**: Anthropic uses a cloud API with REST endpoints; CareCompanion uses the local filesystem. The agent-facing interface is functionally identical — both expose read/write/list/delete operations with versioning and access control. Anthropic adds enterprise features (redaction, archival, cloud storage) that aren't needed for the agent's core functionality.

---

## 3. Dreams — Offline Memory Consolidation

### Anthropic's Implementation

Anthropic's Dreams ([docs](https://platform.claude.com/docs/en/managed-agents/dreams)) are asynchronous jobs that consolidate memory:

- **Input**: 1 memory store + 1-100 session transcripts
- **Output**: A new, separate memory store (input never modified)
- **Process**: LLM reads all inputs → deduplicates, resolves contradictions, surfaces insights → writes reorganized output
- **Models**: `claude-opus-4-7` or `claude-sonnet-4-6`
- **Configurable instructions**: Up to 4,096 characters of guidance
- **Lifecycle**: `pending` → `running` → `completed`/`failed`/`canceled`
- **Async**: Runs as a background job, polled for status
- **Billing**: Standard token rates for the chosen model

### CareCompanion's Implementation

Our implementation (`src/dream.ts` + `src/dream_cli.ts`) replicates the same pipeline:

- **Input**: All memory stores + session traces from `traces/` directory (up to configurable max)
- **Output**: A new memory store (`memory/consolidated/`) — originals never modified
- **Process**: LLM reads existing memories + parsed transcripts → reorganizes → writes structured documents + clinical insights
- **Models**: Any backend (Gemma 4, Gemini, or Anthropic Claude)
- **Configurable instructions**: `--instructions` CLI parameter
- **Lifecycle**: Synchronous CLI execution (suitable for offline/cron)
- **Output format**: `--- DOCUMENT: path ---` blocks parsed into individual files

**Dream pipeline**:
```
1. Load all memory stores → existingContent
2. Load session transcripts (YAML frontmatter + conversation) → transcripts[]
3. Build consolidation prompt (memories + transcript summaries)
4. Call LLM with structured output instructions
5. Parse response into DOCUMENT blocks
6. Write to output memory store
7. Extract INSIGHTS section
8. Write dream journal
```

**Session trace format** (input to dreams):
```yaml
---
timestamp: "2026-05-14T09:00:00.000Z"
task: "Morning check-in and medication reminder."
outcome: success
turns: 16
model: "google/gemma-4-26b-a4b-it"
skills_loaded: ["daily-routine", "medication-reminder"]
memory_reads: 3
memory_writes: 2
---
# Session: Wednesday morning routine
## Turn 1
**User:** Morning check-in...
## Turn 2
**Assistant:** [tool_call: get_current_time({})]
...
```

**Dream output example** (real output from Gemma 4):
```
INSIGHTS:
- CONCERNING: Vitamin D3 missed 4 of 7 days; lab levels at 22 ng/mL (target >30)
- CONCERNING: Evening Metformin missed 3 of last 7 evenings
- TREND: Exercise progress — increasing arm circle reps despite osteoarthritis
- PATTERN: Afternoon loneliness (2-5 PM) is primary mood disruptor
```

### Functional Equivalence

| Feature | Anthropic | CareCompanion | Match |
|---------|-----------|---------------|-------|
| Input: memory store | 1 store (by ID) | All stores (filesystem scan) | CareCompanion reads all |
| Input: session transcripts | 1-100 sessions (by ID) | All traces in `traces/` (configurable max) | Equivalent |
| Output: new memory store | Separate store, input untouched | `memory/consolidated/`, inputs untouched | Equivalent |
| Deduplication | LLM-driven | LLM-driven (same prompt pattern) | Equivalent |
| Contradiction resolution | Prefer newer information | Prefer newer timestamps | Equivalent |
| Insight generation | Implicit in output | Explicit `--- INSIGHTS ---` section | Equivalent |
| Configurable instructions | `instructions` param (4096 chars) | `--instructions` CLI flag | Equivalent |
| Model selection | `claude-opus-4-7` / `claude-sonnet-4-6` | Any: gemma4 / gemini / anthropic | CareCompanion more flexible |
| Execution mode | Async cloud job (polled) | Synchronous CLI | Different (same result) |
| Dream journal | Implicit (session transcript visible) | Explicit `_dream_journal.md` | CareCompanion adds journal |
| Partial output on failure | Output store persists as-is | Not applicable (sync) | Different model |
| Cancellation | `dreams.cancel()` | Ctrl+C (sync process) | Different model |
| Max sessions | 100 | Configurable (`--max-transcripts`) | Equivalent |

**Key difference**: Anthropic runs dreams as async cloud jobs with lifecycle management (`pending`/`running`/`completed`/`failed`/`canceled`). CareCompanion runs dreams as synchronous CLI processes, suitable for cron jobs or manual execution. The core pipeline — LLM reading memories + transcripts and producing reorganized output — is functionally identical.

---

## Summary: What We Replicate vs. What's Anthropic-Only

### Fully Replicated (functional parity)

- Progressive skill disclosure (metadata → full instructions on-demand)
- Persistent memory stores with read/write/list/delete
- SHA256 versioning with optimistic concurrency control
- Access mode enforcement (read_write / read_only)
- System prompt injection of store metadata and instructions
- Offline dream consolidation (memory + transcripts → reorganized output)
- Configurable dream instructions
- Insight extraction from session history
- Multi-model support (Gemma 4, Gemini, Claude)

### Anthropic-Only (enterprise/cloud features)

- Cloud-hosted REST API with workspace scoping
- Async dream job lifecycle (pending/running/completed/failed/canceled)
- Version redaction for compliance (PII removal)
- Store archival
- Dream cancellation mid-flight
- Real-time event streaming of dream progress
- 30-day version retention policy
- Max 8 stores per session limit

### CareCompanion Additions (not in Anthropic)

- **Multi-backend architecture**: Same agent runs on Gemma 4, Gemini, or Claude
- **Dream journal**: Explicit `_dream_journal.md` documenting consolidation metadata
- **Health-specific dream prompting**: Clinical insight extraction (medication adherence, exercise patterns, mood correlations)
- **Session trace format**: Rich YAML frontmatter capturing skills loaded, memory operations, duration
- **Phone-native tool layer**: Notifications, alarms, calendar, checklists, TTS/STT

---

## Conclusion

CareCompanion demonstrates that the **core functional primitives** of Anthropic's managed agent infrastructure — Skills, Memory, and Dreams — can be fully replicated using open-weight models (Gemma 4 26B-A4B) without proprietary API access. The architectural patterns are identical: progressive disclosure for token efficiency, versioned persistent stores for longitudinal context, and LLM-driven offline consolidation for pattern discovery.

What Anthropic adds on top is **enterprise infrastructure**: cloud hosting, async job management, compliance features (redaction, archival), and lifecycle APIs. These are operational concerns, not capability gaps. The agent's ability to load skills on-demand, persist observations across sessions, and dream about past interactions to discover insights is fully achievable with open-weight models.
