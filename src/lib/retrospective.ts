import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
  DiaryEntry,
  FocusSession,
  Quest,
  SkillType,
  UserStats,
  Vision,
  WeeklyRetrospective,
} from '@/types';

const MOOD_LABELS: Record<number, string> = {
  1: 'Schlecht',
  2: 'Geht so',
  3: 'Gut',
  4: 'Sehr gut',
  5: 'Exzellent',
};

export interface RetrospectiveDayMetric {
  day: Date;
  shortDay: string;
  dateLabel: string;
  mood: number | null;
  moodLabel: string | null;
  completedQuests: number;
  failedQuests: number;
  habitPositive: number;
  habitNegative: number;
  xp: number;
  focusMinutes: number;
  notes: string;
  progress: string;
}

export interface RetrospectiveVisionProgress {
  title: string;
  completed: boolean;
  linkedQuests: number;
  completedLinkedQuests: number;
  progressPercent: number;
}

export interface WeeklyRetrospectiveMetrics {
  weekKey: string;
  weekStart: Date;
  weekEnd: Date;
  weekLabel: string;
  dailyBreakdown: RetrospectiveDayMetric[];
  loggedMoodDays: number;
  avgMood: number | null;
  minMood: number | null;
  maxMood: number | null;
  moodSwingRange: number | null;
  moodVolatility: number | null;
  stabilityLabel:
    | 'Stabil'
    | 'Leichte Schwankungen'
    | 'Dynamisch'
    | 'Stark schwankend'
    | 'Noch keine Daten';
  biggestJump: {
    fromDay: string;
    toDay: string;
    delta: number;
  } | null;
  peakDay: { shortDay: string; mood: number } | null;
  lowDay: { shortDay: string; mood: number } | null;
  completedQuestsCount: number;
  failedQuestsCount: number;
  pendingWeekQuestsCount: number;
  questCompletionRate: number;
  habitPositiveCount: number;
  habitNegativeCount: number;
  totalXp: number;
  totalFocusMinutes: number;
  topSkill: { skill: SkillType; xp: number } | null;
  completedQuestTitles: string[];
  failedQuestTitles: string[];
  visionProgress: RetrospectiveVisionProgress[];
  userLevel: number;
  streak: number;
}

export function getWeekBounds(baseDate: Date = new Date()) {
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const weekKey = format(weekStart, 'yyyy-MM-dd');
  const weekLabel = `${format(weekStart, 'dd.MM.')} – ${format(weekEnd, 'dd.MM.yyyy')}`;
  return { weekStart, weekEnd, weekKey, weekLabel };
}

