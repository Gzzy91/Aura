import { Quest } from '@/types';
import { format, isSameDay, startOfDay, subDays } from 'date-fns';
import { de } from 'date-fns/locale';

export interface HabitTodayStats {
  positiveToday: number;
  negativeToday: number;
  netXpToday: number;
}

export interface HabitTotals {
  totalPositive: number;
  totalNegative: number;
  netXp: number;
}

export interface HabitDayActivity {
  date: Date;
  shortLabel: string;
  positiveCount: number;
  negativeCount: number;
  isToday: boolean;
}

export function getHabitTodayStats(habit: Quest, referenceDate: Date = new Date()): HabitTodayStats {
  const completions = habit.completions || [];
  let positiveToday = 0;
  let negativeToday = 0;

  for (const c of completions) {
    if (isSameDay(new Date(c.date), referenceDate)) {
      if (c.direction === 'negative') {
        negativeToday += 1;
      } else {
        positiveToday += 1;
      }
    }
  }

  return {
    positiveToday,
    negativeToday,
    netXpToday: (positiveToday - negativeToday) * habit.xpReward,
  };
}

export function getHabitTotals(habit: Quest): HabitTotals {
  const completions = habit.completions || [];
  let totalPositive = 0;
  let totalNegative = 0;

  for (const c of completions) {
    if (c.direction === 'negative') {
      totalNegative += 1;
    } else {
      totalPositive += 1;
    }
  }

  return {
    totalPositive,
    totalNegative,
    netXp: (totalPositive - totalNegative) * habit.xpReward,
  };
}

export function getHabitCurrentStreak(habit: Quest, referenceDate: Date = new Date()): number {
  const completions = habit.completions || [];
  if (habit.habitDirection === 'negative') {
    const today = startOfDay(referenceDate);
    const createdDay = startOfDay(new Date(habit.createdAt || referenceDate.getTime()));
    let cleanDays = 0;
    let cursor = today;

    // Count consecutive days with 0 negative logs back to createdDay (max 365 days)
    while (cursor.getTime() >= createdDay.getTime() && cleanDays < 365) {
      const hasNegative = completions.some(
        (c) => c.direction === 'negative' && isSameDay(new Date(c.date), cursor)
      );
      if (hasNegative) break;
      cleanDays += 1;
      cursor = subDays(cursor, 1);
    }
    return cleanDays;
  }

  // Positive or both: consecutive days with at least 1 positive completion
  const positiveDayKeys = new Set<string>();
  for (const c of completions) {
    if (c.direction === 'positive') {
      positiveDayKeys.add(format(startOfDay(new Date(c.date)), 'yyyy-MM-dd'));
    }
  }

  if (positiveDayKeys.size === 0) return 0;

  const today = startOfDay(referenceDate);
  const todayKey = format(today, 'yyyy-MM-dd');
  const yesterday = subDays(today, 1);
  const yesterdayKey = format(yesterday, 'yyyy-MM-dd');

  let cursor: Date;
  if (positiveDayKeys.has(todayKey)) {
    cursor = today;
  } else if (positiveDayKeys.has(yesterdayKey)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (positiveDayKeys.has(format(cursor, 'yyyy-MM-dd')) && streak < 365) {
    streak += 1;
    cursor = subDays(cursor, 1);
  }

  return streak;
}

export function getLast7DaysActivity(habit: Quest, referenceDate: Date = new Date()): HabitDayActivity[] {
  const completions = habit.completions || [];
  const today = startOfDay(referenceDate);
  const days: HabitDayActivity[] = [];

  for (let offset = 6; offset >= 0; offset--) {
    const date = subDays(today, offset);
    let positiveCount = 0;
    let negativeCount = 0;

    for (const c of completions) {
      if (isSameDay(new Date(c.date), date)) {
        if (c.direction === 'negative') {
          negativeCount += 1;
        } else {
          positiveCount += 1;
        }
      }
    }

    days.push({
      date,
      shortLabel: format(date, 'EEEEEE', { locale: de }).slice(0, 2),
      positiveCount,
      negativeCount,
      isToday: offset === 0,
    });
  }

  return days;
}
