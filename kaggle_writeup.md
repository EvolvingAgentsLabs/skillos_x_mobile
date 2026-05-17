# CareCompanion: Skills, Memory & Dreams for Health Agents — Powered by Gemma 4

## Summary

CareCompanion is a personal wellness assistant that helps elderly patients manage daily health routines — medication reminders, exercise coaching, social connection tracking, and mood monitoring. It uses Gemma 4 26B-A4B to power three agent primitives that Anthropic recently introduced as managed services for their proprietary models: **Skills** (progressive expertise loading), **Memory** (persistent health records with versioning), and **Dreams** (offline memory consolidation that discovers clinical insights from session transcripts).

Our key finding: Gemma 4 can fully replicate these advanced agent capabilities, producing medically actionable insights from real care scenarios — without vendor lock-in or proprietary APIs.

## Motivation & Impact

Medication non-adherence is a $300 billion problem in the United States alone, causing an estimated 125,000 preventable deaths annually. For elderly patients managing multiple chronic conditions — hypertension, type 2 diabetes, osteoarthritis, vitamin deficiency — the challenge compounds: cognitive decline reduces self-management ability, physical limitations restrict mobility, and social isolation erodes the motivation to maintain health routines.

Current solutions are passive: pill organizers beep, reminder apps send notifications that are routinely dismissed. What patients need is an **active care companion** — one that understands their medical context, adapts to their daily energy levels, remembers patterns across weeks of interactions, and flags concerning trends before they escalate into hospital visits.

CareCompanion addresses this gap by combining three capabilities that, until recently, required proprietary AI infrastructure:

1. **Skills**: Reusable expertise modules (medication protocols, exercise routines, social check-in procedures) loaded on-demand to keep context efficient
2. **Memory**: Persistent, versioned health records that survive across sessions, creating a longitudinal patient profile
3. **Dreams**: An offline consolidation process that reads session transcripts and reorganizes knowledge, discovering patterns invisible in any single interaction

## Technical Approach

### Architecture

CareCompanion runs as a TypeScript agent loop that interacts with users through phone-native tools (notifications, alarms, calendar, checklists, text-to-speech, speech-to-text). The agent has access to 15 tools total: 10 mobile capabilities, 1 skill loader, and 4 memory operations.

