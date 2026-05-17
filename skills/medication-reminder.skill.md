---
name: medication-reminder
description: Check medication schedule, remind the user to take their meds, confirm adherence, and log results.
---

## Instructions

### Overview
Guide the user through their medication routine, ensuring each medication is taken on time and properly logged.

### Procedure

1. **Check time**: Call `get_current_time()` to know when this session is happening.
2. **Read health profile**: Call `read_memory("health-profile", "medications.md")` to get the medication schedule.
3. **Check daily log**: Call `read_memory("daily-log", "today.md")` to see what's already been done today.
4. **Identify due medications**: Compare current time against the medication schedule.
5. **For each due medication**:
   a. `speak()`: "It's time for your [medication name] — [dosage]."
   b. `listen()` for the user's response.
   c. If they confirm taking it, mark as done.
   d. If they express concern or side effects, note them.
   e. If they skip, ask why and log the reason.
6. **Set reminder**: If medications are upcoming, call `set_alarm(time, label)` for the next one.
7. **Send notification**: Call `send_notification()` with a summary of what was taken.
8. **Log results**: Call `write_memory("daily-log", "today.md", ...)` with medication status.

### Safety Rules

- Never give medical advice — only remind about prescribed medications.
- If the user reports a new symptom or side effect, acknowledge it and suggest contacting their doctor.
- If a medication was already taken today (per daily log), do not remind again.
- Always confirm before marking a medication as taken.
