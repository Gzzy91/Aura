export type SkillType = 'Fitness' | 'Fokus' | 'Disziplin' | 'Wissen' | 'Soziales';

export interface SkillStats {
  level: number;
  xp: number;
  xpToNextLevel: number;
  lastWorkedAt?: number;
  lastDecayAt?: number;
  decayedXpTotal?: number;
  lastDecayAmount?: number;
  lastDecayDemotedFrom?: number;
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

export interface DeepTraining {
  id: string;
  title: string;
  category: string;
  iconName: string;
  content: string;
  createdAt: number;
}

export interface FoodEntry {
  id: string;
  date: number;
  name: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  type: 'Frühstück' | 'Mittagessen' | 'Abendessen' | 'Snack';
}

export interface WeeklyCoachSummary {
  id: string; // YYYY-MM-DD of weekStart (Monday)
  weekStart: number;
  summary: string;
  avgMood: number | null;
  loggedDaysCount: number;
  totalXp: number;
  generatedAt: number;
}

export interface RetrospectiveFocusAction {
  id: string;
  title: string;
  description: string;
  skill: SkillType;
  xpReward: number;
}

export interface WeeklyRetrospective {
  id: string; // YYYY-MM-DD of weekStart (Monday)
  weekStart: number;
  weekEnd: number;
  headline: string;
  moodFluctuationAnalysis: string;
  goalAchievementAnalysis: string;
  nextWeekOutlook: string;
  focusRecommendations: RetrospectiveFocusAction[];
  avgMood: number | null;
  minMood: number | null;
  maxMood: number | null;
  moodSwingRange: number | null;
  moodVolatility: number | null;
  loggedMoodDays: number;
  completedQuestsCount: number;
  failedQuestsCount: number;
  questCompletionRate: number;
  habitPositiveCount: number;
  habitNegativeCount: number;
  totalXp: number;
  totalFocusMinutes: number;
  adoptedRecommendationIds?: string[];
  generatedAt: number;
  triggerType: 'sunday_auto' | 'manual';
}

export interface AppSettings {
  isPinEnabled: boolean;
  pin: string | null;
  lastLockTime?: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  skill: SkillType;
  xpReward: number;
  completed: boolean;
  failed?: boolean;
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

export type HealthDataSource =
  | 'browser_idle'
  | 'device_motion'
  | 'web_bluetooth'
  | 'health_export'
  | 'aura_activity'
  | 'manual';

export type RecoveryState = 'depleted' | 'strained' | 'balanced' | 'charged';

export interface HealthDailyRecord {
  id: string; // YYYY-MM-DD
  date: number;
  sleepDurationMinutes: number;
  activityDurationMinutes: number;
  avgHeartRate?: number | null;
  sources: HealthDataSource[];
  recoveryScore: number;
  recoveryState: RecoveryState;
  acceptedSuggestionIds?: string[];
  dismissedSuggestionIds?: string[];
  syncedAt: number;
}

export interface EnergyRecoverySuggestion {
  id: string;
  title: string;
  description: string;
  skill: SkillType;
  xpReward: number;
  recommendedDurationMinutes: number;
  category:
    | 'sleep_recovery'
    | 'active_rest'
    | 'mindful_reset'
    | 'hydration_nutrition'
    | 'movement_boost';
  priority: 'high' | 'medium' | 'low';
  reason: string;
  tags: string[];
}