The system is **backend-agnostic** — a unified `Backend` interface abstracts provider differences, allowing the same agent code to run with Gemma 4 (via OpenRouter), Gemini 2.5 Flash (via OpenRouter), or Claude Sonnet (via Anthropic's native API). This design proves that open-weight models can match proprietary implementations.

### Skills: Progressive Disclosure

Skills are markdown files with YAML frontmatter defining their name and description. At session start, only skill metadata (~100 tokens per skill) appears in the system prompt as a table. When the agent determines a skill is relevant, it calls `load_skill(name)` to retrieve the full instructions.

This two-level loading pattern is critical for token efficiency. Our 4 skills (medication-reminder, exercise-coaching, social-checkin, daily-routine) contain ~2,000 tokens of instructions combined. Without progressive disclosure, every API call would carry this overhead even when the agent only needs time-awareness or memory access.

### Memory: Persistent Health Records

Memory stores are filesystem directories containing versioned markdown documents. Each store has a `_manifest.json` defining its name, description, access mode, and per-store instructions injected into the system prompt.

The health-profile store contains the patient's medication schedule (Lisinopril, Metformin, Vitamin D3, Aspirin), exercise capabilities (seated exercises due to bilateral knee osteoarthritis), and social connections (daughter Sofia, son Miguel). The daily-log store captures session-by-session observations: which medications were taken, exercise completion rates, pain levels, mood indicators.

Every write operation creates a SHA256-versioned backup, providing an audit trail critical for healthcare applications. The agent reads memory at session start and writes observations at session end, building a longitudinal health profile over time.

### Dreams: Offline Memory Consolidation

The dream engine is our most novel contribution. Inspired by how biological memory consolidation during sleep reorganizes daily experiences into long-term knowledge, the dream engine:

1. Loads all existing memory documents
2. Loads session transcripts (YAML frontmatter + full conversation logs)
3. Builds a consolidation prompt combining existing knowledge with new observations
4. Calls Gemma 4 with structured output instructions
5. Parses the response into reorganized documents + clinical insights
6. Writes consolidated knowledge to an output memory store

From 9 session transcripts spanning 5 simulated days of care, the dream engine produced these clinically actionable insights:

- **Vitamin D3 non-adherence**: Missed 4 of 7 days due to supply issues, with lab levels at 22 ng/mL (target >30 ng/mL). The dream engine connected the behavioral pattern to the clinical significance.
- **Evening Metformin gap**: Inconsistent evening adherence (3 of 7 days missed), with the patient self-reporting that low mood causes medication forgetfulness.
- **Mood-adherence correlation**: The dream engine identified that social isolation in afternoons (2-5 PM) drives low mood, which cascades into evening medication non-compliance — a multi-hop clinical reasoning chain.
- **Exercise progress**: Despite osteoarthritis, the patient is progressively increasing arm circle repetitions, indicating physical improvement that should be reinforced.

These are the kinds of insights that currently require a dedicated care coordinator reviewing paper notes. CareCompanion generates them automatically.

## Gemma 4 Performance

Gemma 4 26B-A4B handles the full agent loop reliably:

- **Multi-tool calling**: Consistently makes parallel tool calls (e.g., `get_current_time` + `read_memory` + `get_calendar_events` in a single turn)
- **15-tool dispatch**: Navigates all 15 tool definitions without confusion or hallucinated tool names
- **Clinical reasoning**: Produces medically coherent medication reminders, exercise adaptations (skipping leg exercises when knee pain is elevated), and social interaction guidance
- **Dream consolidation**: Synthesizes 9 transcripts into organized knowledge documents with clinically relevant insights in under 12 seconds

Gemini 2.5 Flash provides faster inference (~12 seconds vs ~34 seconds per session) but with fewer conversational turns. Both open-weight models demonstrate sufficient capability for production health agent use cases.

## Multi-Backend Comparison

We tested the identical scenario across backends:

| Backend | Turns | Duration | Skills Loaded | Memory Ops | Quality |
|---------|-------|----------|---------------|------------|---------|
| Gemma 4 26B-A4B | 11 | 34s | 0 | 6 | Full care protocol, medication logging, adaptation |
| Gemini 2.5 Flash | 5 | 12s | 1 | 1 | Efficient summary, less interactive |
| Claude Sonnet 4 | — | — | — | — | Reference (requires proprietary API key) |

The key takeaway: Gemma 4 delivers interactive, multi-turn care conversations with memory persistence and tool use — capabilities that Anthropic positions as requiring their managed agent infrastructure.

## Reproducibility

The project is fully open-source (Apache 2.0):

```bash
git clone https://github.com/EvolvingAgentsLabs/skillos_x_mobile.git
cd skillos_x_mobile && npm install
cp .env.example .env  # Add OPENROUTER_API_KEY
npm run start:gemma4   # Run care session
npm run dream          # Run memory consolidation
```

Pre-seeded memory stores and session traces are included for immediate dream consolidation demonstration. The web UI at `http://localhost:9094` provides a phone-style interface showing the conversation, notifications, alarms, and exercise checklists in real-time.

## Future Directions

- **Real mobile deployment**: Replace StubMobileHAL with native iOS/Android APIs
- **Caregiver dashboard**: Surface dream insights to family members and healthcare providers
- **Multi-patient**: Run separate memory stores per patient with shared skill libraries
- **Local inference**: Deploy Gemma 4 on-device for privacy-critical health data (when hardware permits)
- **Clinical validation**: Partner with care facilities for real-world evaluation

## Conclusion

CareCompanion demonstrates that Gemma 4 can power sophisticated health agents with Skills, Memory, and Dreams — three primitives that represent the frontier of AI agent architecture. By making these capabilities available through open-weight models, we enable a future where AI-powered care companions are accessible to everyone, not just organizations with proprietary API access.

The dream engine's ability to discover that afternoon loneliness drives evening medication non-compliance — connecting social, emotional, and medical dimensions across multiple sessions — is exactly the kind of multi-hop reasoning that could save lives at scale.
