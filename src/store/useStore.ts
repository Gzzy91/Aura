import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserStats, SkillStats, Quest, SkillType, DiaryEntry, Vision, FocusSession, DeepTraining, FoodEntry, WeeklyCoachSummary, WeeklyRetrospective, HealthDailyRecord, HealthDataSource, HealthMetricKey } from '../types';
import { User } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { toast } from 'sonner';
import { triggerHapticFeedback } from '@/lib/utils';
import { isSameDay, format } from 'date-fns';
import {
  ALL_SKILLS,
  OVERALL_BASE_XP,
  SKILL_BASE_XP,
  SKILL_MAPPING,
  SkillDecayEvent,
  adjustProgressionByDelta,
  computeProgressionFromTotalXp,
  evaluateWeeklySkillDecay,
  getSkillLastWorkedFromHistory,
} from '../lib/skillDecay';
import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  onSnapshot, 
  query, 
  where,
  getDoc,
  deleteField,
  writeBatch
} from 'firebase/firestore';
import {
  createNextRecurringInstance,
  findDuplicateActiveRecurringQuestIds,
  findOpenSuccessorsForReopen,
  getInitialDueDateForRecurringQuest,
  getQuestSeriesId,
  getStartOfDayMs,
  isQuestOverdueForAutoFail,
  isValidTimestamp,
  normalizeDueDateTime,
} from '../lib/questLifecycle';

const recentlyAutoFailedIds = new Map<string, number>();
let isAutoFailRunning = false;
let isDeduplicatingQuests = false;

const cleanData = <T>(data: T): T => {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanData(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const cleaned: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = (data as any)[key];
        if (value !== undefined) {
          cleaned[key] = cleanData(value);
        }
      }
    }
    return cleaned as T;
  }
  return data;
};

const cleanUpdateData = <T>(data: T): T => {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanData(item)) as unknown as T; // Use cleanData for arrays, deleteField is not allowed in arrays
  }
  if (typeof data === 'object') {
    const cleaned: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = (data as any)[key];
        if (value === undefined) {
          cleaned[key] = deleteField();
        } else {
          cleaned[key] = cleanData(value); // Nested objects use cleanData because deleteField is only for top-level or nested update paths, but let's keep it simple
        }
      }
    }
    return cleaned as T;
  }
  return data;
};

interface AppState {
  user: User | null;
  loading: boolean;
  isInitialized: boolean;
  questsSynced: boolean;
  focusSynced: boolean;
  isLocked: boolean;
  settings: {
    isPinEnabled: boolean;
    pin: string | null;
    visibleHealthMetrics?: HealthMetricKey[];
  };
  stats: UserStats;
  quests: Quest[];
  diaryEntries: DiaryEntry[];
  visions: Vision[];
  focusSessions: FocusSession[];
  notifiedQuestIds: string[];
  widgetOrder: string[];
  deepTrainings: DeepTraining[];
  foodEntries: FoodEntry[];
  weeklyCoachSummaries: WeeklyCoachSummary[];
  weeklyRetrospectives: WeeklyRetrospective[];
  healthRecords: HealthDailyRecord[];
  lastTrainingGeneratedDate: string | null;
  setUser: (user: User | null) => void;
  setInitialized: (val: boolean) => void;
  setLocked: (val: boolean) => void;
  updateSettings: (updates: Partial<{ isPinEnabled: boolean; pin: string | null; visibleHealthMetrics: HealthMetricKey[] }>) => void;
  addQuest: (quest: Omit<Quest, 'id' | 'completed' | 'createdAt'>) => void;
  completeQuest: (id: string, isNegativeHabit?: boolean, customDate?: number) => number | void;
  failQuest: (id: string) => void;
  autoFailOverdueQuests: () => number;
  deduplicateQuests: () => number;
  toggleSubtask: (questId: string, subtaskId: string) => void;
  deleteQuest: (id: string) => void;
  reopenQuest: (id: string) => void;
  updateQuest: (id: string, updates: Partial<Omit<Quest, 'id' | 'completed' | 'createdAt'>>) => void;
  removeHabitCompletion: (questId: string, completionIndex: number) => void;
  gainXp: (skill: SkillType, amount: number) => void;
  checkAndApplySkillDecay: () => SkillDecayEvent[];
  markNotified: (id: string) => void;
  addDiaryEntry: (entry: Omit<DiaryEntry, 'id'>) => void;
  updateDiaryEntry: (id: string, updates: Partial<Omit<DiaryEntry, 'id'>>) => void;
  deleteDiaryEntry: (id: string) => void;
  setDailyMood: (mood: number, targetDate?: Date) => Promise<void>;
  saveWeeklyCoachSummary: (summary: WeeklyCoachSummary) => Promise<void>;
  saveWeeklyRetrospective: (retro: WeeklyRetrospective) => Promise<void>;
  markRetroRecommendationAdopted: (retroId: string, recId: string) => Promise<void>;
  saveHealthRecord: (record: HealthDailyRecord) => Promise<void>;
  markRecoverySuggestionDecision: (recordId: string, suggestionId: string, decision: 'accepted' | 'dismissed') => Promise<void>;
  addFoodEntry: (entry: Omit<FoodEntry, 'id'>) => void;
  updateFoodEntry: (id: string, updates: Partial<Omit<FoodEntry, 'id'>>) => void;
  deleteFoodEntry: (id: string) => void;
  addVision: (vision: Omit<Vision, 'id' | 'createdAt' | 'completed'>) => void;
  updateVision: (id: string, updates: Partial<Vision>) => void;
  deleteVision: (id: string) => void;
  addFocusSession: (session: Omit<FocusSession, 'id'>) => void;
  addDeepTraining: (training: DeepTraining) => void;
  setLastTrainingGeneratedDate: (dateStr: string) => void;
  updateWidgetOrder: (order: string[]) => void;
  equipItem: (category: 'head' | 'body' | 'legs' | 'feet' | 'weapon' | 'shield' | 'accessory', itemId: string | null) => void;
  setActiveSkin: (skinId: string) => void;
  recalculateStats: () => void;
  syncWithFirestore: (userId: string) => () => void;
}


const DEFAULT_WIDGET_ORDER = [
  'level',
  'streak',
  'mood',
  'energy_recovery',
  'weekly_summary',
  'weekly_retrospective',
  'food_mood_correlation',
  'chart',
  'recurring_chart',
  'calendar',
  'today',
  'reminders',
];

const toEpochMs = (val: unknown, fallback = Date.now()): number => {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object') {
    const maybeTs = val as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTs.toMillis === 'function') {
      const ms = maybeTs.toMillis();
      if (Number.isFinite(ms)) return ms;
    }
    if (typeof maybeTs.seconds === 'number' && Number.isFinite(maybeTs.seconds)) {
      return Math.round(maybeTs.seconds * 1000);
    }
  }
  if (val instanceof Date && Number.isFinite(val.getTime())) return val.getTime();
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const sanitizeWidgetOrder = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [...DEFAULT_WIDGET_ORDER];
  const filtered = raw.filter((item): item is string => typeof item === 'string' && item !== 'settings');
  return filtered.length > 0 ? filtered : [...DEFAULT_WIDGET_ORDER];
};

const sanitizeSettings = (
  raw: unknown,
  fallback?: AppState['settings']
): AppState['settings'] => {
  const base = fallback || { isPinEnabled: false, pin: null };
  if (!raw || typeof raw !== 'object') {
    return {
      isPinEnabled: Boolean(base.isPinEnabled),
      pin: typeof base.pin === 'string' ? base.pin : null,
      ...(Array.isArray(base.visibleHealthMetrics)
        ? { visibleHealthMetrics: base.visibleHealthMetrics }
        : {}),
    };
  }
  const obj = raw as Record<string, unknown>;
  const visibleMetrics = Array.isArray(obj.visibleHealthMetrics)
    ? obj.visibleHealthMetrics.filter((k): k is HealthMetricKey => typeof k === 'string')
    : base.visibleHealthMetrics;

  return {
    isPinEnabled: typeof obj.isPinEnabled === 'boolean' ? obj.isPinEnabled : Boolean(base.isPinEnabled),
    pin: typeof obj.pin === 'string' || obj.pin === null ? (obj.pin as string | null) : base.pin ?? null,
    ...(Array.isArray(visibleMetrics) ? { visibleHealthMetrics: visibleMetrics } : {}),
  };
};

const INITIAL_STATS: UserStats = {
  level: 1,
  xp: 0,
  xpToNextLevel: 100,
  streak: 0,
  skills: {
    Fitness: { level: 1, xp: 0, xpToNextLevel: 50 },
    Fokus: { level: 1, xp: 0, xpToNextLevel: 50 },
    Disziplin: { level: 1, xp: 0, xpToNextLevel: 50 },
    Wissen: { level: 1, xp: 0, xpToNextLevel: 50 },
    Soziales: { level: 1, xp: 0, xpToNextLevel: 50 },
  },
  equippedItems: {
    head: null,
    body: null,
    legs: null,
    feet: null,
    weapon: null,
    shield: null,
    accessory: null,
  },
  activeSkinId: 'default',
};

