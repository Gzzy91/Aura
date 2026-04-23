export type SkillType = 'Fitness' | 'Fokus' | 'Disziplin' | 'Wissen' | 'Soziales';

export interface SkillStats {
  level: number;
  xp: number;
  xpToNextLevel: number;
}

export interface Equipment {
  id: string;
  name: string;
  description: string;
  bonus: string;
  unlockCondition: string;
  category: 'head' | 'body' | 'legs' | 'feet' | 'weapon' | 'shield' | 'accessory';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  icon: string;
  unlocked: boolean;
}

export interface Skin {
  id: string;
  name: string;
  description: string;
  bonus: string;
  unlockCondition: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  previewColor: string;
  unlocked: boolean;
}

export interface UserStats {
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  skills: Record<SkillType, SkillStats>;
  equippedItems?: Record<'head' | 'body' | 'legs' | 'feet' | 'weapon' | 'shield' | 'accessory', string | null>;
  activeSkinId?: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface DiaryEntry {
  id: string;
  date: number;
  mood: number; // 1-5
  notes: string;
  progress: string;
  tags: string[];
}

export type ReminderTiming = 'none' | '0m' | '1h' | '2h' | '1d' | '2d';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Vision {
  id: string;
  title: string;
  description: string;
  icon: string;
  targetDate?: number;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface FocusSession {
  id: string;
  durationMinutes: number;
  skill: SkillType;
  completedAt: number;
  notes?: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  skill: SkillType;
  xpReward: number;
  completed: boolean;
  type: 'daily' | 'habit';
  habitDirection?: 'positive' | 'negative' | 'both';
  createdAt: number;
  completedAt?: number;
  subtasks?: Subtask[];
  dueDate?: number;
  hasTime?: boolean;
  reminderTiming?: ReminderTiming;
  recurrence?: Recurrence;
  recurrenceDays?: number[]; // 0-6, where 0 is Sunday
  tags?: string[];
  completions?: { date: number; direction: 'positive' | 'negative' }[];
  visionId?: string;
}