export function computeWeeklyRetrospectiveMetrics(params: {
  baseDate?: Date;
  quests: Quest[];
  diaryEntries: DiaryEntry[];
  focusSessions: FocusSession[];
  visions: Vision[];
  stats: UserStats;
}): WeeklyRetrospectiveMetrics {
  const {
    baseDate = new Date(),
    quests,
    diaryEntries,
    focusSessions,
    visions,
    stats,
  } = params;

  const { weekStart, weekEnd, weekKey, weekLabel } = getWeekBounds(baseDate);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const skillXp: Record<SkillType, number> = {
    Fitness: 0,
    Fokus: 0,
    Disziplin: 0,
    Wissen: 0,
    Soziales: 0,
  };

  let completedQuestsCount = 0;
  let failedQuestsCount = 0;
  let pendingWeekQuestsCount = 0;
  let habitPositiveCount = 0;
  let habitNegativeCount = 0;
  let totalXp = 0;
  let totalFocusMinutes = 0;
  const completedQuestTitles: string[] = [];
  const failedQuestTitles: string[] = [];

  // Pre-collect pending quests due inside this week
  quests.forEach((q) => {
    if (
      q.type !== 'habit' &&
      !q.completed &&
      typeof q.dueDate === 'number' &&
      q.dueDate >= weekStartMs &&
      q.dueDate <= weekEndMs
    ) {
      pendingWeekQuestsCount += 1;
    }
  });

  const dailyBreakdown: RetrospectiveDayMetric[] = days.map((day) => {
    const entry = diaryEntries.find((e) => isSameDay(new Date(e.date), day)) || null;
    let dayXp = 0;
    let dayCompletedQuests = 0;
    let dayFailedQuests = 0;
    let dayHabitPos = 0;
    let dayHabitNeg = 0;
    let dayFocus = 0;

    quests.forEach((q) => {
      if (q.type !== 'habit') {
        if (q.completed && !q.failed && q.completedAt && isSameDay(new Date(q.completedAt), day)) {
          dayCompletedQuests += 1;
          completedQuestsCount += 1;
          completedQuestTitles.push(q.title);
          dayXp += q.xpReward || 0;
          if (skillXp[q.skill] !== undefined) {
            skillXp[q.skill] += q.xpReward || 0;
          }
        } else if (
          q.completed &&
          q.failed &&
          isSameDay(new Date(q.completedAt ?? q.dueDate ?? q.createdAt), day)
        ) {
          dayFailedQuests += 1;
          failedQuestsCount += 1;
          failedQuestTitles.push(q.title);
        }
      } else if (q.completions && q.completions.length > 0) {
        q.completions.forEach((c) => {
          if (isSameDay(new Date(c.date), day)) {
            if (c.direction === 'negative') {
              dayHabitNeg += 1;
              habitNegativeCount += 1;
              dayXp -= q.xpReward || 0;
              if (skillXp[q.skill] !== undefined) {
                skillXp[q.skill] -= q.xpReward || 0;
              }
            } else {
              dayHabitPos += 1;
              habitPositiveCount += 1;
              dayXp += q.xpReward || 0;
              if (skillXp[q.skill] !== undefined) {
                skillXp[q.skill] += q.xpReward || 0;
              }
            }
          }
        });
      }
    });

    focusSessions.forEach((f) => {
      if (f.completedAt && isSameDay(new Date(f.completedAt), day)) {
        const mins = f.durationMinutes || 0;
        dayFocus += mins;
        totalFocusMinutes += mins;
        dayXp += mins;
        if (skillXp[f.skill] !== undefined) {
          skillXp[f.skill] += mins;
        }
      }
    });

    const clampedDayXp = Math.max(0, dayXp);
    totalXp += clampedDayXp;

    return {
      day,
      shortDay: format(day, 'EEEEEE', { locale: de }),
      dateLabel: format(day, 'dd.MM.'),
      mood: entry ? entry.mood : null,
      moodLabel: entry ? MOOD_LABELS[entry.mood] || null : null,
      completedQuests: dayCompletedQuests,
      failedQuests: dayFailedQuests,
      habitPositive: dayHabitPos,
      habitNegative: dayHabitNeg,
      xp: clampedDayXp,
      focusMinutes: dayFocus,
      notes: entry?.notes || '',
      progress: entry?.progress || '',
    };
  });

  const loggedDays = dailyBreakdown.filter((d) => d.mood !== null) as Array<
    RetrospectiveDayMetric & { mood: number }
  >;

  const loggedMoodDays = loggedDays.length;
  const avgMood =
    loggedMoodDays > 0
      ? Number((loggedDays.reduce((s, d) => s + d.mood, 0) / loggedMoodDays).toFixed(2))
      : null;

  const minMood =
    loggedMoodDays > 0 ? Math.min(...loggedDays.map((d) => d.mood)) : null;
  const maxMood =
    loggedMoodDays > 0 ? Math.max(...loggedDays.map((d) => d.mood)) : null;

  const moodSwingRange =
    minMood !== null && maxMood !== null ? maxMood - minMood : null;

  let moodVolatility: number | null = null;
  if (loggedMoodDays >= 2 && avgMood !== null) {
    const variance =
      loggedDays.reduce((sum, d) => sum + Math.pow(d.mood - avgMood, 2), 0) /
      loggedMoodDays;
    moodVolatility = Number(Math.sqrt(variance).toFixed(2));
  } else if (loggedMoodDays === 1) {
    moodVolatility = 0;
  }

  let stabilityLabel: WeeklyRetrospectiveMetrics['stabilityLabel'] = 'Noch keine Daten';
  if (loggedMoodDays >= 2 && moodSwingRange !== null && moodVolatility !== null) {
    if (moodSwingRange === 0 || moodVolatility < 0.4) {
      stabilityLabel = 'Stabil';
    } else if (moodSwingRange === 1 || moodVolatility < 0.8) {
      stabilityLabel = 'Leichte Schwankungen';
    } else if (moodSwingRange === 2 || moodVolatility < 1.2) {
      stabilityLabel = 'Dynamisch';
    } else {
      stabilityLabel = 'Stark schwankend';
    }
  } else if (loggedMoodDays === 1) {
    stabilityLabel = 'Stabil';
  }

  let biggestJump: WeeklyRetrospectiveMetrics['biggestJump'] = null;
  for (let i = 1; i < loggedDays.length; i++) {
    const prev = loggedDays[i - 1];
    const curr = loggedDays[i];
    const delta = curr.mood - prev.mood;
    if (!biggestJump || Math.abs(delta) > Math.abs(biggestJump.delta)) {
      biggestJump = {
        fromDay: prev.shortDay,
        toDay: curr.shortDay,
        delta,
      };
    }
  }

  const peakDay =
    loggedDays.length > 0
      ? (() => {
          const top = [...loggedDays].sort((a, b) => b.mood - a.mood || b.xp - a.xp)[0];
          return { shortDay: top.shortDay, mood: top.mood };
        })()
      : null;

  const lowDay =
    loggedDays.length > 0
      ? (() => {
          const low = [...loggedDays].sort((a, b) => a.mood - b.mood || a.xp - b.xp)[0];
          return { shortDay: low.shortDay, mood: low.mood };
        })()
      : null;

  const totalQuestDenominator =
    completedQuestsCount + failedQuestsCount + pendingWeekQuestsCount;
  const questCompletionRate =
    totalQuestDenominator > 0
      ? Math.round((completedQuestsCount / totalQuestDenominator) * 100)
      : 0;

  const topSkillEntry = (Object.entries(skillXp) as [SkillType, number][])
    .filter(([, xp]) => xp > 0)
    .sort((a, b) => b[1] - a[1])[0];

  const visionProgress: RetrospectiveVisionProgress[] = visions
    .slice(0, 6)
    .map((v) => {
      const linked = quests.filter((q) => q.visionId === v.id);
      const completedLinked = linked.filter((q) => q.completed && !q.failed).length;
      const progressPercent = v.completed
        ? 100
        : linked.length > 0
          ? Math.round((completedLinked / linked.length) * 100)
          : 0;
      return {
        title: v.title,
        completed: v.completed,
        linkedQuests: linked.length,
        completedLinkedQuests: completedLinked,
        progressPercent,
      };
    });

  return {
    weekKey,
    weekStart,
    weekEnd,
    weekLabel,
    dailyBreakdown,
    loggedMoodDays,
    avgMood,
    minMood,
    maxMood,
    moodSwingRange,
    moodVolatility,
    stabilityLabel,
    biggestJump,
    peakDay,
    lowDay,
    completedQuestsCount,
    failedQuestsCount,
    pendingWeekQuestsCount,
    questCompletionRate,
    habitPositiveCount,
    habitNegativeCount,
    totalXp,
    totalFocusMinutes,
    topSkill: topSkillEntry ? { skill: topSkillEntry[0], xp: topSkillEntry[1] } : null,
    completedQuestTitles: completedQuestTitles.slice(0, 12),
    failedQuestTitles: failedQuestTitles.slice(0, 12),
    visionProgress,
    userLevel: stats.level,
    streak: stats.streak,
  };
}

/**
 * Checks whether the automatic Sunday retrospective should be generated now.
 * Runs automatically on Sundays (getDay() === 0) if the current week's retrospective
 * hasn't been generated on this Sunday yet.
 */
export function shouldAutoGenerateSundayRetrospective(
  now: Date,
  retrospectives: WeeklyRetrospective[]
): boolean {
  if (now.getDay() !== 0) return false;
  const { weekKey } = getWeekBounds(now);
  const existing = retrospectives.find((r) => r.id === weekKey);
  if (!existing) return true;
  // If generated earlier in the week manually before Sunday arrived, refresh automatically on Sunday once
  const startOfSundayMs = startOfDay(now).getTime();
  return existing.generatedAt < startOfSundayMs;
}