const sanitizeStats = (raw: unknown): UserStats => {
  if (!raw || typeof raw !== 'object') return INITIAL_STATS;
  const obj = raw as Partial<UserStats>;
  const rawSkills = (obj.skills && typeof obj.skills === 'object' ? obj.skills : {}) as Record<
    string,
    Partial<SkillStats> | undefined
  >;
  const skills: Record<SkillType, SkillStats> = {
    Fitness: { ...INITIAL_STATS.skills.Fitness, ...(rawSkills.Fitness || {}) },
    Fokus: { ...INITIAL_STATS.skills.Fokus, ...(rawSkills.Fokus || {}) },
    Disziplin: { ...INITIAL_STATS.skills.Disziplin, ...(rawSkills.Disziplin || {}) },
    Wissen: { ...INITIAL_STATS.skills.Wissen, ...(rawSkills.Wissen || {}) },
    Soziales: { ...INITIAL_STATS.skills.Soziales, ...(rawSkills.Soziales || {}) },
  };
  return {
    level: typeof obj.level === 'number' && Number.isFinite(obj.level) && obj.level >= 1 ? obj.level : 1,
    xp: typeof obj.xp === 'number' && Number.isFinite(obj.xp) && obj.xp >= 0 ? obj.xp : 0,
    xpToNextLevel:
      typeof obj.xpToNextLevel === 'number' &&
      Number.isFinite(obj.xpToNextLevel) &&
      obj.xpToNextLevel > 0
        ? obj.xpToNextLevel
        : 100,
    streak: typeof obj.streak === 'number' && Number.isFinite(obj.streak) ? obj.streak : 0,
    skills,
    equippedItems: {
      ...INITIAL_STATS.equippedItems,
      ...(obj.equippedItems && typeof obj.equippedItems === 'object' ? obj.equippedItems : {}),
    },
    activeSkinId: typeof obj.activeSkinId === 'string' && obj.activeSkinId ? obj.activeSkinId : 'default',
  };
};

const sanitizeHealthRecordItem = (raw: unknown): HealthDailyRecord | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<HealthDailyRecord>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const validStates = new Set(['depleted', 'strained', 'balanced', 'charged']);
  return {
    ...(r as HealthDailyRecord),
    id: r.id,
    date: toEpochMs(r.date, Date.now()),
    sleepDurationMinutes:
      typeof r.sleepDurationMinutes === 'number' && Number.isFinite(r.sleepDurationMinutes)
        ? Math.max(0, r.sleepDurationMinutes)
        : 0,
    activityDurationMinutes:
      typeof r.activityDurationMinutes === 'number' && Number.isFinite(r.activityDurationMinutes)
        ? Math.max(0, r.activityDurationMinutes)
        : 0,
    avgHeartRate:
      typeof r.avgHeartRate === 'number' && Number.isFinite(r.avgHeartRate) ? r.avgHeartRate : null,
    sources: Array.isArray(r.sources) ? r.sources : (['aura_activity'] as HealthDataSource[]),
    recoveryScore:
      typeof r.recoveryScore === 'number' && Number.isFinite(r.recoveryScore)
        ? Math.max(0, Math.min(100, Math.round(r.recoveryScore)))
        : 50,
    recoveryState:
      typeof r.recoveryState === 'string' && validStates.has(r.recoveryState)
        ? r.recoveryState
        : 'balanced',
    acceptedSuggestionIds: Array.isArray(r.acceptedSuggestionIds) ? r.acceptedSuggestionIds : [],
    dismissedSuggestionIds: Array.isArray(r.dismissedSuggestionIds) ? r.dismissedSuggestionIds : [],
    syncedAt: toEpochMs(r.syncedAt, Date.now()),
  };
};

export function calculateStatsFromHistory(
  quests: Quest[],
  focusSessions: FocusSession[],
  currentStats?: UserStats
): UserStats {
  const skillXpMap: Record<SkillType, number> = {
    Fitness: 0,
    Fokus: 0,
    Disziplin: 0,
    Wissen: 0,
    Soziales: 0,
  };

  // 1. Calculate XP from Quests & Habits
  for (const q of quests || []) {
    const rawSkill = q.skill;
    const skill = SKILL_MAPPING[rawSkill] || 'Disziplin';
    const xpReward = typeof q.xpReward === 'number' ? q.xpReward : 10;

    if (q.type === 'habit') {
      if (Array.isArray(q.completions)) {
        for (const c of q.completions) {
          if (c.direction === 'negative') {
            skillXpMap[skill] -= xpReward;
          } else {
            skillXpMap[skill] += xpReward;
          }
        }
      }
    } else if (q.completed && !q.failed) {
      skillXpMap[skill] += xpReward;
    }
  }

  // 2. Calculate XP from Focus Sessions
  for (const f of focusSessions || []) {
    const rawSkill = f.skill;
    const skill = SKILL_MAPPING[rawSkill] || 'Fokus';
    const durationMinutes = typeof f.durationMinutes === 'number' ? f.durationMinutes : 0;
    const xpGained = durationMinutes;
    skillXpMap[skill] += xpGained;
  }

  const baseStats = currentStats || INITIAL_STATS;
  const historyLastWorked = getSkillLastWorkedFromHistory(quests || [], focusSessions || []);
  const skillsResult: Record<SkillType, SkillStats> = {
    Fitness: { level: 1, xp: 0, xpToNextLevel: SKILL_BASE_XP },
    Fokus: { level: 1, xp: 0, xpToNextLevel: SKILL_BASE_XP },
    Disziplin: { level: 1, xp: 0, xpToNextLevel: SKILL_BASE_XP },
    Wissen: { level: 1, xp: 0, xpToNextLevel: SKILL_BASE_XP },
    Soziales: { level: 1, xp: 0, xpToNextLevel: SKILL_BASE_XP },
  };

  let totalHistoryRawXp = 0;
  let totalOverallXp = 0;
  let hasAnyDecay = false;

  for (const skill of ALL_SKILLS) {
    const existing = baseStats.skills?.[skill];
    const historyXp = Math.max(0, skillXpMap[skill] || 0);
    totalHistoryRawXp += historyXp;

    const decayedXpTotal = Math.max(0, existing?.decayedXpTotal || 0);
    if (decayedXpTotal > 0) hasAnyDecay = true;

    const netXp = Math.max(0, historyXp - decayedXpTotal);
    totalOverallXp += netXp;

    const prog = computeProgressionFromTotalXp(netXp, SKILL_BASE_XP);
    const historyTs = historyLastWorked[skill];
    const storedTs = typeof existing?.lastWorkedAt === 'number' ? existing.lastWorkedAt : null;
    const mergedLastWorked =
      historyTs !== null && storedTs !== null
        ? Math.max(historyTs, storedTs)
        : historyTs ?? storedTs;

    skillsResult[skill] = {
      ...prog,
      ...(mergedLastWorked !== null ? { lastWorkedAt: mergedLastWorked } : {}),
      ...(typeof existing?.lastDecayAt === 'number' ? { lastDecayAt: existing.lastDecayAt } : {}),
      ...(decayedXpTotal > 0 ? { decayedXpTotal } : {}),
      ...(typeof existing?.lastDecayAmount === 'number' && existing.lastDecayAmount > 0
        ? { lastDecayAmount: existing.lastDecayAmount }
        : {}),
      ...(typeof existing?.lastDecayDemotedFrom === 'number'
        ? { lastDecayDemotedFrom: existing.lastDecayDemotedFrom }
        : {}),
    };
  }

  const overallCalc = computeProgressionFromTotalXp(totalOverallXp, OVERALL_BASE_XP);

  // Preserve loaded stats while history is still empty/loading, or if higher non-decayed stats exist.
  // Once history is present and decay has occurred, allow demotions to stick.
  const canDemoteFromHistory = hasAnyDecay && totalHistoryRawXp > 0;
  const keepBaseOverall = !canDemoteFromHistory && (baseStats.level || 1) > overallCalc.level;

  const finalLevel = keepBaseOverall ? (baseStats.level || 1) : overallCalc.level;
  const finalXp = keepBaseOverall ? (baseStats.xp || 0) : overallCalc.xp;
  const finalXpToNextLevel = keepBaseOverall
    ? (baseStats.xpToNextLevel || OVERALL_BASE_XP)
    : overallCalc.xpToNextLevel;

  const mergedSkills: Record<SkillType, SkillStats> = {} as Record<SkillType, SkillStats>;
  for (const skill of ALL_SKILLS) {
    const calc = skillsResult[skill];
    const existing = baseStats.skills?.[skill];
    const skillHasDecay = (existing?.decayedXpTotal || 0) > 0;
    if (
      existing &&
      existing.level > calc.level &&
      !(skillHasDecay && totalHistoryRawXp > 0)
    ) {
      mergedSkills[skill] = {
        ...existing,
        ...(calc.lastWorkedAt !== undefined ? { lastWorkedAt: calc.lastWorkedAt } : {}),
      };
    } else {
      mergedSkills[skill] = calc;
    }
  }

  return {
    ...baseStats,
    level: finalLevel,
    xp: finalXp,
    xpToNextLevel: finalXpToNextLevel,
    skills: mergedSkills,
  };
}



