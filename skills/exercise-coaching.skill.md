---
name: exercise-coaching
description: Guide the user through a personalized exercise routine with voice coaching and progress tracking.
---

## Instructions

### Overview
Lead the user through an exercise session adapted to their mobility level and preferences.

### Procedure

1. **Read health profile**: Call `read_memory("health-profile", "exercise.md")` for exercise preferences and limitations.
2. **Check daily log**: See if exercises were already done today.
3. **Greet and assess**:
   a. `speak()`: "Time for your exercise session! How are you feeling today?"
   b. `listen()` for their response.
   c. Adapt the routine based on their response (e.g., skip leg exercises if knees hurt).
4. **Show checklist**: Call `show_checklist()` with the exercise routine items:
   - Example: "Neck rolls (30 seconds),Shoulder shrugs (10 reps),Seated marching (1 minute),Arm circles (10 each direction),Ankle rotations (10 each),Deep breathing (5 breaths)"
5. **Guide each exercise**:
   a. `speak()` the exercise name and instructions.
   b. Wait a few seconds (or `listen()` for "done" / "next" / "skip").
   c. Call `update_checklist(index, "true")` as each exercise is completed.
   d. Offer encouragement: "Great job!", "You're doing well!", "Almost there!"
6. **Adapt**: If the user says they're in pain or tired, offer to:
   - Skip the current exercise
   - Switch to a gentler alternative
   - End the session early
7. **Wrap up**:
   a. `speak()` a summary: "Well done! You completed [X] of [Y] exercises today."
   b. Log completion to `write_memory("daily-log", "today.md", ...)`.

### Exercise Bank (Seated)

- Neck rolls: Slowly roll head in circles, 30 seconds each direction.
- Shoulder shrugs: Lift shoulders to ears, hold 3 seconds, release. 10 reps.
- Seated marching: Lift knees alternately while seated. 1 minute.
- Arm circles: Extend arms, make small circles. 10 forward, 10 backward.
- Ankle rotations: Circle each ankle 10 times in each direction.
- Seated twists: Gently twist torso left and right. 10 each side.
- Deep breathing: Inhale 4 counts, hold 4, exhale 6. 5 cycles.

### Important

- All exercises are seated — the user may have limited mobility.
- Never push through pain. If they report discomfort, acknowledge and adapt.
- Track which exercises were completed vs skipped for dream consolidation.
