import { FocusSession, Quest, SkillStats, SkillType, UserStats } from '@/types';

export const ALL_SKILLS: SkillType[] = ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'];

export const SKILL_BASE_XP = 50;
export const OVERALL_BASE_XP = 100;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const WEEKLY_DECAY_RATE = 0.25;

export const SKILL_MAPPING: Record<string, SkillType> = {
  Focus: 'Fokus',
  Discipline: 'Disziplin',
  Knowledge: 'Wissen',
  Social: 'Soziales',
  Fitness: 'Fitness',
  Fokus: 'Fokus',
  Disziplin: 'Disziplin',
  Wissen: 'Wissen',
  Soziales: 'Soziales',
};

export interface SkillDecayEvent {
  skill: SkillType;
  xpLost: number;
  weeksMissed: number;
  previousLevel: number;
  newLevel: number;
}

export interface EvaluateSkillDecayResult {
  updated: boolean;
  nextStats: UserStats;
  decayedSkills: SkillDecayEvent[];
  overallPreviousLevel: number;
  overallNewLevel: number;
}

export function normalizeSkill(rawSkill: string | undefined): SkillType {
  if (!rawSkill) return 'Disziplin';
  return SKILL_MAPPING[rawSkill] || 'Disziplin';
}

export function getThresholdForLevel(level: number, baseThreshold: number): number {
  let threshold = baseThreshold;
  for (let lv = 1; lv < level; lv++) {
    threshold = Math.floor(threshold * 1.5);
  }
  return threshold;
}

export function computeLifetimeXp(
  level: number,
  currentXp: number,
  baseThreshold: number = SKILL_BASE_XP
): number {
  let total = Math.max(0, Math.round(currentXp));
  let threshold = baseThreshold;
  for (let lv = 1; lv < level; lv++) {
    total += threshold;
    threshold = Math.floor(threshold * 1.5);
  }
  return total;
}

export function computeProgressionFromTotalXp(
  totalXp: number,
  baseThreshold: number = SKILL_BASE_XP
): { level: number; xp: number; xpToNextLevel: number } {
  let level = 1;
  let xp = Math.max(0, Math.round(totalXp));
  let xpToNextLevel = baseThreshold;

  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level += 1;
    xpToNextLevel = Math.floor(xpToNextLevel * 1.5);
  }

  return { level, xp, xpToNextLevel };
}

export function adjustProgressionByDelta(
  current: { level: number; xp: number; xpToNextLevel: number },
  delta: number,
  baseThreshold: number
): { level: number; xp: number; xpToNextLevel: number } {
  const currentTotal = computeLifetimeXp(current.level || 1, current.xp || 0, baseThreshold);
  const nextTotal = Math.max(0, currentTotal + Math.round(delta));
  return computeProgressionFromTotalXp(nextTotal, baseThreshold);
}

export function getSkillLastWorkedFromHistory(
  quests: Quest[],
  focusSessions: FocusSession[]
): Record<SkillType, number | null> {
  const result: Record<SkillType, number | null> = {
    Fitness: null,
    Fokus: null,
    Disziplin: null,
    Wissen: null,
    Soziales: null,
  };

  const recordTs = (skill: SkillType, ts: unknown) => {
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return;
    const prev = result[skill];
    if (prev === null || ts > prev) {
      result[skill] = ts;
    }
  };

  for (const q of quests || []) {
    const skill = normalizeSkill(q.skill);
    if (q.type === 'habit') {
      if (Array.isArray(q.completions)) {
        for (const c of q.completions) {
          if (c.direction !== 'negative') {
            recordTs(skill, c.date);
          }
        }
      }
    } else if (q.completed && !q.failed) {
      recordTs(skill, q.completedAt ?? q.dueDate ?? q.createdAt);
    }
  }

  for (const f of focusSessions || []) {
    const skill = normalizeSkill(f.skill);
    recordTs(skill, f.completedAt);
  }

  return result;
}