export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: true,
      isInitialized: false,
      questsSynced: false,
      focusSynced: false,
      isLocked: false,
      settings: {
        isPinEnabled: false,
        pin: null
      },
      stats: INITIAL_STATS,
      quests: [],
      diaryEntries: [],
      visions: [],
      focusSessions: [],
      notifiedQuestIds: [],
      widgetOrder: ['level', 'streak', 'mood', 'energy_recovery', 'weekly_summary', 'weekly_retrospective', 'food_mood_correlation', 'chart', 'recurring_chart', 'calendar', 'today', 'reminders'],
      deepTrainings: [],
      foodEntries: [],
      weeklyCoachSummaries: [],
      weeklyRetrospectives: [],
      healthRecords: [],
      lastTrainingGeneratedDate: null,
      
      setUser: (user) => set({ user, loading: false, ...(user ? {} : { questsSynced: false, focusSynced: false }) }),
      setInitialized: (val) => set({ isInitialized: val }),
      setLocked: (val) => set({ isLocked: val }),
      
      addDeepTraining: (training) => {
        set((state) => ({ deepTrainings: [...state.deepTrainings, training] }));
        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'deepTrainings', training.id), cleanData(training)).catch((error) => {
            handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/deepTrainings/${training.id}`);
          });
        }
      },
      
      setLastTrainingGeneratedDate: (dateStr) => {
        set({ lastTrainingGeneratedDate: dateStr });
        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid), cleanData({ lastTrainingGeneratedDate: dateStr }), { merge: true }).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          });
        }
      },

      updateSettings: (updates) => {
        const { user, settings } = get();
        const newSettings = sanitizeSettings({ ...settings, ...updates }, settings);
        set({ settings: newSettings });
        triggerHapticFeedback();
        if (user) {
          setDoc(doc(db, 'users', user.uid), cleanData({ settings: newSettings }), { merge: true }).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          });
        }
      },

      updateWidgetOrder: (order) => {
        const safeOrder = sanitizeWidgetOrder(order);
        set({ widgetOrder: safeOrder });
        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid), cleanData({ widgetOrder: safeOrder }), { merge: true }).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          });
        }
      },

      addVision: (visionData) => {
        const id = crypto.randomUUID();
        const vision: Vision = { ...visionData, id, completed: false, createdAt: Date.now() };
        set(state => ({ visions: [...state.visions, vision] }));
        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'visions', id), cleanData(vision)).catch((error) => {
            handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/visions/${id}`);
          });
        }
      },

      updateVision: (id, updates) => {
        set(state => ({
          visions: state.visions.map(v => v.id === id ? { ...v, ...updates } : v)
        }));
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'visions', id), cleanUpdateData(updates)).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/visions/${id}`);
          });
        }
      },

      deleteVision: (id) => {
        set(state => ({
          visions: state.visions.filter(v => v.id !== id)
        }));
        const { user } = get();
        if (user) {
          deleteDoc(doc(db, 'users', user.uid, 'visions', id)).catch((error) => {
            handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/visions/${id}`);
          });
        }
      },

      addFocusSession: (sessionData) => {
        const id = crypto.randomUUID();
        const session: FocusSession = { ...sessionData, id };
        set(state => ({ focusSessions: [...state.focusSessions, session] }));
        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'focusSessions', id), cleanData(session)).catch((error) => {
            handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/focusSessions/${id}`);
          });
        }
      },

      equipItem: (category, itemId) => {
        const { stats, user } = get();
        const newStats = {
          ...stats,
          equippedItems: {
            ...stats.equippedItems,
            [category]: itemId,
          },
        };
        set({ stats: newStats });
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats })).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          });
        }
      },

      setActiveSkin: (skinId) => {
        const { stats, user } = get();
        const newStats = {
          ...stats,
          activeSkinId: skinId,
        };
        set({ stats: newStats });
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats })).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          });
        }
      },

      addQuest: (questData) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const isRecurring =
          questData.type !== 'habit' &&
          Boolean(questData.recurrence) &&
          questData.recurrence !== 'none';

        let resolvedDueDate = isValidTimestamp(questData.dueDate)
          ? normalizeDueDateTime(questData.dueDate, questData.hasTime)
          : undefined;

        if (isRecurring && resolvedDueDate === undefined) {
          resolvedDueDate = getInitialDueDateForRecurringQuest(
            questData.recurrence,
            questData.recurrenceDays,
            now
          );
        }

        const cleanedRecurrenceDays =
          questData.recurrence === 'weekly' || questData.recurrence === 'monthly'
            ? [...(questData.recurrenceDays || [])].sort((a, b) => a - b)
            : [];

        const quest: Quest = {
          ...questData,
          id,
          dueDate: resolvedDueDate,
          recurrenceDays: cleanedRecurrenceDays,
          ...(isRecurring ? { seriesId: questData.seriesId || id } : {}),
          completed: false,
          createdAt: now,
        };

        set((state) => ({
          quests: [...state.quests, quest]
        }));

        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'quests', id), cleanData(quest)).catch((error) => {
            handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/quests/${id}`);
          });
        }
      },

      addDiaryEntry: (entryData) => {
        const id = crypto.randomUUID();
        const entry: DiaryEntry = { ...entryData, id, date: entryData.date || Date.now() };
        
        set((state) => ({
          diaryEntries: [entry, ...state.diaryEntries].sort((a, b) => b.date - a.date)
        }));

        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'diaryEntries', id), cleanData(entry)).catch((error) => {
            handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/diaryEntries/${id}`);
          });
        }
      },

      updateDiaryEntry: (id, updates) => {
        set((state) => ({
          diaryEntries: state.diaryEntries
            .map(e => e.id === id ? { ...e, ...updates } : e)
            .sort((a, b) => b.date - a.date)
        }));

        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'diaryEntries', id), cleanUpdateData(updates)).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/diaryEntries/${id}`);
          });
        }
      },

      deleteDiaryEntry: (id) => {
        set((state) => ({
          diaryEntries: state.diaryEntries.filter(e => e.id !== id)
        }));

        const { user } = get();
        if (user) {
          deleteDoc(doc(db, 'users', user.uid, 'diaryEntries', id)).catch((error) => {
            handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/diaryEntries/${id}`);
          });
        }
      },

      setDailyMood: async (mood, targetDate = new Date()) => {
        const validMood = Math.min(5, Math.max(1, Math.round(mood)));
        const dateKey = format(targetDate, 'yyyy-MM-dd');
        const state = get();
        const existing = state.diaryEntries.find(
          (e) => e.id === `mood-${dateKey}` || isSameDay(new Date(e.date), targetDate)
        );
        const { user } = state;

        if (existing) {
          set((s) => ({
            diaryEntries: s.diaryEntries
              .map((e) => (e.id === existing.id ? { ...e, mood: validMood } : e))
              .sort((a, b) => b.date - a.date)
          }));

          if (user) {
            try {
              await updateDoc(
                doc(db, 'users', user.uid, 'diaryEntries', existing.id),
                cleanUpdateData({ mood: validMood })
              );
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/diaryEntries/${existing.id}`);
              throw error;
            }
          }
        } else {
          const id = `mood-${dateKey}`;
          const entry: DiaryEntry = {
            id,
            date: targetDate.getTime(),
            mood: validMood,
            notes: '',
            progress: '',
            tags: [],
          };

          set((s) => ({
            diaryEntries: [entry, ...s.diaryEntries].sort((a, b) => b.date - a.date)
          }));

          if (user) {
            try {
              await setDoc(doc(db, 'users', user.uid, 'diaryEntries', id), cleanData(entry));
            } catch (error) {
              handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/diaryEntries/${id}`);
              throw error;
            }
          }
        }
      },

      saveWeeklyCoachSummary: async (summary) => {
        set((s) => {
          const exists = s.weeklyCoachSummaries.some((item) => item.id === summary.id);
          const next = exists
            ? s.weeklyCoachSummaries.map((item) => (item.id === summary.id ? summary : item))
            : [summary, ...s.weeklyCoachSummaries];
          return {
            weeklyCoachSummaries: next.sort((a, b) => b.weekStart - a.weekStart),
          };
        });

        const { user } = get();
        if (user) {
          try {
            await setDoc(
              doc(db, 'users', user.uid, 'weeklyCoachSummaries', summary.id),
              cleanData(summary)
            );
          } catch (error) {
            handleFirestoreError(
              error,
              OperationType.CREATE,
              `users/${user.uid}/weeklyCoachSummaries/${summary.id}`
            );
          }
        }
      },

      saveWeeklyRetrospective: async (retro) => {
        const sanitized: WeeklyRetrospective = {
          ...retro,
          weekStart: Math.round(retro.weekStart),
          weekEnd: Math.round(retro.weekEnd),
          loggedMoodDays: Math.max(0, Math.min(7, Math.round(retro.loggedMoodDays))),
          completedQuestsCount: Math.max(0, Math.round(retro.completedQuestsCount)),
          failedQuestsCount: Math.max(0, Math.round(retro.failedQuestsCount)),
          questCompletionRate: Math.max(0, Math.min(100, Math.round(retro.questCompletionRate))),
          habitPositiveCount: Math.max(0, Math.round(retro.habitPositiveCount)),
          habitNegativeCount: Math.max(0, Math.round(retro.habitNegativeCount)),
          totalXp: Math.max(0, retro.totalXp),
          totalFocusMinutes: Math.max(0, Math.round(retro.totalFocusMinutes)),
          minMood: retro.minMood !== null ? Math.round(retro.minMood) : null,
          maxMood: retro.maxMood !== null ? Math.round(retro.maxMood) : null,
          focusRecommendations: (retro.focusRecommendations || []).slice(0, 5),
          adoptedRecommendationIds: (retro.adoptedRecommendationIds || []).slice(0, 10),
          generatedAt: Math.round(retro.generatedAt || Date.now()),
        };

        set((s) => {
          const exists = s.weeklyRetrospectives.some((item) => item.id === sanitized.id);
          const next = exists
            ? s.weeklyRetrospectives.map((item) => (item.id === sanitized.id ? sanitized : item))
            : [sanitized, ...s.weeklyRetrospectives];
          return {
            weeklyRetrospectives: next.sort((a, b) => b.weekStart - a.weekStart),
          };
        });

        const { user } = get();
        if (user) {
          try {
            await setDoc(
              doc(db, 'users', user.uid, 'weeklyRetrospectives', sanitized.id),
              cleanData(sanitized)
            );
          } catch (error) {
            handleFirestoreError(
              error,
              OperationType.WRITE,
              `users/${user.uid}/weeklyRetrospectives/${sanitized.id}`
            );
          }
        }
      },

      markRetroRecommendationAdopted: async (retroId, recId) => {
        const existing = get().weeklyRetrospectives.find((r) => r.id === retroId);
        if (!existing) return;
        const adopted = Array.from(new Set([...(existing.adoptedRecommendationIds || []), recId])).slice(0, 10);
        await get().saveWeeklyRetrospective({
          ...existing,
          adoptedRecommendationIds: adopted,
        });
      },

      saveHealthRecord: async (record) => {
        const optInt = (val: number | null | undefined, min: number, max: number): number | null =>
          typeof val === 'number' && Number.isFinite(val)
            ? Math.max(min, Math.min(max, Math.round(val)))
            : null;
        const optFloat = (
          val: number | null | undefined,
          min: number,
          max: number,
          decimals = 1
        ): number | null => {
          if (typeof val !== 'number' || !Number.isFinite(val)) return null;
          const factor = 10 ** decimals;
          return Math.max(min, Math.min(max, Math.round(val * factor) / factor));
        };

        const validStates = new Set(['depleted', 'strained', 'balanced', 'charged']);
        const rawSleep =
          typeof record.sleepDurationMinutes === 'number' && Number.isFinite(record.sleepDurationMinutes)
            ? record.sleepDurationMinutes
            : 0;
        const rawActivity =
          typeof record.activityDurationMinutes === 'number' && Number.isFinite(record.activityDurationMinutes)
            ? record.activityDurationMinutes
            : 0;
        const rawRecovery =
          typeof record.recoveryScore === 'number' && Number.isFinite(record.recoveryScore)
            ? record.recoveryScore
            : 50;

        const sanitized: HealthDailyRecord = {
          id: record.id,
          date: Math.round(toEpochMs(record.date, Date.now())),
          sleepDurationMinutes: Math.max(0, Math.min(1440, Math.round(rawSleep))),
          activityDurationMinutes: Math.max(0, Math.min(1440, Math.round(rawActivity))),
          avgHeartRate: optInt(record.avgHeartRate, 25, 240),
          sleepDeepMinutes: optInt(record.sleepDeepMinutes, 0, 1440),
          sleepLightMinutes: optInt(record.sleepLightMinutes, 0, 1440),
          sleepRemMinutes: optInt(record.sleepRemMinutes, 0, 1440),
          sleepAwakeMinutes: optInt(record.sleepAwakeMinutes, 0, 1440),
          steps: optInt(record.steps, 0, 500000),
          distanceMeters: optInt(record.distanceMeters, 0, 1000000),
          caloriesActive: optInt(record.caloriesActive, 0, 50000),
          floorsClimbed: optInt(record.floorsClimbed, 0, 10000),
          heartPoints: optInt(record.heartPoints, 0, 5000),
          workoutsCount: optInt(record.workoutsCount, 0, 100),
          restingHeartRate: optInt(record.restingHeartRate, 25, 220),
          hrvMs: optFloat(record.hrvMs, 0, 500, 1),
          stressLevel: optInt(record.stressLevel, 0, 100),
          bodyBattery: optInt(record.bodyBattery, 0, 100),
          spo2Percent: optFloat(record.spo2Percent, 50, 100, 1),
          respirationRate: optFloat(record.respirationRate, 4, 80, 1),
          vo2Max: optFloat(record.vo2Max, 10, 110, 1),
          weightKg: optFloat(record.weightKg, 20, 400, 1),
          bodyFatPercent: optFloat(record.bodyFatPercent, 1, 75, 1),
          hydrationMl: optInt(record.hydrationMl, 0, 30000),
          sources: Array.from(
            new Set<HealthDataSource>(
              Array.isArray(record.sources) ? record.sources : ['aura_activity']
            )
          ).slice(0, 8),
          recoveryScore: Math.max(0, Math.min(100, Math.round(rawRecovery))),
          recoveryState: validStates.has(record.recoveryState) ? record.recoveryState : 'balanced',
          acceptedSuggestionIds: Array.isArray(record.acceptedSuggestionIds) ? record.acceptedSuggestionIds.slice(0, 25) : [],
          dismissedSuggestionIds: Array.isArray(record.dismissedSuggestionIds) ? record.dismissedSuggestionIds.slice(0, 25) : [],
          syncedAt: Math.round(toEpochMs(record.syncedAt, Date.now())),
        };

        set((s) => {
          const exists = s.healthRecords.some((item) => item.id === sanitized.id);
          const next = exists
            ? s.healthRecords.map((item) => (item.id === sanitized.id ? sanitized : item))
            : [sanitized, ...s.healthRecords];
          return {
            healthRecords: next.sort((a, b) => b.date - a.date),
          };
        });

        const { user } = get();
        if (user) {
          try {
            await setDoc(
              doc(db, 'users', user.uid, 'healthRecords', sanitized.id),
              cleanData(sanitized)
            );
          } catch (error) {
            handleFirestoreError(
              error,
              OperationType.WRITE,
              `users/${user.uid}/healthRecords/${sanitized.id}`
            );
          }
        }
      },

      markRecoverySuggestionDecision: async (recordId, suggestionId, decision) => {
        const existing = get().healthRecords.find((r) => r.id === recordId);
        if (!existing) return;

        const accepted = new Set(existing.acceptedSuggestionIds || []);
        const dismissed = new Set(existing.dismissedSuggestionIds || []);

        if (decision === 'accepted') {
          accepted.add(suggestionId);
          dismissed.delete(suggestionId);
        } else {
          dismissed.add(suggestionId);
        }

        await get().saveHealthRecord({
          ...existing,
          acceptedSuggestionIds: Array.from(accepted).slice(0, 25),
          dismissedSuggestionIds: Array.from(dismissed).slice(0, 25),
        });
      },

      addFoodEntry: (entryData) => {
        const id = crypto.randomUUID();
        const entry: FoodEntry = { ...entryData, id, date: entryData.date || Date.now() };
        
        set((state) => ({
          foodEntries: [entry, ...state.foodEntries].sort((a, b) => b.date - a.date)
        }));

        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'foodEntries', id), cleanData(entry)).catch((error) => {
            handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/foodEntries/${id}`);
          });
        }
      },

      updateFoodEntry: (id, updates) => {
        set((state) => ({
          foodEntries: state.foodEntries
            .map(e => e.id === id ? { ...e, ...updates } : e)
            .sort((a, b) => b.date - a.date)
        }));

        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'foodEntries', id), cleanUpdateData(updates)).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/foodEntries/${id}`);
          });
        }
      },

      deleteFoodEntry: (id) => {
        set((state) => ({
          foodEntries: state.foodEntries.filter(e => e.id !== id)
        }));

        const { user } = get();
        if (user) {
          deleteDoc(doc(db, 'users', user.uid, 'foodEntries', id)).catch((error) => {
            handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/foodEntries/${id}`);
          });
        }
      },

      completeQuest: (id, isNegativeHabit = false, customDate?: number) => {
        const state = get();
        const quest = state.quests.find(q => q.id === id);
        if (!quest || quest.completed) return;
        
        triggerHapticFeedback([50, 100, 50]);

        const { user } = get();
        let nextQuests = [...state.quests];
        let newStats = { ...state.stats, skills: { ...state.stats.skills } };
        const actionTimestamp = customDate ?? Date.now();

        const xpDelta = isNegativeHabit ? -quest.xpReward : quest.xpReward;
        const nextOverall = adjustProgressionByDelta(newStats, xpDelta, OVERALL_BASE_XP);
        newStats.level = nextOverall.level;
        newStats.xp = nextOverall.xp;
        newStats.xpToNextLevel = nextOverall.xpToNextLevel;

        const currentSkillStats = newStats.skills[quest.skill] || {
          level: 1,
          xp: 0,
          xpToNextLevel: SKILL_BASE_XP,
        };
        const nextSkillProg = adjustProgressionByDelta(currentSkillStats, xpDelta, SKILL_BASE_XP);
        const updatedSkillStats: SkillStats = {
          ...currentSkillStats,
          ...nextSkillProg,
        };
        if (!isNegativeHabit) {
          updatedSkillStats.lastWorkedAt = Math.max(
            currentSkillStats.lastWorkedAt || 0,
            actionTimestamp
          );
          delete updatedSkillStats.lastDecayAmount;
          delete updatedSkillStats.lastDecayDemotedFrom;
        }
        newStats.skills[quest.skill] = updatedSkillStats;

        if (quest.type === 'habit') {
          const newCompletion = { date: actionTimestamp, direction: isNegativeHabit ? 'negative' as const : 'positive' as const };
          nextQuests = state.quests.map(q => q.id === id ? { 
            ...q, 
            completions: [...(q.completions || []), newCompletion] 
          } : q);
          
          if (user) {
            updateDoc(doc(db, 'users', user.uid, 'quests', id), cleanUpdateData({
              completions: nextQuests.find(q => q.id === id)?.completions
            })).catch((error) => {
              handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/quests/${id}`);
            });
          }

          set({ quests: nextQuests, stats: newStats });
          if (user) {
            updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats })).catch((error) => {
              handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
            });
          }
          return actionTimestamp;
        } else {
          const completedAt = actionTimestamp;
          const isRecurring = Boolean(quest.recurrence && quest.recurrence !== 'none');
          const resolvedSeriesId = isRecurring ? getQuestSeriesId(quest) : quest.seriesId;

          const baseNextQuests = state.quests.map(q =>
            q.id === id
              ? {
                  ...q,
                  completed: true,
                  failed: false,
                  completedAt,
                  ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
                }
              : q
          );

          const recurringQuest = isRecurring
            ? createNextRecurringInstance({
                sourceQuest: {
                  ...quest,
                  ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
                },
                existingQuests: baseNextQuests,
                mode: 'manual',
                now: completedAt,
              })
            : null;

          nextQuests = baseNextQuests.map(q =>
            q.id === id && recurringQuest
              ? { ...q, spawnedNextQuestId: recurringQuest.id }
              : q
          );
          if (recurringQuest) {
            nextQuests.push(recurringQuest);
          }

          set({ quests: nextQuests, stats: newStats });

          if (user) {
            const batch = writeBatch(db);
            batch.update(
              doc(db, 'users', user.uid, 'quests', id),
              cleanUpdateData({
                completed: true,
                failed: false,
                completedAt,
                ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
                ...(recurringQuest ? { spawnedNextQuestId: recurringQuest.id } : {}),
              })
            );
            if (recurringQuest) {
              batch.set(
                doc(db, 'users', user.uid, 'quests', recurringQuest.id),
                cleanData(recurringQuest)
              );
            }
            batch.update(
              doc(db, 'users', user.uid),
              cleanUpdateData({ stats: newStats })
            );
            batch.commit().catch((error) => {
              console.error('Firestore batch completeQuest failed:', error);
              toast.error('Fehler beim Speichern der Quest');
            });
          }
        }
      },

      failQuest: (id) => {
        const state = get();
        const quest = state.quests.find(q => q.id === id);
        if (!quest || quest.completed) return;

        triggerHapticFeedback([40, 40]);

        const { user } = get();
        const completedAt = Date.now();
        const isRecurring =
          quest.type !== 'habit' && Boolean(quest.recurrence && quest.recurrence !== 'none');
        const resolvedSeriesId = isRecurring ? getQuestSeriesId(quest) : quest.seriesId;

        const baseNextQuests = state.quests.map(q =>
          q.id === id
            ? {
                ...q,
                completed: true,
                failed: true,
                completedAt,
                ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
              }
            : q
        );

        const recurringQuest = isRecurring
          ? createNextRecurringInstance({
              sourceQuest: {
                ...quest,
                ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
              },
              existingQuests: baseNextQuests,
              mode: 'manual',
              now: completedAt,
            })
          : null;

        const nextQuests = baseNextQuests.map(q =>
          q.id === id && recurringQuest
            ? { ...q, spawnedNextQuestId: recurringQuest.id }
            : q
        );
        if (recurringQuest) {
          nextQuests.push(recurringQuest);
        }

        set({ quests: nextQuests });

        if (user) {
          const batch = writeBatch(db);
          batch.update(
            doc(db, 'users', user.uid, 'quests', id),
            cleanUpdateData({
              completed: true,
              failed: true,
              completedAt,
              ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
              ...(recurringQuest ? { spawnedNextQuestId: recurringQuest.id } : {}),
            })
          );
          if (recurringQuest) {
            batch.set(
              doc(db, 'users', user.uid, 'quests', recurringQuest.id),
              cleanData(recurringQuest)
            );
          }
          batch.commit().catch((error) => {
            console.error('Firestore batch failQuest failed:', error);
            toast.error('Fehler beim Aktualisieren der Quest');
          });
        }
      },

      autoFailOverdueQuests: () => {
        if (isAutoFailRunning) return 0;
        const state = get();
        if (state.user && !state.questsSynced) return 0;

        const now = Date.now();
        // Clean stale entries older than 5 seconds from in-flight cooldown cache
        for (const [qid, ts] of recentlyAutoFailedIds.entries()) {
          if (now - ts > 5000) recentlyAutoFailedIds.delete(qid);
        }

        const overdueQuests = state.quests.filter(
          (q) => isQuestOverdueForAutoFail(q, now) && !recentlyAutoFailedIds.has(q.id)
        );

        if (overdueQuests.length === 0) return 0;

        isAutoFailRunning = true;
        try {
          const overdueIds = new Set(overdueQuests.map((q) => q.id));
          overdueQuests.forEach((q) => recentlyAutoFailedIds.set(q.id, now));

          const { user } = state;
          const nextQuests: Quest[] = state.quests.map((q) => {
            if (!overdueIds.has(q.id)) return q;
            const isRecurring = Boolean(q.recurrence && q.recurrence !== 'none');
            return {
              ...q,
              completed: true,
              failed: true,
              completedAt: q.dueDate,
              ...(isRecurring ? { seriesId: getQuestSeriesId(q) } : {}),
            };
          });

          const newRecurringQuests: Quest[] = [];
          const spawnedLinks = new Map<string, string>();

          for (const q of overdueQuests) {
            if (q.recurrence && q.recurrence !== 'none') {
              const resolvedSeriesId = getQuestSeriesId(q);
              const recurringQuest = createNextRecurringInstance({
                sourceQuest: { ...q, seriesId: resolvedSeriesId },
                existingQuests: [...nextQuests, ...newRecurringQuests],
                mode: 'auto_fail',
                now,
              });
              if (recurringQuest) {
                newRecurringQuests.push(recurringQuest);
                spawnedLinks.set(q.id, recurringQuest.id);
              }
            }
          }

          const finalQuests = [
            ...nextQuests.map((q) =>
              spawnedLinks.has(q.id)
                ? { ...q, spawnedNextQuestId: spawnedLinks.get(q.id) }
                : q
            ),
            ...newRecurringQuests,
          ];

          set({ quests: finalQuests });

          if (user) {
            // Firestore batches allow up to 500 ops; chunk safely at 400
            const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

            for (const q of overdueQuests) {
              const isRecurring = Boolean(q.recurrence && q.recurrence !== 'none');
              const spawnedId = spawnedLinks.get(q.id);
              ops.push((batch) =>
                batch.update(
                  doc(db, 'users', user.uid, 'quests', q.id),
                  cleanUpdateData({
                    completed: true,
                    failed: true,
                    completedAt: q.dueDate,
                    ...(isRecurring ? { seriesId: getQuestSeriesId(q) } : {}),
                    ...(spawnedId ? { spawnedNextQuestId: spawnedId } : {}),
                  })
                )
              );
            }

            for (const recurringQuest of newRecurringQuests) {
              ops.push((batch) =>
                batch.set(
                  doc(db, 'users', user.uid, 'quests', recurringQuest.id),
                  cleanData(recurringQuest)
                )
              );
            }

            for (let i = 0; i < ops.length; i += 400) {
              const batch = writeBatch(db);
              ops.slice(i, i + 400).forEach((fn) => fn(batch));
              batch.commit().catch((error) => {
                handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/quests`);
              });
            }
          }

          return overdueQuests.length;
        } finally {
          isAutoFailRunning = false;
        }
      },

      deduplicateQuests: () => {
        if (isDeduplicatingQuests) return 0;
        const state = get();
        if (state.user && !state.questsSynced) return 0;

        const duplicateIds = findDuplicateActiveRecurringQuestIds(state.quests, Date.now());
        if (duplicateIds.length === 0) return 0;

        isDeduplicatingQuests = true;
        try {
          const dupSet = new Set(duplicateIds);
          const remainingQuests = state.quests.filter((q) => !dupSet.has(q.id));
          set({ quests: remainingQuests });

          const { user } = state;
          if (user) {
            for (let i = 0; i < duplicateIds.length; i += 400) {
              const batch = writeBatch(db);
              duplicateIds.slice(i, i + 400).forEach((dupId) => {
                batch.delete(doc(db, 'users', user.uid, 'quests', dupId));
              });
              batch.commit().catch((error) => {
                handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/quests`);
              });
            }
          }

          return duplicateIds.length;
        } finally {
          isDeduplicatingQuests = false;
        }
      },

      toggleSubtask: (questId, subtaskId) => {
        triggerHapticFeedback(30);
        set((state) => ({
          quests: state.quests.map(q => q.id === questId ? {
            ...q,
            subtasks: q.subtasks?.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s)
          } : q)
        }));

        const { user, quests } = get();
        if (user) {
          const quest = quests.find(q => q.id === questId);
          if (quest) {
            updateDoc(doc(db, 'users', user.uid, 'quests', questId), cleanUpdateData({
              subtasks: quest.subtasks
            })).catch((error) => {
              handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/quests/${questId}`);
            });
          }
        }
      },

      deleteQuest: (id) => {
        const state = get();
        const quest = state.quests.find(q => q.id === id);
        if (!quest) return;

        const remainingQuests = state.quests.filter(q => q.id !== id);
        let newStats = { ...state.stats, skills: { ...state.stats.skills } };
        if (quest.completed && !quest.failed) {
          const nextOverall = adjustProgressionByDelta(newStats, -quest.xpReward, OVERALL_BASE_XP);
          newStats.level = nextOverall.level;
          newStats.xp = nextOverall.xp;
          newStats.xpToNextLevel = nextOverall.xpToNextLevel;

          const currentSkill = newStats.skills[quest.skill] || {
            level: 1,
            xp: 0,
            xpToNextLevel: SKILL_BASE_XP,
          };
          const nextSkillProg = adjustProgressionByDelta(currentSkill, -quest.xpReward, SKILL_BASE_XP);
          const refreshedLastWorked = getSkillLastWorkedFromHistory(remainingQuests, state.focusSessions)[quest.skill];
          const nextSkill: SkillStats = {
            ...currentSkill,
            ...nextSkillProg,
          };
          if (refreshedLastWorked !== null) {
            nextSkill.lastWorkedAt = refreshedLastWorked;
          } else {
            delete nextSkill.lastWorkedAt;
          }
          newStats.skills[quest.skill] = nextSkill;
        }

        set({
          quests: remainingQuests,
          stats: newStats
        });

        const { user } = get();
        if (user) {
          deleteDoc(doc(db, 'users', user.uid, 'quests', id)).catch((error) => {
            handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/quests/${id}`);
          });
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats })).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          });
        }
      },

      reopenQuest: (id) => {
        const state = get();
        const quest = state.quests.find(q => q.id === id);
        if (!quest || !quest.completed) return;

        const startOfTodayMs = getStartOfDayMs();
        let updatedDueDate = quest.dueDate;
        if (isValidTimestamp(quest.dueDate) && quest.dueDate < startOfTodayMs) {
          const newDue = new Date();
          if (quest.hasTime) {
            const oldDue = new Date(quest.dueDate);
            newDue.setHours(oldDue.getHours(), oldDue.getMinutes(), oldDue.getSeconds(), oldDue.getMilliseconds());
          } else {
            newDue.setHours(23, 59, 59, 999);
          }
          updatedDueDate = newDue.getTime();
        }

        // Remove any untouched open successor spawned by this recurring quest so reopening doesn't create duplicates
        const openSuccessors = findOpenSuccessorsForReopen(quest, state.quests);
        const successorIds = new Set(openSuccessors.map((s) => s.id));

        const newQuests = state.quests
          .filter((q) => !successorIds.has(q.id))
          .map(q => q.id === id ? {
            ...q,
            completed: false,
            failed: false,
            completedAt: undefined,
            spawnedNextQuestId: undefined,
            dueDate: updatedDueDate
          } : q);

        let newStats = { ...state.stats, skills: { ...state.stats.skills } };
        if (!quest.failed) {
          const nextOverall = adjustProgressionByDelta(newStats, -quest.xpReward, OVERALL_BASE_XP);
          newStats.level = nextOverall.level;
          newStats.xp = nextOverall.xp;
          newStats.xpToNextLevel = nextOverall.xpToNextLevel;

          const currentSkill = newStats.skills[quest.skill] || {
            level: 1,
            xp: 0,
            xpToNextLevel: SKILL_BASE_XP,
          };
          const nextSkillProg = adjustProgressionByDelta(currentSkill, -quest.xpReward, SKILL_BASE_XP);
          const refreshedLastWorked = getSkillLastWorkedFromHistory(newQuests, state.focusSessions)[quest.skill];
          const nextSkill: SkillStats = {
            ...currentSkill,
            ...nextSkillProg,
          };
          if (refreshedLastWorked !== null) {
            nextSkill.lastWorkedAt = refreshedLastWorked;
          } else {
            delete nextSkill.lastWorkedAt;
          }
          newStats.skills[quest.skill] = nextSkill;
        }
        set({ quests: newQuests, stats: newStats });

        const { user } = get();
        if (user) {
          const batch = writeBatch(db);
          batch.update(doc(db, 'users', user.uid, 'quests', id), {
            completed: false,
            failed: false,
            completedAt: deleteField(),
            spawnedNextQuestId: deleteField(),
            ...(updatedDueDate !== quest.dueDate ? { dueDate: updatedDueDate } : {})
          });
          for (const succ of openSuccessors) {
            batch.delete(doc(db, 'users', user.uid, 'quests', succ.id));
          }
          if (!quest.failed) {
            batch.update(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats }));
          }
          batch.commit().catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/quests/${id}`);
          });
        }
      },

      updateQuest: (id, updates) => {
        const state = get();
        const existing = state.quests.find((q) => q.id === id);
        if (!existing) return;

        const mergedRecurrence = updates.recurrence !== undefined ? updates.recurrence : existing.recurrence;
        const mergedRecurrenceDays =
          mergedRecurrence === 'weekly' || mergedRecurrence === 'monthly'
            ? [...(updates.recurrenceDays !== undefined ? updates.recurrenceDays : existing.recurrenceDays || [])].sort(
                (a, b) => a - b
              )
            : [];
        const mergedHasTime = updates.hasTime !== undefined ? updates.hasTime : existing.hasTime;

        const rawDueDate = 'dueDate' in updates ? updates.dueDate : existing.dueDate;
        let finalDueDate = isValidTimestamp(rawDueDate)
          ? normalizeDueDateTime(rawDueDate, mergedHasTime)
          : undefined;

        const isRecurring =
          existing.type !== 'habit' && Boolean(mergedRecurrence) && mergedRecurrence !== 'none';
        if (isRecurring && finalDueDate === undefined && !existing.completed) {
          finalDueDate = getInitialDueDateForRecurringQuest(
            mergedRecurrence,
            mergedRecurrenceDays,
            Date.now()
          );
        }

        const normalizedUpdates: Partial<Quest> = {
          ...updates,
          recurrenceDays: mergedRecurrenceDays,
          dueDate: finalDueDate,
          ...(isRecurring && !existing.seriesId ? { seriesId: getQuestSeriesId(existing) } : {}),
        };

        set((prevState) => ({
          quests: prevState.quests.map((q) => (q.id === id ? { ...q, ...normalizedUpdates } : q))
        }));

        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'quests', id), cleanUpdateData(normalizedUpdates)).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/quests/${id}`);
          });
        }
      },

      removeHabitCompletion: (questId, completionIndex) => {
        const state = get();
        const quest = state.quests.find(q => q.id === questId);
        if (!quest || !quest.completions || !quest.completions[completionIndex]) return;

        const completion = quest.completions[completionIndex];
        const isNegativeHabit = completion.direction === 'negative';
        const xpDelta = isNegativeHabit ? quest.xpReward : -quest.xpReward;

        const newCompletions = [...quest.completions];
        newCompletions.splice(completionIndex, 1);
        const newQuests = state.quests.map(q => q.id === questId ? { ...q, completions: newCompletions } : q);

        let newStats = { ...state.stats, skills: { ...state.stats.skills } };
        const nextOverall = adjustProgressionByDelta(newStats, xpDelta, OVERALL_BASE_XP);
        newStats.level = nextOverall.level;
        newStats.xp = nextOverall.xp;
        newStats.xpToNextLevel = nextOverall.xpToNextLevel;

        const currentSkill = newStats.skills[quest.skill] || {
          level: 1,
          xp: 0,
          xpToNextLevel: SKILL_BASE_XP,
        };
        const nextSkillProg = adjustProgressionByDelta(currentSkill, xpDelta, SKILL_BASE_XP);
        const refreshedLastWorked = getSkillLastWorkedFromHistory(newQuests, state.focusSessions)[quest.skill];
        const nextSkill: SkillStats = {
          ...currentSkill,
          ...nextSkillProg,
        };
        if (refreshedLastWorked !== null) {
          nextSkill.lastWorkedAt = refreshedLastWorked;
        } else {
          delete nextSkill.lastWorkedAt;
        }
        newStats.skills[quest.skill] = nextSkill;

        set({ quests: newQuests, stats: newStats });
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'quests', questId), cleanUpdateData({ completions: newCompletions })).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/quests/${questId}`);
          });
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats })).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          });
        }
      },

      gainXp: (skill, amount) => {
        const now = Date.now();
        let newStats = { ...get().stats, skills: { ...get().stats.skills } };
        const nextOverall = adjustProgressionByDelta(newStats, amount, OVERALL_BASE_XP);
        newStats.level = nextOverall.level;
        newStats.xp = nextOverall.xp;
        newStats.xpToNextLevel = nextOverall.xpToNextLevel;

        const currentSkill = newStats.skills[skill] || {
          level: 1,
          xp: 0,
          xpToNextLevel: SKILL_BASE_XP,
        };
        const nextSkillProg = adjustProgressionByDelta(currentSkill, amount, SKILL_BASE_XP);
        const nextSkill: SkillStats = {
          ...currentSkill,
          ...nextSkillProg,
        };
        if (amount > 0) {
          nextSkill.lastWorkedAt = Math.max(currentSkill.lastWorkedAt || 0, now);
          delete nextSkill.lastDecayAmount;
          delete nextSkill.lastDecayDemotedFrom;
        }
        newStats.skills[skill] = nextSkill;

        set({ stats: newStats });
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats })).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          });
        }
      },

      checkAndApplySkillDecay: () => {
        const state = get();
        if (state.user && (!state.isInitialized || !state.questsSynced || !state.focusSynced)) {
          return [];
        }

        const evaluation = evaluateWeeklySkillDecay({
          stats: state.stats,
          quests: state.quests,
          focusSessions: state.focusSessions,
          now: Date.now(),
        });

        if (evaluation.updated) {
          set({ stats: evaluation.nextStats });
          if (state.user) {
            updateDoc(
              doc(db, 'users', state.user.uid),
              cleanUpdateData({ stats: evaluation.nextStats })
            ).catch((error) => {
              handleFirestoreError(error, OperationType.UPDATE, `users/${state.user!.uid}`);
            });
          }
        }

        return evaluation.decayedSkills;
      },

      markNotified: (id) => {
        set((state) => ({ notifiedQuestIds: [...state.notifiedQuestIds, id] }));
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ notifiedQuestIds: get().notifiedQuestIds })).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          });
        }
      },

      recalculateStats: () => {
        const state = get();
        const newStats = calculateStatsFromHistory(state.quests, state.focusSessions, state.stats);
        set({ stats: newStats });
        if (state.user) {
          updateDoc(doc(db, 'users', state.user.uid), cleanUpdateData({ stats: newStats })).catch((error) => {
            handleFirestoreError(error, OperationType.UPDATE, `users/${state.user.uid}`);
          });
        }
      },

      syncWithFirestore: (userId) => {
        set({ questsSynced: false, focusSynced: false });
        const userDocRef = doc(db, 'users', userId);
        const questsColRef = collection(db, 'users', userId, 'quests');
        const diaryColRef = collection(db, 'users', userId, 'diaryEntries');
        const visionsColRef = collection(db, 'users', userId, 'visions');
        const focusColRef = collection(db, 'users', userId, 'focusSessions');
        const deepColRef = collection(db, 'users', userId, 'deepTrainings');
        const foodColRef = collection(db, 'users', userId, 'foodEntries');
        const weeklyCoachSummariesColRef = collection(db, 'users', userId, 'weeklyCoachSummaries');
        const weeklyRetrospectivesColRef = collection(db, 'users', userId, 'weeklyRetrospectives');
        const healthRecordsColRef = collection(db, 'users', userId, 'healthRecords');

        // Initial check: if user doc doesn't exist, upload current local state
        getDoc(userDocRef)
          .then((docSnap) => {
            if (!docSnap.exists()) {
              const state = get();
              const initialStats = calculateStatsFromHistory(state.quests, state.focusSessions, state.stats);
              const handleSeedError = (path: string) => (err: unknown) => {
                handleFirestoreError(err, OperationType.CREATE, path);
              };
              setDoc(userDocRef, cleanData({
                stats: initialStats,
                widgetOrder: state.widgetOrder,
                notifiedQuestIds: state.notifiedQuestIds,
                lastTrainingGeneratedDate: state.lastTrainingGeneratedDate,
                settings: state.settings
              })).catch(handleSeedError(`users/${userId}`));
              state.quests.forEach(q => setDoc(doc(questsColRef, q.id), cleanData(q)).catch(handleSeedError(`users/${userId}/quests/${q.id}`)));
              state.diaryEntries.forEach(e => setDoc(doc(diaryColRef, e.id), cleanData(e)).catch(handleSeedError(`users/${userId}/diaryEntries/${e.id}`)));
              state.visions.forEach(v => setDoc(doc(visionsColRef, v.id), cleanData(v)).catch(handleSeedError(`users/${userId}/visions/${v.id}`)));
              state.focusSessions.forEach(f => setDoc(doc(focusColRef, f.id), cleanData(f)).catch(handleSeedError(`users/${userId}/focusSessions/${f.id}`)));
              state.deepTrainings.forEach(d => setDoc(doc(deepColRef, d.id), cleanData(d)).catch(handleSeedError(`users/${userId}/deepTrainings/${d.id}`)));
              state.foodEntries.forEach(f => setDoc(doc(foodColRef, f.id), cleanData(f)).catch(handleSeedError(`users/${userId}/foodEntries/${f.id}`)));
              state.weeklyCoachSummaries.forEach(w => setDoc(doc(weeklyCoachSummariesColRef, w.id), cleanData(w)).catch(handleSeedError(`users/${userId}/weeklyCoachSummaries/${w.id}`)));
              state.weeklyRetrospectives.forEach(r => setDoc(doc(weeklyRetrospectivesColRef, r.id), cleanData(r)).catch(handleSeedError(`users/${userId}/weeklyRetrospectives/${r.id}`)));
              state.healthRecords.forEach(h => setDoc(doc(healthRecordsColRef, h.id), cleanData(h)).catch(handleSeedError(`users/${userId}/healthRecords/${h.id}`)));
            }
          })
          .catch((error) => {
            handleFirestoreError(error, OperationType.GET, `users/${userId}`);
          });

        const unsubUser = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data() || {};
            const state = get();
            const mergedSettings = sanitizeSettings(data.settings, state.settings);
            // Only auto-lock once on initial load if pin is enabled
            if (mergedSettings.isPinEnabled && !state.isInitialized) {
              set({ isLocked: true });
            }

            const loadedStats = sanitizeStats(data.stats || state.stats);
            const newStats = calculateStatsFromHistory(state.quests, state.focusSessions, loadedStats);

            set({ 
              stats: newStats,
              widgetOrder: Array.isArray(data.widgetOrder)
                ? sanitizeWidgetOrder(data.widgetOrder)
                : sanitizeWidgetOrder(state.widgetOrder),
              notifiedQuestIds: Array.isArray(data.notifiedQuestIds) ? data.notifiedQuestIds : state.notifiedQuestIds,
              settings: mergedSettings,
              lastTrainingGeneratedDate: typeof data.lastTrainingGeneratedDate === 'string'
                ? data.lastTrainingGeneratedDate
                : state.lastTrainingGeneratedDate
            });
            
            set({ isInitialized: true });
          } else {
            set({ isInitialized: true });
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${userId}`);
          set({ isInitialized: true });
        });

        const unsubQuests = onSnapshot(questsColRef, (snapshot) => {
          const quests: Quest[] = [];
          snapshot.forEach((doc) => {
            const raw = doc.data() as Quest;
            if (raw && typeof raw === 'object') {
              quests.push({
                ...raw,
                createdAt: toEpochMs(raw.createdAt, Date.now()),
                ...(raw.dueDate !== undefined ? { dueDate: toEpochMs(raw.dueDate, Date.now()) } : {}),
                ...(raw.completedAt !== undefined ? { completedAt: toEpochMs(raw.completedAt, Date.now()) } : {}),
              });
            }
          });
          const state = get();
          const newStats = calculateStatsFromHistory(quests, state.focusSessions, state.stats);
          set({ quests, stats: newStats, questsSynced: true });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/quests`);
          set({ questsSynced: true });
        });

        const unsubDiary = onSnapshot(diaryColRef, (snapshot) => {
          const diaryEntries: DiaryEntry[] = [];
          snapshot.forEach((doc) => {
            const raw = doc.data() as DiaryEntry;
            if (raw && typeof raw === 'object') {
              diaryEntries.push({
                ...raw,
                date: toEpochMs(raw.date, Date.now()),
              });
            }
          });
          set({ diaryEntries: diaryEntries.sort((a, b) => b.date - a.date) });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/diaryEntries`);
        });

        const unsubVisions = onSnapshot(visionsColRef, (snapshot) => {
          const visions: Vision[] = [];
          snapshot.forEach((doc) => visions.push(doc.data() as Vision));
          set({ visions });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/visions`);
        });

        const unsubFocus = onSnapshot(focusColRef, (snapshot) => {
          const focusSessions: FocusSession[] = [];
          snapshot.forEach((doc) => {
            const raw = doc.data() as FocusSession;
            if (raw && typeof raw === 'object') {
              focusSessions.push({
                ...raw,
                completedAt: toEpochMs(raw.completedAt, Date.now()),
              });
            }
          });
          const state = get();
          const newStats = calculateStatsFromHistory(state.quests, focusSessions, state.stats);
          set({ focusSessions, stats: newStats, focusSynced: true });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/focusSessions`);
          set({ focusSynced: true });
        });

        const unsubDeep = onSnapshot(deepColRef, (snapshot) => {
          const deepTrainings: DeepTraining[] = [];
          snapshot.forEach((doc) => deepTrainings.push(doc.data() as DeepTraining));
          set({ deepTrainings });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/deepTrainings`);
        });

        const unsubFood = onSnapshot(foodColRef, (snapshot) => {
          const foodEntries: FoodEntry[] = [];
          snapshot.forEach((doc) => {
            const raw = doc.data() as FoodEntry;
            if (raw && typeof raw === 'object') {
              foodEntries.push({
                ...raw,
                date: toEpochMs(raw.date, Date.now()),
              });
            }
          });
          set({ foodEntries: foodEntries.sort((a, b) => b.date - a.date) });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/foodEntries`);
        });

        const unsubWeeklyCoachSummaries = onSnapshot(weeklyCoachSummariesColRef, (snapshot) => {
          const weeklyCoachSummaries: WeeklyCoachSummary[] = [];
          snapshot.forEach((doc) => {
            const raw = doc.data() as WeeklyCoachSummary;
            if (raw && typeof raw === 'object') {
              weeklyCoachSummaries.push({
                ...raw,
                weekStart: toEpochMs(raw.weekStart, Date.now()),
                generatedAt: toEpochMs(raw.generatedAt, Date.now()),
              });
            }
          });
          set({ weeklyCoachSummaries: weeklyCoachSummaries.sort((a, b) => b.weekStart - a.weekStart) });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/weeklyCoachSummaries`);
        });

        const unsubWeeklyRetrospectives = onSnapshot(weeklyRetrospectivesColRef, (snapshot) => {
          const weeklyRetrospectives: WeeklyRetrospective[] = [];
          snapshot.forEach((doc) => {
            const raw = doc.data() as WeeklyRetrospective;
            if (raw && typeof raw === 'object') {
              weeklyRetrospectives.push({
                ...raw,
                weekStart: toEpochMs(raw.weekStart, Date.now()),
                weekEnd: toEpochMs(raw.weekEnd, Date.now()),
                generatedAt: toEpochMs(raw.generatedAt, Date.now()),
              });
            }
          });
          set({ weeklyRetrospectives: weeklyRetrospectives.sort((a, b) => b.weekStart - a.weekStart) });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/weeklyRetrospectives`);
        });

        const unsubHealthRecords = onSnapshot(healthRecordsColRef, (snapshot) => {
          const healthRecords: HealthDailyRecord[] = [];
          snapshot.forEach((doc) => {
            const clean = sanitizeHealthRecordItem(doc.data());
            if (clean) healthRecords.push(clean);
          });
          set({ healthRecords: healthRecords.sort((a, b) => b.date - a.date) });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/healthRecords`);
        });

        return () => {
          unsubUser();
          unsubQuests();
          unsubDiary();
          unsubVisions();
          unsubFocus();
          unsubDeep();
          unsubFood();
          unsubWeeklyCoachSummaries();
          unsubWeeklyRetrospectives();
          unsubHealthRecords();
        };
      }
    }),
    {
      name: 'rpg-storage',
      version: 1,
      partialize: (state) => {
        const {
          user,
          loading,
          isInitialized,
          isLocked,
          questsSynced,
          focusSynced,
          ...persistedState
        } = state;
        return persistedState;
      },
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Migrate skill names from English to German
          const skillMapping: Record<string, string> = {
            'Focus': 'Fokus',
            'Discipline': 'Disziplin',
            'Knowledge': 'Wissen',
            'Social': 'Soziales'
          };
          
          if (persistedState.stats?.skills) {
            const newSkills: any = {
              Fitness: { level: 1, xp: 0, xpToNextLevel: 50 },
              Fokus: { level: 1, xp: 0, xpToNextLevel: 50 },
              Disziplin: { level: 1, xp: 0, xpToNextLevel: 50 },
              Wissen: { level: 1, xp: 0, xpToNextLevel: 50 },
              Soziales: { level: 1, xp: 0, xpToNextLevel: 50 },
            };
            Object.entries(persistedState.stats.skills).forEach(([key, value]) => {
              const newKey = skillMapping[key] || key;
              if (newSkills[newKey]) {
                 newSkills[newKey] = { ...newSkills[newKey], ...(value as any) };
              } else {
                 newSkills[newKey] = value;
              }
            });
            persistedState.stats.skills = newSkills;
          }

          if (persistedState.quests) {
            persistedState.quests = persistedState.quests.map((q: any) => ({
              ...q,
              skill: skillMapping[q.skill] || q.skill
            }));
          }
        }
        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        queueMicrotask(() => {
          try {
            const safeSettings = sanitizeSettings(state.settings);
            const safeStats = sanitizeStats(state.stats);
            const rawSafeQuests = Array.isArray(state.quests) ? state.quests : [];
            const dupIds = new Set(findDuplicateActiveRecurringQuestIds(rawSafeQuests));
            const safeQuests = dupIds.size > 0
              ? rawSafeQuests.filter((q) => !dupIds.has(q.id))
              : rawSafeQuests;
            const safeFocus = Array.isArray(state.focusSessions) ? state.focusSessions : [];
            const safeDiary = Array.isArray(state.diaryEntries) ? state.diaryEntries : [];
            const safeVisions = Array.isArray(state.visions) ? state.visions : [];
            const safeFood = Array.isArray(state.foodEntries) ? state.foodEntries : [];
            const safeDeep = Array.isArray(state.deepTrainings) ? state.deepTrainings : [];
            const safeSummaries = Array.isArray(state.weeklyCoachSummaries) ? state.weeklyCoachSummaries : [];
            const safeRetros = Array.isArray(state.weeklyRetrospectives) ? state.weeklyRetrospectives : [];
            const safeNotified = Array.isArray(state.notifiedQuestIds) ? state.notifiedQuestIds : [];
            const safeOrder = sanitizeWidgetOrder(state.widgetOrder);
            const safeHealth = Array.isArray(state.healthRecords)
              ? state.healthRecords
                  .map(sanitizeHealthRecordItem)
                  .filter((r): r is HealthDailyRecord => r !== null)
              : [];

            const recalculated = calculateStatsFromHistory(safeQuests, safeFocus, safeStats);
            useStore.setState({
              settings: safeSettings,
              stats: recalculated,
              quests: safeQuests,
              focusSessions: safeFocus,
              diaryEntries: safeDiary,
              visions: safeVisions,
              foodEntries: safeFood,
              deepTrainings: safeDeep,
              weeklyCoachSummaries: safeSummaries,
              weeklyRetrospectives: safeRetros,
              notifiedQuestIds: safeNotified,
              widgetOrder: safeOrder,
              healthRecords: safeHealth,
              ...(safeSettings.isPinEnabled ? { isLocked: true } : {}),
            });
          } catch (err) {
            console.error('Store rehydration normalization error:', err);
          }
        });
      }
    }
  )
);
