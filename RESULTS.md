# Results

## Headline: progressive skill disclosure fires, but unreliably

The design uses Anthropic-style progressive disclosure — the system prompt lists skill *names and descriptions only*, and the model calls `load_skill(name)` to pull the full body when a task matches. The question is whether a model reliably makes that call on its own.

Across every recorded session in `traces/`, by model:

| Model | Sessions | Loaded ≥1 skill | Rate |
|---|---:|---:|---:|
| `claude-sonnet-4-20250514` | 1 | 1 | 1/1 |
| `google/gemini-2.5-flash` | 1 | 1 | 1/1 |
| **`google/gemma-4-26b-a4b-it`** | **7** | **1** | **1/7** |
| `gemma4:12b` (local, ollama) | 3 | 0 | 0/3 |

**The Gemma 26B result is the finding.** All seven sessions ran the *identical* task string. The one that loaded skills (2026-05-13, 19 turns, `["daily-routine", "medication-reminder"]`) and one that did not (2026-05-17, 14 turns) open with the same tool sequence — `get_current_time → read_memory → read_memory` — and diverge only at the fourth call. Same model, same prompt, same scaffold: **the difference is sampling.**

So the honest statement is not "progressive disclosure works on open weights" and not "it fails." It is:

> On Gemma 4 26B-A4B, whether the model volunteers a `load_skill` call is non-deterministic, and it declined in 6 of 7 identical sessions. The mechanism is sound — when it fires, it works — but leaving the call to the model's discretion is not dependable at this scale.

**What the model does instead.** It goes straight to raw data and never consults the skill. Session 2026-07-24 (12 turns, `gemma4:12b`):

```
get_current_time → read_memory(health-profile/profile.md)
                 → list_memories(health-profile)
                 → get_calendar_events(...)
                 → read_memory(medications.md) → read_memory(exercise.md)
                 → read_memory(social.md) → get_current_time
```

Seven well-formed calls; function calling itself is not the problem. The model treats the memory store as the source of truth and never asks what the *procedure* is.

**Instructing it harder makes it worse.** One session put the directive in the task text verbatim — *"before taking any action, call `load_skill` for each skill relevant to this task"*. The model did not comply and degraded: a single prose reply, halt after one turn, zero memory reads. (`grep -c "tool_call: load_skill"` on that trace returns 0; the three textual matches are the instruction echoed in frontmatter, header and user turn.)

**The actionable conclusion.** The fix is not prompt engineering — that arm was run and lost. It is to stop treating the first `load_skill` as discretionary: constrain it with `tool_choice` on turn 1, or resolve the relevant skills host-side and inline their bodies. Both are unimplemented.

### Limits

n is small per model (1, 1, 7, 3). The 12B and 26B runs used different serving stacks (ollama vs OpenRouter), so "12B is worse than 26B" conflates size with stack and is not established. No control arm inlines skill bodies into the system prompt to measure what disclosure actually costs in task quality — that is the obvious next experiment and has not been run.

## What was fixed to get here

Two defects were found while making the runs reproducible, and both had been corrupting the record:

1. **`AGENT_MODEL` was ignored.** `createBackend` passed the hard-coded slug `google/gemma-4-26b-a4b-it` as an explicit override, which beat the environment variable. Pointed at a local server that has never heard of that slug, every turn 404'd — and the session still wrote a trace showing `turns: 1`, `skills_loaded: []`, `memory_reads: 0`. That failure mode is indistinguishable, in the trace, from a model that simply did nothing.

2. **Hand-authored fixtures were indistinguishable from recordings.** Six traces were written by hand as demo seed data. They carry placeholder tool-result hashes — `"sha256":"abc123"`, `"abc"`, `"jkl"`, `"stu"` — against the 64-character digests real runs produce. They now declare `provenance: handwritten`, and `SessionTraceRecorder.loadTranscripts` returns only `provenance: recorded` traces, logging how many it skipped.

That second defect matters more than it looks. The earlier dream run consolidated nine transcripts, six of which were those fixtures — including one containing a literal `## KEY INSIGHT` block spelling out the mood→adherence chain, and a "Vitamin D 22 ng/mL" figure that already sits verbatim in the seed file `memory/health-profile/medications.md:27`. **The consolidation restated its own input.** Any claim that that run constituted a discovery is withdrawn.

## Reproducing

```bash
ollama serve && ollama pull gemma4:12b

export OPENROUTER_BASE_URL=http://localhost:11434/v1
export OPENROUTER_API_KEY=ollama-local   # unused by ollama; the client wants a value
export AGENT_MODEL=gemma4:12b

npm install
npx tsx src/main.ts --stub --backend gemma4 --task "Good morning! Please help me with my daily wellness routine."
```

Roughly 6–8 minutes per session on an M-series Mac. The trace lands in `traces/` with `provenance: recorded`.

To reproduce the 26B arm, drop `OPENROUTER_BASE_URL`, set a real `OPENROUTER_API_KEY`, and `AGENT_MODEL=google/gemma-4-26b-a4b-it`. Expect to run it several times — that is the point.

## Open

- Force the turn-1 `load_skill` with `tool_choice` and measure whether downstream task quality improves. This is the experiment the result above points at.
- Control arm: inline skill bodies into the system prompt, compare task completion against the disclosure arm.
- Separate model size from serving stack: run 12B through OpenRouter, or 26B locally.
- Does `gemma4:e4b` (the MoE variant, closer in shape to 26B-A4B) behave more like the 26B than the 12B dense?
