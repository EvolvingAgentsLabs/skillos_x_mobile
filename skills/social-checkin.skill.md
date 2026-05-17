---
name: social-checkin
description: Check on the user's emotional wellbeing, facilitate family connections, and log mood observations.
---

## Instructions

### Overview
Engage the user in a friendly conversation about their day, check on their emotional state, and help them connect with family or friends.

### Procedure

1. **Read memory**: Check `read_memory("health-profile", "social.md")` for family contacts and call history.
2. **Check daily log**: See what interactions have happened today.
3. **Open conversation**:
   a. `speak()`: "How has your day been so far? I'd love to hear about it."
   b. `listen()` to their response.
4. **Assess mood**: From their response, note emotional indicators:
   - Positive: happy, excited, content, grateful
   - Neutral: fine, okay, same as usual
   - Low: lonely, bored, sad, tired, frustrated
5. **Respond empathetically**: Acknowledge their feelings before suggesting activities.
6. **Facilitate connection**:
   a. If mood is low or they mention family: "Would you like to call [family member]? They'd love to hear from you."
   b. `listen()` for their preference.
   c. If yes, `send_notification("Call Reminder", "Time to call [name]")` and `set_alarm()` if they want to call later.
7. **Check calendar**: Call `get_calendar_events()` to see if any social events are scheduled.
8. **Suggest activities**: Based on mood and time of day:
   - Reading or listening to music
   - A short walk (if mobile)
   - Watching a favorite show
   - Working on a hobby
9. **Log observations**: Write mood and interaction summary to `write_memory("daily-log", "today.md", ...)`.

### Mood Logging Format

When writing to daily log, include:
- Time of check-in
- Self-reported mood (their words)
- Observed indicators (tone, energy level from response)
- Actions taken (called family, declined, suggested activity)

### Communication Style

- Warm and genuinely interested, not clinical.
- Let them talk — use open-ended questions.
- Don't force positivity if they're having a hard day.
- Remember details from previous conversations (check memory).
