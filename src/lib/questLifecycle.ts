import { format, isSameDay, startOfDay } from 'date-fns';
import { Quest, Recurrence } from '@/types';

export function isValidTimestamp(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

export function getStartOfDayMs(dateOrMs: Date | number = Date.now()): number {
  return startOfDay(typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs).getTime();
}

export function getEndOfDayMs(dateOrMs: Date | number = Date.now()): number {
  const d = new Date(typeof dateOrMs === 'number' ? dateOrMs : dateOrMs.getTime());
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function getStartOfTomorrowMs(now: number = Date.now()): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isDueTodayOrEarlier(dueDate: number, now: number = Date.now()): boolean {
  return dueDate <= getEndOfDayMs(now);
}

/**
 * Active = uncompleted non-habit quest that either has no dueDate or is due today or earlier.
 */
export function isQuestActive(quest: Quest, now: number = Date.now()): boolean {
  if (quest.type === 'habit' || quest.completed) return false;
  if (!isValidTimestamp(quest.dueDate)) return true;
  return isDueTodayOrEarlier(quest.dueDate, now);
}

/**
 * Planned (Geplant) = uncompleted non-habit quest with a dueDate strictly after today.
 */
export function isQuestPlanned(quest: Quest, now: number = Date.now()): boolean {
  if (quest.type === 'habit' || quest.completed) return false;
  if (!isValidTimestamp(quest.dueDate)) return false;
  return !isDueTodayOrEarlier(quest.dueDate, now);
}

/**
 * History (Verlauf) = completed or auto-failed non-habit quest.
 */
export function isQuestHistory(quest: Quest): boolean {
  return quest.type !== 'habit' && Boolean(quest.completed);
}

/**
 * A quest is auto-failed when a new calendar day starts and it was due before today 00:00:00.
 */
export function isQuestOverdueForAutoFail(quest: Quest, now: number = Date.now()): boolean {
  if (quest.type === 'habit' || quest.completed) return false;
  if (!isValidTimestamp(quest.dueDate)) return false;
  return quest.dueDate < getStartOfDayMs(now);
}

/**
 * UI badge "Überfällig":
 * - Timed quests (`hasTime === true`): overdue as soon as `dueDate < now`
 * - Untimed quests (`hasTime !== true`): overdue only if due before today 00:00:00
 */
export function isQuestOverdueBadge(quest: Quest, now: number = Date.now()): boolean {
  if (quest.completed || !isValidTimestamp(quest.dueDate)) return false;
  if (quest.hasTime) return quest.dueDate < now;
  return quest.dueDate < getStartOfDayMs(now);
}

export function normalizeQuestTitle(title: string): string {
  return (title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function sanitizeIdSegment(raw: string): string {
  const cleaned = (raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return cleaned || 'series';
}

/**
 * Extracts or resolves the root recurring series identifier for a quest.
 */
export function getQuestSeriesId(quest: Pick<Quest, 'id' | 'seriesId'>): string {
  if (quest.seriesId && typeof quest.seriesId === 'string' && quest.seriesId.trim()) {
    return sanitizeIdSegment(quest.seriesId.trim());
  }
  const match = quest.id.match(/^rec_(.+)_\d{8}(?:_\d+)?$/);
  if (match && match[1]) {
    return sanitizeIdSegment(match[1]);
  }
  return sanitizeIdSegment(quest.id);
}

/**
 * Fallback semantic key used to detect duplicates among legacy recurring quests lacking `seriesId`.
 */
export function getSemanticRecurringKey(
  quest: Pick<Quest, 'title' | 'skill' | 'recurrence' | 'recurrenceDays'>
): string {
  const days =
    Array.isArray(quest.recurrenceDays) && quest.recurrenceDays.length > 0
      ? [...quest.recurrenceDays].sort((a, b) => a - b).join(',')
      : '';
  return `${normalizeQuestTitle(quest.title)}::${quest.skill}::${quest.recurrence || 'none'}::${days}`;
}

export function buildDeterministicRecurringId(seriesId: string, targetDueDate: number): string {
  const dayKey = format(new Date(targetDueDate), 'yyyyMMdd');
  return `rec_${sanitizeIdSegment(seriesId)}_${dayKey}`;
}

export function computeSingleNextRecurrence(
  baseTimestamp: number,
  recurrence: 'daily' | 'weekly' | 'monthly',
  recurrenceDays?: number[]
): number {
  const base = new Date(baseTimestamp);

  if (recurrence === 'daily') {
    const next = new Date(base);
    next.setDate(next.getDate() + 1);
    return next.getTime();
  }

  if (recurrence === 'weekly') {
    if (recurrenceDays && recurrenceDays.length > 0) {
      const validDays = recurrenceDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      if (validDays.length > 0) {
        for (let i = 1; i <= 7; i++) {
          const nextDate = new Date(base);
          nextDate.setDate(base.getDate() + i);
          if (validDays.includes(nextDate.getDay())) {
            return nextDate.getTime();
          }
        }
      }
    }
    const fallback = new Date(base);
    fallback.setDate(fallback.getDate() + 7);
    return fallback.getTime();
  }

  // monthly
  if (recurrenceDays && recurrenceDays.length > 0) {
    const sortedDays = [...recurrenceDays]
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 31)
      .sort((a, b) => a - b);
    if (sortedDays.length > 0) {
      for (let i = 0; i <= 12; i++) {
        const monthStart = new Date(
          base.getFullYear(),
          base.getMonth() + i,
          1,
          base.getHours(),
          base.getMinutes(),
          base.getSeconds(),
          base.getMilliseconds()
        );
        const lastDayOfMonth = new Date(
          monthStart.getFullYear(),
          monthStart.getMonth() + 1,
          0
        ).getDate();
        for (const day of sortedDays) {
          const candidate = new Date(monthStart);
          candidate.setDate(Math.min(day, lastDayOfMonth));
          if (candidate.getTime() > base.getTime()) {
            return candidate.getTime();
          }
        }
      }
    }
  }

  const nextMonth = new Date(base);
  const targetDay = base.getDate();
  nextMonth.setDate(1);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  nextMonth.setDate(Math.min(targetDay, lastDay));
  return nextMonth.getTime();
}

export function getNextRecurrenceTimestamp(
  baseTimestamp: number,
  recurrence: 'daily' | 'weekly' | 'monthly',
  recurrenceDays?: number[],
  minTimestamp?: number
): number {
  let nextTs = computeSingleNextRecurrence(baseTimestamp, recurrence, recurrenceDays);
  if (minTimestamp !== undefined) {
    let safety = 0;
    while (nextTs < minTimestamp && safety < 1000) {
      const advanced = computeSingleNextRecurrence(nextTs, recurrence, recurrenceDays);
      if (advanced <= nextTs) break;
      nextTs = advanced;
      safety++;
    }
  }
  return nextTs;
}

/**
 * Normalizes the time component of a dueDate:
 * - Untimed quests always sit at 23:59:59.999 of their calendar day
 * - Timed quests preserve their HH:mm:00.000
 */
export function normalizeDueDateTime(targetTimestamp: number, hasTime?: boolean): number {
  const d = new Date(targetTimestamp);
  if (!hasTime) {
    d.setHours(23, 59, 59, 999);
  }
  return d.getTime();
}

/**
 * When a user creates a recurring quest without selecting a dueDate,
 * automatically picks today (if today matches the recurrence schedule) or the next matching day.
 */
export function getInitialDueDateForRecurringQuest(
  recurrence: Recurrence | undefined,
  recurrenceDays?: number[],
  now: number = Date.now()
): number | undefined {
  if (!recurrence || recurrence === 'none') return undefined;
  const todayEnd = getEndOfDayMs(now);
  const todayDate = new Date(todayEnd);

  if (recurrence === 'daily') {
    return todayEnd;
  }

  if (recurrence === 'weekly') {
    if (!recurrenceDays || recurrenceDays.length === 0) return todayEnd;
    if (recurrenceDays.includes(todayDate.getDay())) return todayEnd;
    return computeSingleNextRecurrence(todayEnd, 'weekly', recurrenceDays);
  }

  // monthly
  if (!recurrenceDays || recurrenceDays.length === 0) return todayEnd;
  const lastDay = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  const matchesToday = recurrenceDays.some((day) => Math.min(day, lastDay) === todayDate.getDate());
  if (matchesToday) return todayEnd;
  return computeSingleNextRecurrence(todayEnd, 'monthly', recurrenceDays);
}

/**
 * Checks if an open (uncompleted) quest already exists in the same recurring series
 * or represents the same active/same-day legacy quest.
 */
export function hasOpenRecurringSibling(
  sourceQuest: Quest,
  allQuests: Quest[],
  targetDueDate: number,
  now: number = Date.now()
): boolean {
  const sourceSeriesId = getQuestSeriesId(sourceQuest);
  const sourceSemanticKey = getSemanticRecurringKey(sourceQuest);

  return allQuests.some((other) => {
    if (other.id === sourceQuest.id) return false;
    if (other.completed || other.type === 'habit') return false;
    if (!other.recurrence || other.recurrence === 'none') return false;

    // 1. Same explicit or deterministic series
    const otherSeriesId = getQuestSeriesId(other);
    if (
      (sourceQuest.seriesId || sourceQuest.id.startsWith('rec_')) &&
      (other.seriesId || other.id.startsWith('rec_')) &&
      otherSeriesId === sourceSeriesId
    ) {
      return true;
    }
    if (sourceQuest.seriesId && other.id === sourceQuest.seriesId) return true;
    if (other.seriesId && sourceQuest.id === other.seriesId) return true;

    // 2. Semantic fallback for legacy quests or identical recurring series
    if (getSemanticRecurringKey(other) !== sourceSemanticKey) return false;

    // If neither has a specific dueDate, or both target Active (today/earlier), or same calendar day -> duplicate!
    if (!isValidTimestamp(other.dueDate)) return true;
    if (isSameDay(new Date(other.dueDate), new Date(targetDueDate))) return true;
    if (isDueTodayOrEarlier(other.dueDate, now) && isDueTodayOrEarlier(targetDueDate, now)) {
      return true;
    }

    return false;
  });
}

/**
 * Creates the next recurring Quest instance if none already exists for the series.
 * - `mode === 'manual'`: triggered by user completing or failing a quest today -> next occurrence is strictly >= tomorrow 00:00 (or > scheduled future dueDate).
 * - `mode === 'auto_fail'`: triggered when an overdue past-day quest is auto-failed -> next occurrence lands on today or the next scheduled future date (>= today 00:00).
 */
export function createNextRecurringInstance(params: {
  sourceQuest: Quest;
  existingQuests: Quest[];
  mode: 'manual' | 'auto_fail';
  now?: number;
}): Quest | null {
  const { sourceQuest, existingQuests, mode, now = Date.now() } = params;
  if (
    sourceQuest.type === 'habit' ||
    !sourceQuest.recurrence ||
    sourceQuest.recurrence === 'none'
  ) {
    return null;
  }

  const seriesId = getQuestSeriesId(sourceQuest);
  const baseTimestamp = isValidTimestamp(sourceQuest.dueDate)
    ? sourceQuest.dueDate
    : getEndOfDayMs(now);
  const minTimestamp =
    mode === 'manual' ? getStartOfTomorrowMs(now) : getStartOfDayMs(now);

  let nextDueDate = getNextRecurrenceTimestamp(
    baseTimestamp,
    sourceQuest.recurrence,
    sourceQuest.recurrenceDays,
    minTimestamp
  );
  nextDueDate = normalizeDueDateTime(nextDueDate, sourceQuest.hasTime);

  // Guard against spawning an open sibling in the same series
  if (hasOpenRecurringSibling(sourceQuest, existingQuests, nextDueDate, now)) {
    return null;
  }

  // Also avoid overwriting an existing (already-completed) document with the same deterministic ID
  let candidateId = buildDeterministicRecurringId(seriesId, nextDueDate);
  let safety = 0;
  while (existingQuests.some((q) => q.id === candidateId) && safety < 365) {
    nextDueDate = computeSingleNextRecurrence(
      nextDueDate,
      sourceQuest.recurrence,
      sourceQuest.recurrenceDays
    );
    nextDueDate = normalizeDueDateTime(nextDueDate, sourceQuest.hasTime);
    if (hasOpenRecurringSibling(sourceQuest, existingQuests, nextDueDate, now)) {
      return null;
    }
    candidateId = buildDeterministicRecurringId(seriesId, nextDueDate);
    safety++;
  }

  if (existingQuests.some((q) => q.id === candidateId)) {
    return null;
  }

  return {
    ...sourceQuest,
    id: candidateId,
    seriesId,
    spawnedNextQuestId: undefined,
    completed: false,
    failed: false,
    completedAt: undefined,
    createdAt: now,
    dueDate: nextDueDate,
    subtasks: sourceQuest.subtasks?.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      completed: false,
    })),
  };
}

/**
 * Finds open recurring quests that belong together and returns IDs of redundant duplicates to remove.
 * Never removes completed history quests or non-recurring quests.
 */
export function findDuplicateActiveRecurringQuestIds(
  quests: Quest[],
  now: number = Date.now()
): string[] {
  const openRecurring = quests.filter(
    (q) =>
      q.type !== 'habit' &&
      !q.completed &&
      Boolean(q.recurrence) &&
      q.recurrence !== 'none'
  );

  if (openRecurring.length <= 1) return [];

  const toDelete = new Set<string>();

  const pickBestToKeep = (group: Quest[]): Quest => {
    return [...group].sort((a, b) => {
      // 1. Prefer any quest where subtasks have already been checked off
      const aSubDone = (a.subtasks || []).filter((s) => s.completed).length;
      const bSubDone = (b.subtasks || []).filter((s) => s.completed).length;
      if (aSubDone !== bSubDone) return bSubDone - aSubDone;

      // 2. Prefer one with an explicit dueDate over undated
      const aHasDue = isValidTimestamp(a.dueDate) ? 1 : 0;
      const bHasDue = isValidTimestamp(b.dueDate) ? 1 : 0;
      if (aHasDue !== bHasDue) return bHasDue - aHasDue;

      // 3. Among dated quests, prefer the earliest dueDate (so today comes before accidental duplicates later)
      if (isValidTimestamp(a.dueDate) && isValidTimestamp(b.dueDate) && a.dueDate !== b.dueDate) {
        return a.dueDate - b.dueDate;
      }

      // 4. Prefer richer metadata (description/tags/visionId)
      const aRich = (a.description ? 1 : 0) + (a.tags?.length || 0) + (a.visionId ? 1 : 0);
      const bRich = (b.description ? 1 : 0) + (b.tags?.length || 0) + (b.visionId ? 1 : 0);
      if (aRich !== bRich) return bRich - aRich;

      // 5. Prefer deterministic ID or oldest createdAt
      const aDet = a.id.startsWith('rec_') ? 1 : 0;
      const bDet = b.id.startsWith('rec_') ? 1 : 0;
      if (aDet !== bDet) return bDet - aDet;

      return (a.createdAt || 0) - (b.createdAt || 0);
    })[0];
  };

  // Pass 1: Explicit seriesId grouping — there must be at most 1 open quest per seriesId
  const bySeries = new Map<string, Quest[]>();
  for (const q of openRecurring) {
    if (q.seriesId || q.id.startsWith('rec_')) {
      const key = getQuestSeriesId(q);
      const arr = bySeries.get(key) || [];
      arr.push(q);
      bySeries.set(key, arr);
    }
  }
  for (const group of bySeries.values()) {
    if (group.length > 1) {
      const keep = pickBestToKeep(group);
      for (const q of group) {
        if (q.id !== keep.id) toDelete.add(q.id);
      }
    }
  }

  // Pass 2: Semantic grouping for remaining open recurring quests (catches legacy duplicates without seriesId)
  const remaining = openRecurring.filter((q) => !toDelete.has(q.id));
  const bySemanticActive = new Map<string, Quest[]>();
  const bySemanticPlannedDay = new Map<string, Quest[]>();

  for (const q of remaining) {
    const semKey = getSemanticRecurringKey(q);
    if (!isValidTimestamp(q.dueDate) || isDueTodayOrEarlier(q.dueDate, now)) {
      const arr = bySemanticActive.get(semKey) || [];
      arr.push(q);
      bySemanticActive.set(semKey, arr);
    } else {
      const dayKey = `${semKey}::${format(new Date(q.dueDate), 'yyyy-MM-dd')}`;
      const arr = bySemanticPlannedDay.get(dayKey) || [];
      arr.push(q);
      bySemanticPlannedDay.set(dayKey, arr);
    }
  }

  for (const group of bySemanticActive.values()) {
    if (group.length > 1) {
      const keep = pickBestToKeep(group);
      for (const q of group) {
        if (q.id !== keep.id) toDelete.add(q.id);
      }
    }
  }

  for (const group of bySemanticPlannedDay.values()) {
    if (group.length > 1) {
      const keep = pickBestToKeep(group);
      for (const q of group) {
        if (q.id !== keep.id) toDelete.add(q.id);
      }
    }
  }

  return Array.from(toDelete);
}

/**
 * Finds open auto-spawned successor quests that should be removed when `reopenedQuest` is reopened.
 */
export function findOpenSuccessorsForReopen(
  reopenedQuest: Quest,
  allQuests: Quest[]
): Quest[] {
  if (
    reopenedQuest.type === 'habit' ||
    !reopenedQuest.recurrence ||
    reopenedQuest.recurrence === 'none'
  ) {
    return [];
  }

  const seriesId = getQuestSeriesId(reopenedQuest);
  const semanticKey = getSemanticRecurringKey(reopenedQuest);
  const referenceTime = reopenedQuest.completedAt || reopenedQuest.createdAt || 0;

  return allQuests.filter((other) => {
    if (other.id === reopenedQuest.id) return false;
    if (other.completed || other.type === 'habit') return false;

    if (reopenedQuest.spawnedNextQuestId && other.id === reopenedQuest.spawnedNextQuestId) {
      return true;
    }

    if (
      (reopenedQuest.seriesId || reopenedQuest.id.startsWith('rec_')) &&
      (other.seriesId || other.id.startsWith('rec_')) &&
      getQuestSeriesId(other) === seriesId
    ) {
      return true;
    }

    // Fallback for legacy quests without seriesId
    if (
      !reopenedQuest.seriesId &&
      !other.seriesId &&
      getSemanticRecurringKey(other) === semanticKey &&
      (other.createdAt || 0) >= referenceTime - 5000
    ) {
      return true;
    }

    return false;
  });
}
