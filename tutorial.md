# CareCompanion Tutorial

## What is CareCompanion?

CareCompanion is a personal wellness assistant that runs on your phone. It helps adults manage daily health routines: medication reminders, exercise coaching, social connections, and overall wellbeing.

It is powered by **Gemma 4** (Google's open-source AI model) running via OpenRouter.

---

## Quick Start

```bash
# Install dependencies (first time only)
npm install

# Start interactive chat mode
npm run chat
```

Then open **http://localhost:9094** in your browser.

---

## How It Works

### 1. Starting a Session

When you run `npm run chat`, CareCompanion:
- Checks the current time and your calendar
- Reads your health profile from memory (medications, exercises, social contacts)
- Greets you and starts the wellness routine based on the time of day

### 2. Chatting

Type your message in the input field at the bottom and press **Enter** or click the **Send** button.

CareCompanion will:
- Ask how you're feeling
- Remind you about medications
- Guide you through exercises
- Help you stay connected with family

### 3. What You Can Say

Here are some examples of things you can tell CareCompanion:

| What you say | What happens |
|---|---|
| "I took my medications" | It logs that and moves to the next task |
| "My knees hurt today, about a 4" | It adapts the exercise plan to avoid knee stress |
| "Can you remind me at 2pm?" | It sets an alarm for you |
| "Has Sofia called?" | It checks your social schedule |
| "I'm feeling tired" | It suggests rest and adjusts the plan |
| "What's on my schedule?" | It reads your calendar |
| "Skip exercises today" | It respects your choice and moves on |

### 4. What You See in the UI

- **Chat bubbles** -- green (you) and blue (CareCompanion)
- **Notifications** -- medication reminders and alerts
- **Alarms** -- scheduled reminders shown as badges
- **Checklists** -- exercise steps you can track
- **"Thinking..." indicator** -- shows when the AI is processing

---

## Running Modes

| Command | Description |
|---|---|
| `npm run chat` | Interactive chat via browser (Gemma 4) |
| `npm run chat:gemini` | Interactive chat via browser (Gemini) |
| `npm run start:gemma4` | Automated demo with pre-scripted responses |
| `npm run start:stub` | Automated demo (default backend) |
| `npm run dream` | Run dream consolidation (offline memory reorganization) |

---

## Setting Up the Health Profile

CareCompanion reads from memory files in the `memory/` folder. You can customize these:

### memory/health-profile/

- **health-profile.md** -- Name, age, conditions, emergency contacts
- **medications.md** -- List of medications with dosages and schedules
- **exercise.md** -- Exercise preferences and limitations
- **social.md** -- Family and social contacts

### memory/daily-log/

Daily logs are created automatically by CareCompanion. Each session records:
- Medications taken
- Exercises completed
- Mood observations
- Pain levels

### Example: Editing the Health Profile

Open `memory/health-profile/health-profile.md` and customize:

```markdown
# Health Profile

- Name: [Your name]
- Age: [Age]
- Conditions: [e.g., Type 2 Diabetes, Hypertension]
- Mobility: [e.g., Knee arthritis, uses walker]
- Emergency contact: [Name, phone]
```

Open `memory/health-profile/medications.md`:

```markdown
# Medications

## Morning
- Lisinopril 10mg (blood pressure)
- Metformin 500mg (diabetes)
- Vitamin D3 1000IU

## Evening
- Metformin 500mg (diabetes)
```

---

## Adding Tasks and Reminders

You can ask CareCompanion directly:

- "Remind me to take my evening medication at 7pm"
- "Add a doctor's appointment on Monday"
- "Can you check on me after lunch?"

CareCompanion will set alarms and notifications on your phone.

---

## How the AI Learns (Dreams)

CareCompanion has a "dream" system that reviews past conversations and reorganizes what it knows about you:

```bash
npm run dream
```

This:
1. Reads all session transcripts from `traces/`
2. Identifies patterns (missed medications, recurring pain, mood trends)
3. Writes consolidated insights to `memory/consolidated/`
4. Flags concerning patterns for caregivers

Example dream insight:
> "Vitamin D3 missed 4 of 7 days -- lab levels at 22 ng/mL (target >30). Recommend discussing refill strategy with Miguel."

---

## For Caregivers / Family

### Checking Activity

Look at the `traces/` folder to see session logs -- each file shows what was discussed, medications confirmed, exercises completed.

### Customizing the Experience

1. Edit files in `memory/health-profile/` to update medical info
2. Add skills in `skills/` to teach CareCompanion new routines
3. Run `npm run dream` periodically to consolidate learning

### Understanding the Architecture

```
skillos_x_mobile/
  src/           -- Agent source code
  skills/        -- Skill definitions (daily-routine, exercise, etc.)
  memory/        -- Persistent memory stores
  traces/        -- Session transcripts
  sim/           -- Web UI
  video/         -- Demo video (HyperFrames)
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Disconnected" in UI | Make sure `npm run chat` is running in terminal |
| No response from agent | Check your `.env` has `OPENROUTER_API_KEY` set |
| Agent times out | The free tier has rate limits -- wait a moment and try again |
| Port already in use | Set `WS_PORT` and `HTTP_PORT` in `.env` |

---

## Environment Variables (.env)

```bash
OPENROUTER_API_KEY=sk-or-...   # Required: your OpenRouter API key
AGENT_BACKEND=gemma4            # Default backend (gemma4, gemini, anthropic)
WS_PORT=9093                    # WebSocket port
HTTP_PORT=9094                  # Web UI port
MEMORY_DIR=./memory             # Memory stores location
TRACES_DIR=./traces             # Session traces location
```
