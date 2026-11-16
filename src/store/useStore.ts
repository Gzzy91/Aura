import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserStats, SkillStats, Quest, SkillType, DiaryEntry, Vision, FocusSession, DeepTraining, FoodEntry, WeeklyCoachSummary, HealthDailyRecord } from '../types';
import { User } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { toast } from 'sonner';
import { triggerHapticFeedback } from '@/lib/utils';
import { isSameDay, format, startOfDay } from 'date-fns';
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
  deleteField
} from 'firebase/firestore';

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
  isLocked: boolean;
  settings: {
    isPinEnabled: boolean;
    pin: string | null;
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
  healthRecords: HealthDailyRecord[];
  lastTrainingGeneratedDate: string | null;
  setUser: (user: User | null) => void;
  setInitialized: (val: boolean) => void;
  setLocked: (val: boolean) => void;
  updateSettings: (updates: Partial<{ isPinEnabled: boolean; pin: string | null }>) => void;
  addQuest: (quest: Omit<Quest, 'id' | 'completed' | 'createdAt'>) => void;
  completeQuest: (id: string, isNegativeHabit?: boolean, customDate?: number) => number | void;
  failQuest: (id: string) => void;
  autoFailOverdueQuests: () => number;
  toggleSubtask: (questId: string, subtaskId: string) => void;
  deleteQuest: (id: string) => void;
  reopenQuest: (id: string) => void;
  updateQuest: (id: string, updates: Partial<Omit<Quest, 'id' | 'completed' | 'createdAt'>>) => void;
  removeHabitCompletion: (questId: string, completionIndex: number) => void;
  gainXp: (skill: SkillType, amount: number) => void;
  markNotified: (id: string) => void;
  addDiaryEntry: (entry: Omit<DiaryEntry, 'id'>) => void;
  updateDiaryEntry: (id: string, updates: Partial<Omit<DiaryEntry, 'id'>>) => void;
  deleteDiaryEntry: (id: string) => void;
  setDailyMood: (mood: number, targetDate?: Date) => Promise<void>;
  saveWeeklyCoachSummary: (summary: WeeklyCoachSummary) => Promise<void>;
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

const SKILL_MAPPING: Record<string, SkillType> = {
  'Focus': 'Fokus',
  'Discipline': 'Disziplin',
  'Knowledge': 'Wissen',
  'Social': 'Soziales',
  'Fitness': 'Fitness',
  'Fokus': 'Fokus',
  'Disziplin': 'Disziplin',
  'Wissen': 'Wissen',
  'Soziales': 'Soziales'
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

  const ALL_SKILLS: SkillType[] = ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'];
  
  const skillsResult: Record<SkillType, SkillStats> = {
    Fitness: { level: 1, xp: 0, xpToNextLevel: 50 },
    Fokus: { level: 1, xp: 0, xpToNextLevel: 50 },
    Disziplin: { level: 1, xp: 0, xpToNextLevel: 50 },
    Wissen: { level: 1, xp: 0, xpToNextLevel: 50 },
    Soziales: { level: 1, xp: 0, xpToNextLevel: 50 },
  };

  let totalOverallXp = 0;

  for (const skill of ALL_SKILLS) {
    const rawXp = Math.max(0, skillXpMap[skill] || 0);
    totalOverallXp += rawXp;

    let level = 1;
    let xp = rawXp;
    let xpToNextLevel = 50;
    while (xp >= xpToNextLevel) {
      xp -= xpToNextLevel;
      level += 1;
      xpToNextLevel = Math.floor(xpToNextLevel * 1.5);
    }

    skillsResult[skill] = { level, xp, xpToNextLevel };
  }

  let overallLevel = 1;
  let overallXp = totalOverallXp;
  let overallXpToNextLevel = 100;
  while (overallXp >= overallXpToNextLevel) {
    overallXp -= overallXpToNextLevel;
    overallLevel += 1;
    overallXpToNextLevel = Math.floor(overallXpToNextLevel * 1.5);
  }

  const baseStats = currentStats || INITIAL_STATS;

  const finalLevel = Math.max(overallLevel, baseStats.level || 1);
  const finalXp = finalLevel > overallLevel ? (baseStats.xp || 0) : overallXp;
  const finalXpToNextLevel = finalLevel > overallLevel ? (baseStats.xpToNextLevel || 100) : overallXpToNextLevel;

  const mergedSkills: Record<SkillType, SkillStats> = {} as any;
  for (const skill of ALL_SKILLS) {
    const calc = skillsResult[skill];
    const existing = baseStats.skills?.[skill];
    if (existing && existing.level > calc.level) {
      mergedSkills[skill] = existing;
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

function computeSingleNextRecurrence(
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
      for (let i = 1; i <= 7; i++) {
        const nextDate = new Date(base);
        nextDate.setDate(base.getDate() + i);
        if (recurrenceDays.includes(nextDate.getDay())) {
          return nextDate.getTime();
        }
      }
    }
    const fallback = new Date(base);
    fallback.setDate(fallback.getDate() + 7);
    return fallback.getTime();
  }
  // monthly
  if (recurrenceDays && recurrenceDays.length > 0) {
    const sortedDays = [...recurrenceDays].sort((a, b) => a - b);
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
      const lastDayOfMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      for (const day of sortedDays) {
        const candidate = new Date(monthStart);
        candidate.setDate(Math.min(day, lastDayOfMonth));
        if (candidate.getTime() > base.getTime()) {
          return candidate.getTime();
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

function getNextRecurrenceTimestamp(
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

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: true,
      isInitialized: false,
      questsSynced: false,
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
      widgetOrder: ['level', 'streak', 'mood', 'energy_recovery', 'weekly_summary', 'food_mood_correlation', 'chart', 'recurring_chart', 'calendar', 'today', 'reminders', 'settings'],
      deepTrainings: [],
      foodEntries: [],
      weeklyCoachSummaries: [],
      healthRecords: [],
      lastTrainingGeneratedDate: null,
      
      setUser: (user) => set({ user, loading: false, ...(user ? {} : { questsSynced: false }) }),
      setInitialized: (val) => set({ isInitialized: val }),
      setLocked: (val) => set({ isLocked: val }),
      
      addDeepTraining: (training) => {
        set((state) => ({ deepTrainings: [...state.deepTrainings, training] }));
        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'deepTrainings', training.id), cleanData(training));
        }
      },
      
      setLastTrainingGeneratedDate: (dateStr) => {
        set({ lastTrainingGeneratedDate: dateStr });
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ lastTrainingGeneratedDate: dateStr }));
        }
      },

      updateSettings: (updates) => {
        const { user, settings } = get();
        const newSettings = { ...settings, ...updates };
        set({ settings: newSettings });
        triggerHapticFeedback();
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ settings: newSettings }));
        }
      },

      updateWidgetOrder: (order) => {
        set({ widgetOrder: order });
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ widgetOrder: order }));
        }
      },

      addVision: (visionData) => {
        const id = crypto.randomUUID();
        const vision: Vision = { ...visionData, id, completed: false, createdAt: Date.now() };
        set(state => ({ visions: [...state.visions, vision] }));
        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'visions', id), cleanData(vision));
        }
      },

      updateVision: (id, updates) => {
        set(state => ({
          visions: state.visions.map(v => v.id === id ? { ...v, ...updates } : v)
        }));
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'visions', id), cleanUpdateData(updates));
        }
      },

      deleteVision: (id) => {
        set(state => ({
          visions: state.visions.filter(v => v.id !== id)
        }));
        const { user } = get();
        if (user) {
          deleteDoc(doc(db, 'users', user.uid, 'visions', id));
        }
      },

      addFocusSession: (sessionData) => {
        const id = crypto.randomUUID();
        const session: FocusSession = { ...sessionData, id };
        set(state => ({ focusSessions: [...state.focusSessions, session] }));
        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'focusSessions', id), cleanData(session));
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
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats }));
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
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats }));
        }
      },

      addQuest: (questData) => {
        const id = crypto.randomUUID();
        const quest: Quest = { ...questData, id, completed: false, createdAt: Date.now() };
        
        set((state) => ({
          quests: [...state.quests, quest]
        }));

        const { user } = get();
        if (user) {
          setDoc(doc(db, 'users', user.uid, 'quests', id), cleanData(quest));
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

      saveHealthRecord: async (record) => {
        const sanitized: HealthDailyRecord = {
          id: record.id,
          date: Math.round(record.date),
          sleepDurationMinutes: Math.max(0, Math.min(1440, Math.round(record.sleepDurationMinutes))),
          activityDurationMinutes: Math.max(0, Math.min(1440, Math.round(record.activityDurationMinutes))),
          avgHeartRate:
            typeof record.avgHeartRate === 'number'
              ? Math.max(25, Math.min(240, Math.round(record.avgHeartRate)))
              : null,
          sources: Array.from(new Set(record.sources)).slice(0, 6),
          recoveryScore: Math.max(0, Math.min(100, Math.round(record.recoveryScore))),
          recoveryState: record.recoveryState,
          acceptedSuggestionIds: (record.acceptedSuggestionIds || []).slice(0, 25),
          dismissedSuggestionIds: (record.dismissedSuggestionIds || []).slice(0, 25),
          syncedAt: Math.round(record.syncedAt || Date.now()),
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
          try {
            setDoc(doc(db, 'users', user.uid, 'foodEntries', id), cleanData(entry));
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/foodEntries/${id}`);
          }
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
          try {
            updateDoc(doc(db, 'users', user.uid, 'foodEntries', id), cleanUpdateData(updates));
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/foodEntries/${id}`);
          }
        }
      },

      deleteFoodEntry: (id) => {
        set((state) => ({
          foodEntries: state.foodEntries.filter(e => e.id !== id)
        }));

        const { user } = get();
        if (user) {
          try {
            deleteDoc(doc(db, 'users', user.uid, 'foodEntries', id));
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/foodEntries/${id}`);
          }
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

        if (isNegativeHabit) {
          newStats.xp -= quest.xpReward;
          while (newStats.xp < 0 && newStats.level > 1) {
            newStats.level -= 1;
            newStats.xpToNextLevel = Math.ceil(newStats.xpToNextLevel / 1.5);
            newStats.xp += newStats.xpToNextLevel;
          }
          if (newStats.xp < 0) newStats.xp = 0;

          const skillStats = { ...(newStats.skills[quest.skill] || { level: 1, xp: 0, xpToNextLevel: 50 }) };
          skillStats.xp -= quest.xpReward;
          while (skillStats.xp < 0 && skillStats.level > 1) {
            skillStats.level -= 1;
            skillStats.xpToNextLevel = Math.ceil(skillStats.xpToNextLevel / 1.5);
            skillStats.xp += skillStats.xpToNextLevel;
          }
          if (skillStats.xp < 0) skillStats.xp = 0;
          newStats.skills[quest.skill] = skillStats;
        } else {
          newStats.xp += quest.xpReward;
          while (newStats.xp >= newStats.xpToNextLevel) {
            newStats.xp -= newStats.xpToNextLevel;
            newStats.level += 1;
            newStats.xpToNextLevel = Math.floor(newStats.xpToNextLevel * 1.5);
          }

          const skillStats = { ...(newStats.skills[quest.skill] || { level: 1, xp: 0, xpToNextLevel: 50 }) };
          skillStats.xp += quest.xpReward;
          while (skillStats.xp >= skillStats.xpToNextLevel) {
            skillStats.xp -= skillStats.xpToNextLevel;
            skillStats.level += 1;
            skillStats.xpToNextLevel = Math.floor(skillStats.xpToNextLevel * 1.5);
          }
          newStats.skills[quest.skill] = skillStats;
        }

        if (quest.type === 'habit') {
          const newCompletion = { date: actionTimestamp, direction: isNegativeHabit ? 'negative' as const : 'positive' as const };
          nextQuests = state.quests.map(q => q.id === id ? { 
            ...q, 
            completions: [...(q.completions || []), newCompletion] 
          } : q);
          
          if (user) {
            updateDoc(doc(db, 'users', user.uid, 'quests', id), cleanUpdateData({
              completions: nextQuests.find(q => q.id === id)?.completions
            }));
          }

          set({ quests: nextQuests, stats: newStats });
          if (user) {
            updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats }));
          }
          return actionTimestamp;
        } else {
          nextQuests = state.quests.map(q => q.id === id ? { ...q, completed: true, completedAt: Date.now() } : q);
          
          if (user) {
            updateDoc(doc(db, 'users', user.uid, 'quests', id), cleanUpdateData({
              completed: true,
              completedAt: Date.now()
            })).catch(error => {
              console.error("Firestore update failed:", error);
              toast.error("Fehler beim Speichern der Quest");
            });
          }

          if (quest.recurrence && quest.recurrence !== 'none') {
            const nextDueDate = getNextRecurrenceTimestamp(
              quest.dueDate || Date.now(),
              quest.recurrence,
              quest.recurrenceDays
            );

            const recurringQuest: Quest = {
              ...quest,
              id: crypto.randomUUID(),
              completed: false,
              completedAt: undefined,
              createdAt: Date.now(),
              dueDate: nextDueDate,
              subtasks: quest.subtasks?.map(s => ({ ...s, completed: false }))
            };
            nextQuests.push(recurringQuest);
            
            if (user) {
              setDoc(doc(db, 'users', user.uid, 'quests', recurringQuest.id), cleanData(recurringQuest));
            }
          }
        }

        set({ quests: nextQuests, stats: newStats });
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats }));
        }
      },

      failQuest: (id) => {
        const state = get();
        const quest = state.quests.find(q => q.id === id);
        if (!quest || quest.completed) return;

        triggerHapticFeedback([40, 40]);

        const { user } = get();
        let nextQuests = state.quests.map(q => q.id === id ? {
          ...q,
          completed: true,
          failed: true,
          completedAt: Date.now()
        } : q);

        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'quests', id), cleanUpdateData({
            completed: true,
            failed: true,
            completedAt: Date.now()
          })).catch(error => {
            console.error("Firestore update failed:", error);
            toast.error("Fehler beim Aktualisieren der Quest");
          });
        }

        if (quest.recurrence && quest.recurrence !== 'none') {
          const nextDueDate = getNextRecurrenceTimestamp(
            quest.dueDate || Date.now(),
            quest.recurrence,
            quest.recurrenceDays
          );

          const recurringQuest: Quest = {
            ...quest,
            id: crypto.randomUUID(),
            completed: false,
            failed: false,
            completedAt: undefined,
            createdAt: Date.now(),
            dueDate: nextDueDate,
            subtasks: quest.subtasks?.map(s => ({ ...s, completed: false }))
          };
          nextQuests.push(recurringQuest);

          if (user) {
            setDoc(doc(db, 'users', user.uid, 'quests', recurringQuest.id), cleanData(recurringQuest));
          }
        }

        set({ quests: nextQuests });
      },

      autoFailOverdueQuests: () => {
        const state = get();
        if (state.user && !state.questsSynced) return 0;

        const startOfTodayMs = startOfDay(new Date()).getTime();
        const overdueQuests = state.quests.filter(
          (q) =>
            q.type !== 'habit' &&
            !q.completed &&
            typeof q.dueDate === 'number' &&
            q.dueDate < startOfTodayMs
        );

        if (overdueQuests.length === 0) return 0;

        const overdueIds = new Set(overdueQuests.map((q) => q.id));
        const { user } = state;

        const nextQuests: Quest[] = state.quests.map((q) =>
          overdueIds.has(q.id)
            ? {
                ...q,
                completed: true,
                failed: true,
                completedAt: q.dueDate,
              }
            : q
        );

        const newRecurringQuests: Quest[] = [];

        for (const q of overdueQuests) {
          if (user) {
            updateDoc(
              doc(db, 'users', user.uid, 'quests', q.id),
              cleanUpdateData({
                completed: true,
                failed: true,
                completedAt: q.dueDate,
              })
            ).catch((error) => {
              handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/quests/${q.id}`);
            });
          }

          if (q.recurrence && q.recurrence !== 'none' && typeof q.dueDate === 'number') {
            const nextDueDate = getNextRecurrenceTimestamp(
              q.dueDate,
              q.recurrence,
              q.recurrenceDays,
              startOfTodayMs
            );

            const alreadyExists = [...nextQuests, ...newRecurringQuests].some(
              (existing) =>
                !existing.completed &&
                existing.type !== 'habit' &&
                existing.title === q.title &&
                existing.recurrence === q.recurrence &&
                typeof existing.dueDate === 'number' &&
                isSameDay(new Date(existing.dueDate), new Date(nextDueDate))
            );

            if (!alreadyExists) {
              const recurringQuest: Quest = {
                ...q,
                id: crypto.randomUUID(),
                completed: false,
                failed: false,
                completedAt: undefined,
                createdAt: Date.now(),
                dueDate: nextDueDate,
                subtasks: q.subtasks?.map((s) => ({ ...s, completed: false })),
              };
              newRecurringQuests.push(recurringQuest);
            }
          }
        }

        const finalQuests = [...nextQuests, ...newRecurringQuests];
        set({ quests: finalQuests });

        if (user) {
          for (const recurringQuest of newRecurringQuests) {
            setDoc(
              doc(db, 'users', user.uid, 'quests', recurringQuest.id),
              cleanData(recurringQuest)
            ).catch((error) => {
              handleFirestoreError(
                error,
                OperationType.CREATE,
                `users/${user.uid}/quests/${recurringQuest.id}`
              );
            });
          }
        }

        return overdueQuests.length;
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
            }));
          }
        }
      },

      deleteQuest: (id) => {
        const state = get();
        const quest = state.quests.find(q => q.id === id);
        if (!quest) return;

        let newStats = { ...state.stats, skills: { ...state.stats.skills } };
        if (quest.completed && !quest.failed) {
          newStats.xp -= quest.xpReward;
          while (newStats.xp < 0 && newStats.level > 1) {
            newStats.level -= 1;
            newStats.xpToNextLevel = Math.ceil(newStats.xpToNextLevel / 1.5);
            newStats.xp += newStats.xpToNextLevel;
          }
          if (newStats.xp < 0) newStats.xp = 0;
          const skillStats = { ...newStats.skills[quest.skill] };
          skillStats.xp -= quest.xpReward;
          while (skillStats.xp < 0 && skillStats.level > 1) {
            skillStats.level -= 1;
            skillStats.xpToNextLevel = Math.ceil(skillStats.xpToNextLevel / 1.5);
            skillStats.xp += skillStats.xpToNextLevel;
          }
          if (skillStats.xp < 0) skillStats.xp = 0;
          newStats.skills[quest.skill] = skillStats;
        }

        set({
          quests: state.quests.filter(q => q.id !== id),
          stats: newStats
        });

        const { user } = get();
        if (user) {
          deleteDoc(doc(db, 'users', user.uid, 'quests', id));
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats }));
        }
      },

      reopenQuest: (id) => {
        const state = get();
        const quest = state.quests.find(q => q.id === id);
        if (!quest || !quest.completed) return;

        let newStats = { ...state.stats, skills: { ...state.stats.skills } };
        if (!quest.failed) {
          newStats.xp -= quest.xpReward;
          while (newStats.xp < 0 && newStats.level > 1) {
            newStats.level -= 1;
            newStats.xpToNextLevel = Math.ceil(newStats.xpToNextLevel / 1.5);
            newStats.xp += newStats.xpToNextLevel;
          }
          if (newStats.xp < 0) newStats.xp = 0;
          const skillStats = { ...newStats.skills[quest.skill] };
          skillStats.xp -= quest.xpReward;
          while (skillStats.xp < 0 && skillStats.level > 1) {
            skillStats.level -= 1;
            skillStats.xpToNextLevel = Math.ceil(skillStats.xpToNextLevel / 1.5);
            skillStats.xp += skillStats.xpToNextLevel;
          }
          if (skillStats.xp < 0) skillStats.xp = 0;
          newStats.skills[quest.skill] = skillStats;
        }

        const startOfTodayMs = startOfDay(new Date()).getTime();
        let updatedDueDate = quest.dueDate;
        if (typeof quest.dueDate === 'number' && quest.dueDate < startOfTodayMs) {
          const newDue = new Date();
          if (quest.hasTime) {
            const oldDue = new Date(quest.dueDate);
            newDue.setHours(oldDue.getHours(), oldDue.getMinutes(), oldDue.getSeconds(), oldDue.getMilliseconds());
          } else {
            newDue.setHours(23, 59, 59, 999);
          }
          updatedDueDate = newDue.getTime();
        }

        const newQuests = state.quests.map(q => q.id === id ? {
          ...q,
          completed: false,
          failed: false,
          completedAt: undefined,
          dueDate: updatedDueDate
        } : q);
        set({ quests: newQuests, stats: newStats });

        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'quests', id), {
            completed: false,
            failed: false,
            completedAt: deleteField(),
            ...(updatedDueDate !== quest.dueDate ? { dueDate: updatedDueDate } : {})
          });
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats }));
        }
      },

      updateQuest: (id, updates) => {
        set((state) => ({
          quests: state.quests.map(q => q.id === id ? { ...q, ...updates } : q)
        }));

        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'quests', id), cleanUpdateData(updates));
        }
      },

      removeHabitCompletion: (questId, completionIndex) => {
        const state = get();
        const quest = state.quests.find(q => q.id === questId);
        if (!quest || !quest.completions || !quest.completions[completionIndex]) return;

        const completion = quest.completions[completionIndex];
        const isNegativeHabit = completion.direction === 'negative';
        let newStats = { ...state.stats, skills: { ...state.stats.skills } };
        
        if (isNegativeHabit) {
          newStats.xp += quest.xpReward;
          while (newStats.xp >= newStats.xpToNextLevel) {
            newStats.xp -= newStats.xpToNextLevel;
            newStats.level += 1;
            newStats.xpToNextLevel = Math.floor(newStats.xpToNextLevel * 1.5);
          }
          const skillStats = { ...(newStats.skills[quest.skill] || { level: 1, xp: 0, xpToNextLevel: 50 }) };
          skillStats.xp += quest.xpReward;
          while (skillStats.xp >= skillStats.xpToNextLevel) {
            skillStats.xp -= skillStats.xpToNextLevel;
            skillStats.level += 1;
            skillStats.xpToNextLevel = Math.floor(skillStats.xpToNextLevel * 1.5);
          }
          newStats.skills[quest.skill] = skillStats;
        } else {
          newStats.xp -= quest.xpReward;
          while (newStats.xp < 0 && newStats.level > 1) {
            newStats.level -= 1;
            newStats.xpToNextLevel = Math.ceil(newStats.xpToNextLevel / 1.5);
            newStats.xp += newStats.xpToNextLevel;
          }
          if (newStats.xp < 0) newStats.xp = 0;
          const skillStats = { ...(newStats.skills[quest.skill] || { level: 1, xp: 0, xpToNextLevel: 50 }) };
          skillStats.xp -= quest.xpReward;
          while (skillStats.xp < 0 && skillStats.level > 1) {
            skillStats.level -= 1;
            skillStats.xpToNextLevel = Math.ceil(skillStats.xpToNextLevel / 1.5);
            skillStats.xp += skillStats.xpToNextLevel;
          }
          if (skillStats.xp < 0) skillStats.xp = 0;
          newStats.skills[quest.skill] = skillStats;
        }

        const newCompletions = [...quest.completions];
        newCompletions.splice(completionIndex, 1);
        const newQuests = state.quests.map(q => q.id === questId ? { ...q, completions: newCompletions } : q);

        set({ quests: newQuests, stats: newStats });
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'quests', questId), cleanUpdateData({ completions: newCompletions }));
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats }));
        }
      },

      gainXp: (skill, amount) => {
        let newStats = { ...get().stats, skills: { ...get().stats.skills } };
        newStats.xp += amount;
        while (newStats.xp >= newStats.xpToNextLevel) {
          newStats.xp -= newStats.xpToNextLevel;
          newStats.level += 1;
          newStats.xpToNextLevel = Math.floor(newStats.xpToNextLevel * 1.5);
        }
        const skillStats = { ...(newStats.skills[skill] || { level: 1, xp: 0, xpToNextLevel: 50 }) };
        skillStats.xp += amount;
        while (skillStats.xp >= skillStats.xpToNextLevel) {
          skillStats.xp -= skillStats.xpToNextLevel;
          skillStats.level += 1;
          skillStats.xpToNextLevel = Math.floor(skillStats.xpToNextLevel * 1.5);
        }
        newStats.skills[skill] = skillStats;

        set({ stats: newStats });
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ stats: newStats }));
        }
      },

      markNotified: (id) => {
        set((state) => ({ notifiedQuestIds: [...state.notifiedQuestIds, id] }));
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ notifiedQuestIds: get().notifiedQuestIds }));
        }
      },

      recalculateStats: () => {
        const state = get();
        const newStats = calculateStatsFromHistory(state.quests, state.focusSessions, state.stats);
        set({ stats: newStats });
        if (state.user) {
          updateDoc(doc(db, 'users', state.user.uid), cleanUpdateData({ stats: newStats }));
        }
      },

      syncWithFirestore: (userId) => {
        set({ questsSynced: false });
        const userDocRef = doc(db, 'users', userId);
        const questsColRef = collection(db, 'users', userId, 'quests');
        const diaryColRef = collection(db, 'users', userId, 'diaryEntries');
        const visionsColRef = collection(db, 'users', userId, 'visions');
        const focusColRef = collection(db, 'users', userId, 'focusSessions');
        const deepColRef = collection(db, 'users', userId, 'deepTrainings');
        const foodColRef = collection(db, 'users', userId, 'foodEntries');
        const weeklyCoachSummariesColRef = collection(db, 'users', userId, 'weeklyCoachSummaries');
        const healthRecordsColRef = collection(db, 'users', userId, 'healthRecords');

        // Initial check: if user doc doesn't exist, upload current local state
        getDoc(userDocRef).then((docSnap) => {
          if (!docSnap.exists()) {
            const state = get();
            const initialStats = calculateStatsFromHistory(state.quests, state.focusSessions, state.stats);
            setDoc(userDocRef, cleanData({
              stats: initialStats,
              widgetOrder: state.widgetOrder,
              notifiedQuestIds: state.notifiedQuestIds,
              lastTrainingGeneratedDate: state.lastTrainingGeneratedDate
            }));
            state.quests.forEach(q => setDoc(doc(questsColRef, q.id), cleanData(q)));
            state.diaryEntries.forEach(e => setDoc(doc(diaryColRef, e.id), cleanData(e)));
            state.visions.forEach(v => setDoc(doc(visionsColRef, v.id), cleanData(v)));
            state.focusSessions.forEach(f => setDoc(doc(focusColRef, f.id), cleanData(f)));
            state.deepTrainings.forEach(d => setDoc(doc(deepColRef, d.id), cleanData(d)));
            state.foodEntries.forEach(f => setDoc(doc(foodColRef, f.id), cleanData(f)));
            state.weeklyCoachSummaries.forEach(w => setDoc(doc(weeklyCoachSummariesColRef, w.id), cleanData(w)));
            state.healthRecords.forEach(h => setDoc(doc(healthRecordsColRef, h.id), cleanData(h)));
          }
        });

        const unsubUser = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            // Only auto-lock once on initial load if pin is enabled
            if (data.settings?.isPinEnabled && !get().isInitialized) {
              set({ isLocked: true });
            }

            const state = get();
            const loadedStats = data.stats || state.stats;
            const newStats = calculateStatsFromHistory(state.quests, state.focusSessions, loadedStats);

            set({ 
              stats: newStats,
              widgetOrder: data.widgetOrder || state.widgetOrder,
              notifiedQuestIds: data.notifiedQuestIds || state.notifiedQuestIds,
              settings: data.settings || state.settings,
              lastTrainingGeneratedDate: data.lastTrainingGeneratedDate || state.lastTrainingGeneratedDate
            });
            
            set({ isInitialized: true });
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${userId}`);
        });

        const unsubQuests = onSnapshot(questsColRef, (snapshot) => {
          const quests: Quest[] = [];
          snapshot.forEach((doc) => quests.push(doc.data() as Quest));
          const state = get();
          const newStats = calculateStatsFromHistory(quests, state.focusSessions, state.stats);
          set({ quests, stats: newStats, questsSynced: true });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/quests`);
        });

        const unsubDiary = onSnapshot(diaryColRef, (snapshot) => {
          const diaryEntries: DiaryEntry[] = [];
          snapshot.forEach((doc) => diaryEntries.push(doc.data() as DiaryEntry));
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
          snapshot.forEach((doc) => focusSessions.push(doc.data() as FocusSession));
          const state = get();
          const newStats = calculateStatsFromHistory(state.quests, focusSessions, state.stats);
          set({ focusSessions, stats: newStats });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/focusSessions`);
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
          snapshot.forEach((doc) => foodEntries.push(doc.data() as FoodEntry));
          set({ foodEntries: foodEntries.sort((a, b) => b.date - a.date) });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/foodEntries`);
        });

        const unsubWeeklyCoachSummaries = onSnapshot(weeklyCoachSummariesColRef, (snapshot) => {
          const weeklyCoachSummaries: WeeklyCoachSummary[] = [];
          snapshot.forEach((doc) => weeklyCoachSummaries.push(doc.data() as WeeklyCoachSummary));
          set({ weeklyCoachSummaries: weeklyCoachSummaries.sort((a, b) => b.weekStart - a.weekStart) });
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, `users/${userId}/weeklyCoachSummaries`);
        });

        const unsubHealthRecords = onSnapshot(healthRecordsColRef, (snapshot) => {
          const healthRecords: HealthDailyRecord[] = [];
          snapshot.forEach((doc) => healthRecords.push(doc.data() as HealthDailyRecord));
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
          unsubHealthRecords();
        };
      }
    }),
    {
      name: 'rpg-storage',
      version: 1,
      partialize: (state) => {
        const { isLocked, questsSynced, ...persistedState } = state;
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
        if (state) {
          if (state.settings && state.settings.isPinEnabled) {
            state.setLocked(true);
          }
          if (state.quests || state.focusSessions) {
            const recalculated = calculateStatsFromHistory(state.quests || [], state.focusSessions || [], state.stats);
            useStore.setState({ stats: recalculated });
          }
        }
      }
    }
  )
);
