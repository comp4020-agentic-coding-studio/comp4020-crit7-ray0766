// A session is one teaching semester, written 'YYYY-S1' or 'YYYY-S2'. The
// string form sorts in calendar order, which is what "earlier than" means for
// requisites, so nothing here parses dates.

const SESSION = /^(\d{4})-S([12])$/;

export function isSession(value: string): boolean {
  return SESSION.test(value);
}

export function nextSession(session: string): string {
  const match = session.match(SESSION);
  if (!match) throw new Error(`not a session: ${session}`);
  const year = Number(match[1]);
  return match[2] === "1" ? `${year}-S2` : `${year + 1}-S1`;
}

/** The `count` sessions a plan covers, starting at `start`. */
export function planSessions(start: string, count: number): string[] {
  const sessions = [start];
  while (sessions.length < count) sessions.push(nextSession(sessions[sessions.length - 1]!));
  return sessions;
}

/** 'Semester 1, 2026' — the wording Programs & Courses uses. */
export function labelSession(session: string): string {
  const match = session.match(SESSION);
  if (!match) return session;
  return `Semester ${match[2]}, ${match[1]}`;
}

/** 'S1' | 'S2' — which half of the year a session is, for offering lookups. */
export function semesterOf(session: string): "S1" | "S2" {
  const match = session.match(SESSION);
  if (!match) throw new Error(`not a session: ${session}`);
  return match[2] === "1" ? "S1" : "S2";
}

/** The session a date falls in: February–June is Semester 1, July–January
 *  Semester 2 (breaks count with the semester they follow, so January is
 *  still the previous year's Semester 2). A session before this one is over,
 *  which is all "done" means here. */
export function currentSession(date: Date): string {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month === 1) return `${year - 1}-S2`;
  return `${year}-${month <= 6 ? "S1" : "S2"}`;
}
