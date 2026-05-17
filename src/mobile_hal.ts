// src/mobile_hal.ts
// Mobile Hardware Abstraction Layer for skillos_x_mobile.
// Replaces the physical robot HAL with phone-native capabilities:
// notifications, alarms, time, calendar, checklists, TTS, and STT.

import type { TimeInfo, Notification, Alarm, CalendarEvent, ChecklistItem } from './types';
import type { IOAdapter } from './io';

// ── MobileHAL Interface ────────────────────────────────────────

export interface MobileHAL {
  get_current_time(): Promise<TimeInfo>;
  send_notification(title: string, body: string): Promise<Notification>;
  set_alarm(time: string, label: string): Promise<Alarm>;
  get_alarms(): Promise<Alarm[]>;
  cancel_alarm(id: string): Promise<{ ok: true } | { error: string }>;
  get_calendar_events(date?: string): Promise<CalendarEvent[]>;
  show_checklist(items: string[]): Promise<{ items: ChecklistItem[] }>;
  update_checklist(index: number, done: boolean): Promise<{ items: ChecklistItem[] }>;
  speak(text: string): Promise<{ ok: true }>;
  listen(): Promise<{ text: string }>;
}

// ── StubMobileHAL ──────────────────────────────────────────────
// Simulates a phone environment for testing.

export class StubMobileHAL implements MobileHAL {
  private io: IOAdapter;
  private notifications: Notification[] = [];
  private alarms: Alarm[] = [];
  private checklist: ChecklistItem[] = [];
  private calendarEvents: CalendarEvent[];
  private notifCounter = 0;
  private alarmCounter = 0;

  constructor(io: IOAdapter, calendarEvents?: CalendarEvent[]) {
    this.io = io;
    this.calendarEvents = calendarEvents ?? [
      {
        id: 'cal-1',
        title: 'Morning Medication',
        start: todayAt(8, 0),
        end: todayAt(8, 15),
        location: 'Home',
      },
      {
        id: 'cal-2',
        title: 'Seated Exercise Session',
        start: todayAt(10, 0),
        end: todayAt(10, 30),
        location: 'Living Room',
      },
      {
        id: 'cal-3',
        title: 'Video Call with Daughter',
        start: todayAt(12, 0),
        end: todayAt(12, 30),
      },
      {
        id: 'cal-4',
        title: 'Afternoon Medication',
        start: todayAt(14, 0),
        end: todayAt(14, 15),
        location: 'Home',
      },
    ];
  }

  async get_current_time(): Promise<TimeInfo> {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
      iso: now.toISOString(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      dayOfWeek: days[now.getDay()],
      date: now.toISOString().slice(0, 10),
    };
  }

  async send_notification(title: string, body: string): Promise<Notification> {
    this.notifCounter++;
    const notif: Notification = {
      id: `notif-${this.notifCounter}`,
      title,
      body,
      sentAt: new Date().toISOString(),
    };
    this.notifications.push(notif);
    console.log(`  [mobile] NOTIFICATION: "${title}" — ${body}`);
    return notif;
  }

  async set_alarm(time: string, label: string): Promise<Alarm> {
    this.alarmCounter++;
    const alarm: Alarm = {
      id: `alarm-${this.alarmCounter}`,
      time,
      label,
      active: true,
    };
    this.alarms.push(alarm);
    console.log(`  [mobile] ALARM SET: ${time} — "${label}"`);
    return alarm;
  }

  async get_alarms(): Promise<Alarm[]> {
    return [...this.alarms];
  }

  async cancel_alarm(id: string): Promise<{ ok: true } | { error: string }> {
    const alarm = this.alarms.find(a => a.id === id);
    if (!alarm) return { error: `Alarm not found: ${id}` };
    alarm.active = false;
    console.log(`  [mobile] ALARM CANCELLED: ${id}`);
    return { ok: true };
  }

  async get_calendar_events(date?: string): Promise<CalendarEvent[]> {
    if (!date) return this.calendarEvents;
    return this.calendarEvents.filter(e => e.start.startsWith(date));
  }

  async show_checklist(items: string[]): Promise<{ items: ChecklistItem[] }> {
    this.checklist = items.map(text => ({ text, done: false }));
    console.log(`  [mobile] CHECKLIST:${this.checklist.map((c, i) => `\n    ${i}. [ ] ${c.text}`).join('')}`);
    return { items: [...this.checklist] };
  }

  async update_checklist(index: number, done: boolean): Promise<{ items: ChecklistItem[] }> {
    if (index >= 0 && index < this.checklist.length) {
      this.checklist[index].done = done;
      const mark = done ? 'x' : ' ';
      console.log(`  [mobile] CHECKLIST UPDATE: [${mark}] ${this.checklist[index].text}`);
    }
    return { items: [...this.checklist] };
  }

  async speak(text: string): Promise<{ ok: true }> {
    await this.io.speak(text);
    return { ok: true };
  }

  async listen(): Promise<{ text: string }> {
    const text = await this.io.listen();
    return { text };
  }
}

// ── Helpers ────────────────────────────────────────────────────

function todayAt(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
