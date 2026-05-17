---
name: daily-routine
description: Orchestrate the full daily wellness routine — check schedule, sequence care activities, and provide a daily summary.
---

## Instructions

### Overview
The master routine skill that coordinates all other care activities based on time of day and the user's schedule.

### Procedure

1. **Check time**: Call `get_current_time()`.
2. **Check calendar**: Call `get_calendar_events()` to see today's schedule.
3. **Read daily log**: Call `read_memory("daily-log", "today.md")` to see what's been done.
4. **Determine priorities** based on time:

   **Morning (6:00-10:00)**:
   - Greet warmly: "Good morning! Let's review your day."
   - Check morning medications (load medication-reminder skill)
   - Review today's calendar
   - Set reminders for upcoming events

   **Midday (10:00-14:00)**:
   - Exercise session if not done (load exercise-coaching skill)
   - Social check-in (load social-checkin skill)
   - Midday medication check if applicable

   **Afternoon (14:00-18:00)**:
   - Afternoon medication check
   - Activity suggestions
   - Social check-in if not done

   **Evening (18:00-22:00)**:
   - Evening medication check
   - Daily summary and tomorrow's preview
   - Set morning alarms

5. **Sequence activities**: Present the plan to the user:
   a. `speak()`: "Based on your schedule, here's what we should do: [list]."
   b. `listen()` for their input — they may want to skip or reorder.
6. **Execute each activity** by loading the appropriate skill.
7. **Daily summary**: At the end of the session:
   a. Summarize what was accomplished.
   b. Note anything that was skipped.
   c. Write comprehensive daily log to memory.

### Important

- Respect the user's autonomy — suggest, don't command.
- If they want to skip something, accept gracefully.
- Adapt to their energy level throughout the day.
- Always end on a positive note with encouragement.
