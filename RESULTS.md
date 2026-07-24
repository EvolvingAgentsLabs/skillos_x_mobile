# Results

## Headline: progressive skill disclosure fires, but unreliably

The design uses Anthropic-style progressive disclosure — the system prompt lists skill *names and descriptions only*, and the model calls `load_skill(name)` to pull the full body when a task matches. The question is whether a model reliably makes that call on its own.

Across every recorded session in `traces/`, by model:

| Model | Arm | Sessions | Loaded ≥1 skill |
|---|---|---:|---:|
| `claude-sonnet-4-20250514` | baseline | 1 | 1 |
| `google/gemini-2.5-flash` | baseline | 1 | 1 |
| **`google/gemma-4-26b-a4b-it`** | baseline | **7** | **1** |
| `gemma4:12b` (local, ollama) | baseline | 2 | 0 |
| `gemma4:12b` (local, ollama) | instruction in task text | 1 | 1 |

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

**On putting the instruction in the task text — a retracted claim.** An earlier version of this document reported that adding *"before taking any action, call `load_skill` for each skill relevant to this task"* to the task made behaviour **worse**: that session produced a single prose reply and halted after one turn with zero memory reads. That happened, and it was n=1.

Re-running the identical arm produced the opposite: 6 turns, and both `daily-routine` and `medication-reminder` loaded. **The claim did not replicate and is withdrawn.** What it actually demonstrated was the same non-determinism as everything else here — measured once, in the direction that happened to confirm the story being told. Worth naming as a failure mode: the run that agreed with the narrative was published from a single sample.

The instruction arm now stands at 1/1 on `gemma4:12b`, which is not evidence that it helps either. It is one session.

**The actionable conclusion.** Every arm measured — two frontier models, a 26B MoE, a 12B dense, with and without an explicit instruction — is consistent with a single explanation: whether the model volunteers `load_skill` is a coin-flip whose bias varies by model. Nothing in this data supports steering it by prompt. The fix is to stop treating the first call as discretionary — constrain it with `tool_choice` on turn 1, or resolve skills host-side and inline the bodies. Both are unimplemented.

### Limits

n is small everywhere (1, 1, 7, 2, 1) and no arm has enough samples to estimate a rate with any precision; the 26B's 1/7 is the only cell where the sample says much. The 12B and 26B runs used different serving stacks (ollama vs OpenRouter), so "12B is worse than 26B" conflates size with stack and is **not** established — and the 12B instruction arm loading skills while the 26B baseline mostly did not should discourage reading any size ordering into this table at all. No control arm inlines skill bodies into the system prompt to measure what disclosure costs in task quality.

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

## The forced-call arm: it works, and that is the problem

Run 2026-07-24 against `gemma-4-31b-it` on Google AI Studio, which does honour
`tool_choice`. Three sessions per arm, identical task string.

| Arm | Session | Turns | Skills loaded | Memory reads |
|---|---:|---:|---:|---:|
| auto | 1 | 7 | 2 | 4 |
| auto | 2 | 1 | 0 | 0 |
| auto | 3 | 1 | 0 | 0 |
| **forced** | 1 | 2 | **4** | **0** |
| **forced** | 2 | 2 | **4** | **0** |
| **forced** | 3 | 2 | **4** | **0** |

Forcing the turn-1 call does exactly what it promises: **3/3 sessions load skills,
against 1/3 discretionary.** The sampling variance is gone.

**And the sessions are worse.** Every forced run halts after two turns having read
nothing and done nothing. The trace shows the model emitting `load_skill` over and
over — eight or more calls, including repeats of the same skill — consuming both turns
loading and never proceeding to the task. Removing the choice about *whether* to load a
skill appears to also remove the judgement about *when to stop loading*.

The only session that did real work is auto #1: seven turns, two skills, four memory
reads. It is also the only one that both loaded skills and then used them.

**So neither arm is the answer.** Discretionary loading is a coin flip, and two of the
three auto sessions did nothing at all — a single prose turn, worse than the local 12B,
which at least kept moving. Forced loading is reliable and inert. Skill loading
correlates with a productive session; *causing* it does not produce one.

What this rules out: "just force the call" as a fix. What it points at: forcing the call
**once**, with the tool removed or the choice released immediately afterwards, so the
model cannot spend the session in a loading loop. That variant has not been run.

### Earlier note, kept for the record

The conclusion above says to stop leaving turn 1 to sampling. That arm is now
implemented — `FORCE_SKILL_LOAD=1` passes
`tool_choice: {type: "function", function: {name: "load_skill"}}` on the first turn —
but **it has not produced a single data point, because ollama does not implement
`tool_choice`.**

Tested against ollama 0.31.2 with `gemma4:12b`, on a prompt with no natural reason to
call the tool:

| `tool_choice` sent | Tool call returned |
|---|---|
| `"required"` | none |
| `{"type":"function","function":{"name":"load_skill"}}` | none |

It accepts the parameter, returns HTTP 200, and ignores it. No error, no warning. A
run under `FORCE_SKILL_LOAD=1` against a local server would therefore look exactly
like the discretionary arm and quietly produce a meaningless comparison.

Running this needs a server that honours the parameter — OpenRouter does, for models
that support it. Until then the recommendation above is reasoning, not evidence.

## Open

- Run the forced-call arm against OpenRouter and measure whether downstream task
  quality improves. The code is in place; only a compatible endpoint is missing.
- Control arm: inline skill bodies into the system prompt, compare task completion against the disclosure arm.
- Separate model size from serving stack: run 12B through OpenRouter, or 26B locally.
- Does `gemma4:e4b` (the MoE variant, closer in shape to 26B-A4B) behave more like the 26B than the 12B dense?
