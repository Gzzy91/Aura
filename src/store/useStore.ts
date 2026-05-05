import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserStats, Quest, SkillType, DiaryEntry, Vision, FocusSession, DeepTraining, FoodEntry } from '../types';
import { User } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { toast } from 'sonner';
import { triggerHapticFeedback } from '@/lib/utils';
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
  lastTrainingGeneratedDate: string | null;
  setUser: (user: User | null) => void;
  setInitialized: (val: boolean) => void;
  setLocked: (val: boolean) => void;
  updateSettings: (updates: Partial<{ isPinEnabled: boolean; pin: string | null }>) => void;
  addQuest: (quest: Omit<Quest, 'id' | 'completed' | 'createdAt'>) => void;
  completeQuest: (id: string, isNegativeHabit?: boolean) => void;
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
  syncWithFirestore: (userId: string) => () => void;
}

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

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: true,
      isInitialized: false,
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
      widgetOrder: ['level', 'streak', 'chart', 'recurring_chart', 'calendar', 'today', 'reminders', 'settings'],
      deepTrainings: [],
      foodEntries: [],
      lastTrainingGeneratedDate: null,
      
      setUser: (user) => set({ user, loading: false }),
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
          setDoc(doc(db, 'users', user.uid, 'diaryEntries', id), cleanData(entry));
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
          updateDoc(doc(db, 'users', user.uid, 'diaryEntries', id), cleanUpdateData(updates));
        }
      },

      deleteDiaryEntry: (id) => {
        set((state) => ({
          diaryEntries: state.diaryEntries.filter(e => e.id !== id)
        }));

        const { user } = get();
        if (user) {
          deleteDoc(doc(db, 'users', user.uid, 'diaryEntries', id));
        }
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

      completeQuest: (id, isNegativeHabit = false) => {
        const state = get();
        const quest = state.quests.find(q => q.id === id);
        if (!quest || quest.completed) return;
        
        triggerHapticFeedback([50, 100, 50]);

        const { user } = get();
        let nextQuests = [...state.quests];
        let newStats = { ...state.stats, skills: { ...state.stats.skills } };

        if (isNegativeHabit) {
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
          const newCompletion = { date: Date.now(), direction: isNegativeHabit ? 'negative' as const : 'positive' as const };
          nextQuests = state.quests.map(q => q.id === id ? { 
            ...q, 
            completions: [...(q.completions || []), newCompletion] 
          } : q);
          
          if (user) {
            updateDoc(doc(db, 'users', user.uid, 'quests', id), cleanUpdateData({
              completions: nextQuests.find(q => q.id === id)?.completions
            }));
          }
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
            const date = new Date(quest.dueDate || Date.now());
            if (quest.recurrence === 'daily') date.setDate(date.getDate() + 1);
            else if (quest.recurrence === 'weekly') {
              if (quest.recurrenceDays && quest.recurrenceDays.length > 0) {
                // Find next selected weekday
                let found = false;
                for (let i = 1; i <= 7; i++) {
                  const nextDate = new Date(date);
                  nextDate.setDate(date.getDate() + i);
                  if (quest.recurrenceDays.includes(nextDate.getDay())) {
                    date.setTime(nextDate.getTime());
                    found = true;
                    break;
                  }
                }
                if (!found) date.setDate(date.getDate() + 7);
              } else {
                date.setDate(date.getDate() + 7);
              }
            }
            else if (quest.recurrence === 'monthly') {
              if (quest.recurrenceDays && quest.recurrenceDays.length > 0) {
                let found = false;
                for (let i = 0; i < 12; i++) {
                  const nextMonth = new Date(date);
                  nextMonth.setMonth(date.getMonth() + i);
                  const sortedDays = [...quest.recurrenceDays].sort((a, b) => a - b);
                  for (const day of sortedDays) {
                    const candidate = new Date(nextMonth);
                    const lastDayOfMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate();
                    candidate.setDate(Math.min(day, lastDayOfMonth));
                    if (candidate.getTime() > date.getTime()) {
                      date.setTime(candidate.getTime());
                      found = true;
                      break;
                    }
                  }
                  if (found) break;
                }
                if (!found) date.setMonth(date.getMonth() + 1);
              } else {
                date.setMonth(date.getMonth() + 1);
              }
            }

            const recurringQuest: Quest = {
              ...quest,
              id: crypto.randomUUID(),
              completed: false,
              completedAt: undefined,
              createdAt: Date.now(),
              dueDate: date.getTime(),
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
        if (quest.completed) {
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

        const newQuests = state.quests.map(q => q.id === id ? { ...q, completed: false, completedAt: undefined } : q);
        set({ quests: newQuests, stats: newStats });

        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid, 'quests', id), {
            completed: false,
            completedAt: deleteField()
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
          const skillStats = { ...newStats.skills[quest.skill] };
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

      syncWithFirestore: (userId) => {
        const userDocRef = doc(db, 'users', userId);
        const questsColRef = collection(db, 'users', userId, 'quests');
        const diaryColRef = collection(db, 'users', userId, 'diaryEntries');
        const visionsColRef = collection(db, 'users', userId, 'visions');
        const focusColRef = collection(db, 'users', userId, 'focusSessions');
        const deepColRef = collection(db, 'users', userId, 'deepTrainings');
        const foodColRef = collection(db, 'users', userId, 'foodEntries');

        // Initial check: if user doc doesn't exist, upload current local state
        getDoc(userDocRef).then((docSnap) => {
          if (!docSnap.exists()) {
            const state = get();
            setDoc(userDocRef, cleanData({
              stats: state.stats,
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
          }
        });

        const unsubUser = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            // Only auto-lock once on initial load if pin is enabled
            if (data.settings?.isPinEnabled && !get().isInitialized) {
              set({ isLocked: true });
            }

            set({ 
              stats: data.stats || get().stats,
              widgetOrder: data.widgetOrder || get().widgetOrder,
              notifiedQuestIds: data.notifiedQuestIds || get().notifiedQuestIds,
              settings: data.settings || get().settings,
              lastTrainingGeneratedDate: data.lastTrainingGeneratedDate || get().lastTrainingGeneratedDate
            });
            
            set({ isInitialized: true });
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${userId}`);
        });

        const unsubQuests = onSnapshot(questsColRef, (snapshot) => {
          const quests: Quest[] = [];
          snapshot.forEach((doc) => quests.push(doc.data() as Quest));
          set({ quests });
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
          set({ focusSessions });
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

        return () => {
          unsubUser();
          unsubQuests();
          unsubDiary();
          unsubVisions();
          unsubFocus();
          unsubDeep();
          unsubFood();
        };
      }
    }),
    {
      name: 'rpg-storage',
      version: 1,
      partialize: (state) => {
        const { isLocked, ...persistedState } = state;
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
        if (state && state.settings && state.settings.isPinEnabled) {
          state.setLocked(true);
        }
      }
    }
  )
);