export function evaluateWeeklySkillDecay(params: {
  stats: UserStats;
  quests: Quest[];
  focusSessions: FocusSession[];
  now?: number;
}): EvaluateSkillDecayResult {
  const { stats, quests, focusSessions, now = Date.now() } = params;
  const historyLastWorked = getSkillLastWorkedFromHistory(quests, focusSessions);

  const nextSkills: Record<SkillType, SkillStats> = { ...stats.skills };
  const decayedSkills: SkillDecayEvent[] = [];
  let updated = false;
  let totalDeductedAllSkills = 0;

  for (const skill of ALL_SKILLS) {
    const currentSkill: SkillStats = nextSkills[skill] || {
      level: 1,
      xp: 0,
      xpToNextLevel: SKILL_BASE_XP,
    };

    const currentTotalXp = computeLifetimeXp(
      currentSkill.level || 1,
      currentSkill.xp || 0,
      SKILL_BASE_XP
    );

    const historyTs = historyLastWorked[skill];
    const storedTs =
      typeof currentSkill.lastWorkedAt === 'number' && Number.isFinite(currentSkill.lastWorkedAt)
        ? currentSkill.lastWorkedAt
        : null;

    let effectiveLastWorked =
      historyTs !== null && storedTs !== null
        ? Math.max(historyTs, storedTs)
        : historyTs ?? storedTs;

    if (effectiveLastWorked === null) {
      if (currentTotalXp > 0) {
        // Legacy skill XP without timestamp: start inactivity window from now
        nextSkills[skill] = {
          ...currentSkill,
          lastWorkedAt: now,
        };
        updated = true;
      }
      continue;
    }

    const lastDecayAt =
      typeof currentSkill.lastDecayAt === 'number' && Number.isFinite(currentSkill.lastDecayAt)
        ? currentSkill.lastDecayAt
        : null;

    let anchor =
      lastDecayAt !== null ? Math.max(effectiveLastWorked, lastDecayAt) : effectiveLastWorked;

    if (currentTotalXp > 0 && now - anchor >= WEEK_MS) {
      const previousLevel = currentSkill.level || 1;
      let remainingXp = currentTotalXp;
      let deductedThisRun = 0;
      let weeksMissed = 0;

      while (now - anchor >= WEEK_MS && remainingXp > 0) {
        const currentStage = computeProgressionFromTotalXp(remainingXp, SKILL_BASE_XP);
        const penalty = Math.max(1, Math.round(currentStage.xpToNextLevel * WEEKLY_DECAY_RATE));
        const actualDeducted = Math.min(remainingXp, penalty);
        remainingXp -= actualDeducted;
        deductedThisRun += actualDeducted;
        weeksMissed += 1;
        anchor += WEEK_MS;
      }

      if (deductedThisRun > 0) {
        const nextProg = computeProgressionFromTotalXp(remainingXp, SKILL_BASE_XP);
        nextSkills[skill] = {
          ...currentSkill,
          level: nextProg.level,
          xp: nextProg.xp,
          xpToNextLevel: nextProg.xpToNextLevel,
          lastWorkedAt: effectiveLastWorked,
          lastDecayAt: anchor,
          decayedXpTotal: (currentSkill.decayedXpTotal || 0) + deductedThisRun,
          lastDecayAmount: deductedThisRun,
          lastDecayDemotedFrom: previousLevel > nextProg.level ? previousLevel : undefined,
        };
        totalDeductedAllSkills += deductedThisRun;
        decayedSkills.push({
          skill,
          xpLost: deductedThisRun,
          weeksMissed,
          previousLevel,
          newLevel: nextProg.level,
        });
        updated = true;
      }
    } else if (currentSkill.lastWorkedAt !== effectiveLastWorked) {
      nextSkills[skill] = {
        ...currentSkill,
        lastWorkedAt: effectiveLastWorked,
      };
      updated = true;
    }
  }

  const overallPreviousLevel = stats.level || 1;
  let nextOverall = {
    level: overallPreviousLevel,
    xp: stats.xp || 0,
    xpToNextLevel: stats.xpToNextLevel || OVERALL_BASE_XP,
  };

  if (totalDeductedAllSkills > 0) {
    nextOverall = adjustProgressionByDelta(
      nextOverall,
      -totalDeductedAllSkills,
      OVERALL_BASE_XP
    );
  }

  return {
    updated,
    nextStats: {
      ...stats,
      level: nextOverall.level,
      xp: nextOverall.xp,
      xpToNextLevel: nextOverall.xpToNextLevel,
      skills: nextSkills,
    },
    decayedSkills,
    overallPreviousLevel,
    overallNewLevel: nextOverall.level,
  };
}

export function getUpcomingWeeklyPenalty(xpToNextLevel: number): number {
  return Math.max(1, Math.round((xpToNextLevel || SKILL_BASE_XP) * WEEKLY_DECAY_RATE));
}
