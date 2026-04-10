import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserStats, Quest, SkillType, DiaryEntry } from '../types';
import { User } from 'firebase/auth';
import { db, auth } from '../firebase';
import { toast } from 'sonner';
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
  stats: UserStats;
  quests: Quest[];
  diaryEntries: DiaryEntry[];
  notifiedQuestIds: string[];
  widgetOrder: string[];
  setUser: (user: User | null) => void;
  setInitialized: (val: boolean) => void;
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
      stats: INITIAL_STATS,
      quests: [],
      diaryEntries: [],
      notifiedQuestIds: [],
      widgetOrder: ['level', 'streak', 'chart', 'calendar', 'today', 'reminders', 'settings'],
      
      setUser: (user) => set({ user, loading: false }),
      setInitialized: (val) => set({ isInitialized: val }),
      
      updateWidgetOrder: (order) => {
        set({ widgetOrder: order });
        const { user } = get();
        if (user) {
          updateDoc(doc(db, 'users', user.uid), cleanUpdateData({ widgetOrder: order }));
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

      completeQuest: (id, isNegativeHabit = false) => {
        const state = get();
        const quest = state.quests.find(q => q.id === id);
        if (!quest || quest.completed) return;

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

        // Initial check: if user doc doesn't exist, upload current local state
        getDoc(userDocRef).then((docSnap) => {
          if (!docSnap.exists()) {
            const state = get();
            setDoc(userDocRef, cleanData({
              stats: state.stats,
              widgetOrder: state.widgetOrder,
              notifiedQuestIds: state.notifiedQuestIds
            }));
            state.quests.forEach(q => setDoc(doc(questsColRef, q.id), cleanData(q)));
            state.diaryEntries.forEach(e => setDoc(doc(diaryColRef, e.id), cleanData(e)));
          }
        });

        const unsubUser = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            const data = doc.data();
            set({ 
              stats: data.stats || get().stats,
              widgetOrder: data.widgetOrder || get().widgetOrder,
              notifiedQuestIds: data.notifiedQuestIds || get().notifiedQuestIds
            });
          }
        });

        const unsubQuests = onSnapshot(questsColRef, (snapshot) => {
          const quests: Quest[] = [];
          snapshot.forEach((doc) => quests.push(doc.data() as Quest));
          set({ quests });
        });

        const unsubDiary = onSnapshot(diaryColRef, (snapshot) => {
          const diaryEntries: DiaryEntry[] = [];
          snapshot.forEach((doc) => diaryEntries.push(doc.data() as DiaryEntry));
          set({ diaryEntries: diaryEntries.sort((a, b) => b.date - a.date) });
        });

        return () => {
          unsubUser();
          unsubQuests();
          unsubDiary();
        };
      }
    }),
    {
      name: 'rpg-storage',
      version: 1,
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
      }
    }
  )
);
