import { DeepTraining, RetrospectiveFocusAction } from '../types';

export interface WeeklySummaryDayPayload {
  shortDay: string;
  dateLabel: string;
  mood: number | null;
  moodLabel?: string | null;
  xp: number;
  completedCount: number;
  focusMinutes: number;
  notes?: string;
  progress?: string;
}

export interface WeeklySummaryRequestPayload {
  weekLabel: string;
  avgMood: number | null;
  moodDelta: number | null;
  loggedDaysCount: number;
  totalXp: number;
  xpDelta: number;
  totalCompleted: number;
  totalFocusMinutes: number;
  topSkill: { skill: string; xp: number } | null;
  moodDistribution: Record<string, number>;
  dailyBreakdown: WeeklySummaryDayPayload[];
  userLevel?: number;
}

export interface WeeklyRetrospectiveRequestPayload {
  weekLabel: string;
  loggedMoodDays: number;
  avgMood: number | null;
  minMood: number | null;
  maxMood: number | null;
  moodSwingRange: number | null;
  moodVolatility: number | null;
  stabilityLabel: string;
  biggestJump?: { fromDay: string; toDay: string; delta: number } | null;
  peakDay?: { shortDay: string; mood: number } | null;
  lowDay?: { shortDay: string; mood: number } | null;
  completedQuestsCount: number;
  failedQuestsCount: number;
  pendingWeekQuestsCount: number;
  questCompletionRate: number;
  habitPositiveCount: number;
  habitNegativeCount: number;
  totalXp: number;
  totalFocusMinutes: number;
  topSkill?: { skill: string; xp: number } | null;
  completedQuestTitles: string[];
  failedQuestTitles: string[];
  visionProgress: Array<{
    title: string;
    completed: boolean;
    linkedQuests: number;
    completedLinkedQuests: number;
    progressPercent: number;
  }>;
  dailyBreakdown: Array<{
    shortDay: string;
    dateLabel: string;
    mood: number | null;
    moodLabel?: string | null;
    completedQuests: number;
    failedQuests: number;
    habitPositive: number;
    habitNegative: number;
    xp: number;
    focusMinutes: number;
    notes?: string;
    progress?: string;
  }>;
  userLevel?: number;
  streak?: number;
}

export interface WeeklyRetrospectiveResponse {
  headline: string;
  moodFluctuationAnalysis: string;
  goalAchievementAnalysis: string;
  nextWeekOutlook: string;
  focusRecommendations: RetrospectiveFocusAction[];
}

export interface CoachChatContext {
  level: number;
  xp: number;
  xpToNextLevel: number;
  skills: Record<string, unknown>;
  activeQuests: string[];
  recentMoodSummary?: string;
}

export interface CoachChatResponse {
  text?: string;
  functionCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
  priorHistory?: unknown[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Anfrage fehlgeschlagen (${res.status})`);
  }
  return data as T;
}

export async function generateDailyTraining(
  existingTitles: string[]
): Promise<Omit<DeepTraining, 'id' | 'createdAt'>> {
  return postJson<Omit<DeepTraining, 'id' | 'createdAt'>>('/api/coach/daily-training', {
    existingTitles,
  });
}

export async function generateWeeklyMoodSummary(
  payload: WeeklySummaryRequestPayload
): Promise<{ summary: string }> {
  return postJson<{ summary: string }>('/api/coach/weekly-summary', payload);
}

export async function generateWeeklyRetrospective(
  payload: WeeklyRetrospectiveRequestPayload
): Promise<WeeklyRetrospectiveResponse> {
  return postJson<WeeklyRetrospectiveResponse>('/api/coach/weekly-retrospective', payload);
}

export async function sendCoachChatMessage(payload: {
  history?: Array<{ role: 'user' | 'coach'; content: string }>;
  userMessage?: string;
  context: CoachChatContext;
  functionCallResult?: {
    priorHistory: unknown[];
    call: unknown;
    result: Record<string, unknown>;
  };
}): Promise<CoachChatResponse> {
  return postJson<CoachChatResponse>('/api/coach/chat', payload);
}
