import { useStore } from '@/store/useStore';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Flame, Bell, Clock, Frown, Meh, Smile, Heart, Star, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, BookOpen, BarChart2, CheckCircle2, Target, Lock, Unlock, Eye, EyeOff, TrendingUp, TrendingDown, Sparkles, Award, RefreshCw, Bot, AlertCircle, Loader2, Utensils, ThumbsUp, ThumbsDown, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { cn, SKILL_COLORS, SKILL_BG_COLORS, triggerHapticFeedback } from '@/lib/utils';
import { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, format, startOfWeek, endOfWeek, addMonths, subMonths, startOfDay, subDays, addDays, addWeeks, subWeeks, isSameWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { AnimatePresence, motion } from 'motion/react';
import { DiaryEntry, SkillType, Quest } from '@/types';
import { BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateWeeklyMoodSummary } from '@/services/coachService';
import { EnergyRecoveryWidget } from '@/components/EnergyRecoveryWidget';
import { WeeklyRetrospectiveWidget } from '@/components/WeeklyRetrospectiveWidget';

function SortableWidget({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(className, isDragging && "opacity-50", "group")}>
      <div {...attributes} {...listeners} className="absolute top-3 right-3 p-1.5 cursor-grab active:cursor-grabbing z-20 text-neutral-500 hover:text-white bg-neutral-900/80 rounded-md opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity touch-none">
        <GripHorizontal className="w-4 h-4" />
      </div>
      {children}
    </div>
  );
}

const CHART_COLORS: Record<SkillType, string> = {
  Fitness: '#ef4444',
  Fokus: '#3b82f6',
  Disziplin: '#a855f7',
  Wissen: '#10b981',
  Soziales: '#ec4899',
};

const MOOD_ICONS: Record<number, any> = {
  1: { icon: Frown, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Schlecht' },
  2: { icon: Meh, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Geht so' },
  3: { icon: Smile, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Gut' },
  4: { icon: Heart, color: 'text-pink-500', bg: 'bg-pink-500/10', label: 'Sehr gut' },
  5: { icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Exzellent' },
};

const SKILL_KEYS = Object.keys(CHART_COLORS) as SkillType[];
const WEEKLY_SUMMARY_MARGIN = { top: 8, right: 0, left: -24, bottom: 0 };
const FOOD_MOOD_CHART_MARGIN = { top: 10, right: 12, left: -24, bottom: 8 };
const TREND_CHART_MARGIN = { top: 10, right: 10, left: -20, bottom: 0 };
const WEEKLY_XP_CHART_MARGIN = { top: 10, right: 10, left: -20, bottom: 0 };
const MOOD_DOMAIN: [number, number] = [1, 5];
const FOOD_MOOD_DOMAIN: [number, number] = [0, 5];
const XP_DOMAIN: [number, 'auto'] = [0, 'auto'];
const MOOD_TICKS = [1, 2, 3, 4, 5];

const HIDDEN_WIDGETS_STORAGE_KEY = 'aura_hidden_widgets_v1';
const DEFAULT_WIDGET_ORDER = [
  'avatar',
  'level',
  'streak',
  'mood',
  'energy_recovery',
  'weekly_summary',
  'weekly_retrospective',
  'food_mood_correlation',
  'chart',
  'trend',
  'recurring_chart',
  'calendar',
  'today',
  'reminders',
  'settings',
];
const WIDGET_LABELS: Record<string, string> = {
  avatar: 'Charakter & Skin',
  level: 'Level & Gesamt-EP',
  streak: 'Tägliche Serie',
  mood: 'Tagesstimmung',
  energy_recovery: 'Energie & Erholung',
  weekly_summary: 'Wöchentliche Zusammenfassung',
  weekly_retrospective: 'Sonntags-Retrospektive',
  food_mood_correlation: 'Ernährung & Stimmung',
  chart: 'Wöchentliche EP-Übersicht',
  trend: 'Fähigkeits-Trends (4 Wochen)',
  recurring_chart: 'Wiederkehrende Quests',
  calendar: 'Stimmungs-Kalender',
  today: 'Heute erledigt',
  reminders: 'Anstehende Erinnerungen',
  settings: 'Benachrichtigungen & Sicherheit',
};
const BAR_RADIUS_TOP_4: [number, number, number, number] = [4, 4, 0, 0];
const BAR_RADIUS_TOP_6: [number, number, number, number] = [6, 6, 0, 0];
const BAR_RADIUS_BOTTOM_4: [number, number, number, number] = [0, 0, 4, 4];
const CHART_CURSOR_35 = { fill: '#262626', opacity: 0.35 };
const CHART_CURSOR_40 = { fill: '#262626', opacity: 0.4 };
const MOOD_LINE_DOT = { r: 4, fill: '#f59e0b', stroke: '#171717', strokeWidth: 2 };
const MOOD_LINE_ACTIVE_DOT = { r: 6, fill: '#fbbf24' };
const TREND_AXIS_TICK = { fill: '#737373', fontSize: 10, fontWeight: 'bold' as const };
const TREND_TOOLTIP_CONTENT_STYLE = { backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', fontSize: '12px' };
const TREND_TOOLTIP_ITEM_STYLE = { fontWeight: 'bold' as const };
const TREND_LINE_DOT = { r: 4, strokeWidth: 2, fill: '#0a0a0a' };
const TREND_LINE_ACTIVE_DOT = { r: 6, strokeWidth: 0 };

const formatMoodTick = (v: number) => `${v}★`;
const formatPlainTick = (value: number) => `${value}`;

function CustomWeeklySummaryTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const moodMeta = data.mood ? MOOD_ICONS[data.mood] : null;
    return (
      <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl shadow-xl space-y-1.5 min-w-[160px]">
        <p className="font-bold text-white text-xs">{data.shortDay}, {data.fullDate}</p>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-neutral-400">Stimmung</span>
          {data.mood && moodMeta ? (
            <span className={cn("font-bold", moodMeta.color)}>
              {data.mood}/5 ★ ({moodMeta.label})
            </span>
          ) : (
            <span className="text-neutral-500">Nicht geloggt</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-neutral-400">Fortschritt</span>
          <span className="font-mono font-bold text-amber-400">+{data.xp} EP</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-neutral-400">Aufgaben</span>
          <span className="font-mono font-bold text-emerald-400">{data.completedCount} erledigt</span>
        </div>
      </div>
    );
  }
  return null;
}

function CustomFoodMoodTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const m = payload[0].payload;
    return (
      <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl shadow-xl space-y-1.5 min-w-[180px]">
        <p className="font-bold text-white text-xs">{m.name}</p>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-neutral-400">Ø Stimmung</span>
          <span className="font-mono font-bold text-amber-400">{m.avgMood.toFixed(1)} / 5 ★</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-neutral-400">Abweichung</span>
          <span
            className={cn(
              'font-mono font-bold',
              m.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
            )}
          >
            {m.delta >= 0 ? '+' : ''}
            {m.delta.toFixed(1)} ★
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-neutral-400">Häufigkeit</span>
          <span className="font-mono font-bold text-neutral-200">{m.daysCount}× Tage</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-neutral-400">Ø Kalorien</span>
          <span className="font-mono font-bold text-neutral-200">{m.avgCalories} kcal</span>
        </div>
      </div>
    );
  }
  return null;
}

function CustomWeeklyXpTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum: number, entry: any) => sum + entry.value, 0);
    return (
      <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl shadow-xl">
        <p className="font-bold text-white mb-2">{payload[0].payload.fullDate}</p>
        {payload.map((entry: any, index: number) => (
          entry.value !== 0 && (
            <div key={index} className="flex items-center justify-between gap-4 text-sm mb-1">
              <span style={{ color: entry.color }}>{entry.name}</span>
              <span className={cn("font-mono font-bold", entry.value > 0 ? "text-white" : "text-red-500")}>{entry.value} EP</span>
            </div>
          )
        ))}
        {total !== 0 && (
          <div className="mt-2 pt-2 border-t border-neutral-800 flex justify-between gap-4 text-sm font-bold">
            <span className="text-neutral-400">Gesamt</span>
            <span className={cn("font-mono", total > 0 ? "text-amber-500" : "text-red-500")}>{total} EP</span>
          </div>
        )}
      </div>
    );
  }
  return null;
}

const WEEKLY_SUMMARY_TOOLTIP_EL = <CustomWeeklySummaryTooltip />;
const FOOD_MOOD_TOOLTIP_EL = <CustomFoodMoodTooltip />;
const WEEKLY_XP_TOOLTIP_EL = <CustomWeeklyXpTooltip />;

const WeeklySummaryChart = memo(function WeeklySummaryChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
      <ComposedChart data={data} margin={WEEKLY_SUMMARY_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
        <XAxis
          dataKey="shortDay"
          stroke="#737373"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="xp"
          stroke="#737373"
          fontSize={10}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="mood"
          orientation="right"
          domain={MOOD_DOMAIN}
          ticks={MOOD_TICKS}
          stroke="#f59e0b"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatMoodTick}
        />
        <Tooltip content={WEEKLY_SUMMARY_TOOLTIP_EL} cursor={CHART_CURSOR_35} />
        <Bar
          yAxisId="xp"
          dataKey="xp"
          name="EP"
          fill="#3b82f6"
          fillOpacity={0.35}
          stroke="#3b82f6"
          strokeOpacity={0.6}
          radius={BAR_RADIUS_TOP_4}
          barSize={22}
          isAnimationActive={false}
        />
        <Line
          yAxisId="mood"
          type="monotone"
          dataKey="mood"
          name="Stimmung (★)"
          stroke="#f59e0b"
          strokeWidth={3}
          connectNulls
          dot={MOOD_LINE_DOT}
          activeDot={MOOD_LINE_ACTIVE_DOT}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

const FoodMoodChart = memo(function FoodMoodChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
      <BarChart data={data} margin={FOOD_MOOD_CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
        <XAxis
          dataKey="shortName"
          stroke="#737373"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis
          domain={FOOD_MOOD_DOMAIN}
          ticks={MOOD_TICKS}
          stroke="#737373"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatMoodTick}
        />
        <Tooltip content={FOOD_MOOD_TOOLTIP_EL} cursor={CHART_CURSOR_35} />
        <Bar dataKey="avgMood" name="Ø Stimmung" radius={BAR_RADIUS_TOP_6} barSize={28} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell
              key={entry.key}
              fill={
                entry.avgMood >= 4
                  ? '#10b981'
                  : entry.avgMood >= 3
                    ? '#f59e0b'
                    : '#f43f5e'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

const FourWeekTrendChart = memo(function FourWeekTrendChart({ data }: { data: any[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-[265px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
          <LineChart data={data} margin={TREND_CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={TREND_AXIS_TICK}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={TREND_AXIS_TICK}
            />
            <Tooltip
              contentStyle={TREND_TOOLTIP_CONTENT_STYLE}
              itemStyle={TREND_TOOLTIP_ITEM_STYLE}
            />
            {SKILL_KEYS.map((skill) => (
              <Line
                key={skill}
                type="monotone"
                dataKey={skill}
                stroke={CHART_COLORS[skill]}
                strokeWidth={3}
                dot={TREND_LINE_DOT}
                activeDot={TREND_LINE_ACTIVE_DOT}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1">
        {SKILL_KEYS.map((skill) => (
          <div key={skill} className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            <span className="w-2.5 h-0.5 rounded-full" style={{ backgroundColor: CHART_COLORS[skill] }} />
            <span>{skill}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

const WeeklyXpChart = memo(function WeeklyXpChart({ data }: { data: any[] }) {
  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-1 min-h-0 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
          <BarChart data={data} margin={WEEKLY_XP_CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#737373"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis
              stroke="#737373"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatPlainTick}
              domain={XP_DOMAIN}
            />
            <Tooltip content={WEEKLY_XP_TOOLTIP_EL} cursor={CHART_CURSOR_40} />
            <Bar dataKey="Fitness" stackId="a" fill={CHART_COLORS.Fitness} radius={BAR_RADIUS_BOTTOM_4} isAnimationActive={false} />
            <Bar dataKey="Fokus" stackId="a" fill={CHART_COLORS.Fokus} isAnimationActive={false} />
            <Bar dataKey="Disziplin" stackId="a" fill={CHART_COLORS.Disziplin} isAnimationActive={false} />
            <Bar dataKey="Wissen" stackId="a" fill={CHART_COLORS.Wissen} isAnimationActive={false} />
            <Bar dataKey="Soziales" stackId="a" fill={CHART_COLORS.Soziales} radius={BAR_RADIUS_TOP_4} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-neutral-400">
        {SKILL_KEYS.map((skill) => (
          <div key={skill} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[skill] }} />
            <span>{skill}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

import { AvatarVisual } from '@/components/AvatarVisual';

export function Dashboard({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const { user, isInitialized, stats, quests, diaryEntries, focusSessions, foodEntries, weeklyCoachSummaries, widgetOrder, updateWidgetOrder, settings, updateSettings, setLocked, updateQuest, setDailyMood, saveWeeklyCoachSummary } = useStore();
  
  // PIN setting state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(HIDDEN_WIDGETS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_WIDGETS_STORAGE_KEY, JSON.stringify(hiddenWidgets));
    } catch {
      // ignore storage errors
    }
  }, [hiddenWidgets]);

  const toggleWidgetVisibility = (id: string) => {
    setHiddenWidgets((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const resetDashboardLayout = () => {
    setHiddenWidgets([]);
    updateWidgetOrder(DEFAULT_WIDGET_ORDER);
    toast.success('Dashboard-Layout zurückgesetzt');
  };

  // Ensure all widgets are present in widgetOrder (for backwards compatibility with persisted state)
  useEffect(() => {
    const allWidgets = DEFAULT_WIDGET_ORDER;
    const missingWidgets = allWidgets.filter(w => !widgetOrder.includes(w));
    if (missingWidgets.length > 0) {
      const nextOrder = [...widgetOrder];
      if (missingWidgets.includes('mood')) {
        const streakIdx = nextOrder.indexOf('streak');
        if (streakIdx !== -1) {
          nextOrder.splice(streakIdx + 1, 0, 'mood');
        } else {
          nextOrder.unshift('mood');
        }
      }
      if (missingWidgets.includes('energy_recovery')) {
        const moodIdx = nextOrder.indexOf('mood');
        if (moodIdx !== -1) {
          nextOrder.splice(moodIdx + 1, 0, 'energy_recovery');
        } else {
          nextOrder.unshift('energy_recovery');
        }
      }
      if (missingWidgets.includes('weekly_summary')) {
        const energyIdx = nextOrder.indexOf('energy_recovery');
        if (energyIdx !== -1) {
          nextOrder.splice(energyIdx + 1, 0, 'weekly_summary');
        } else {
          nextOrder.unshift('weekly_summary');
        }
      }
      if (missingWidgets.includes('weekly_retrospective')) {
        const weeklyIdx = nextOrder.indexOf('weekly_summary');
        if (weeklyIdx !== -1) {
          nextOrder.splice(weeklyIdx + 1, 0, 'weekly_retrospective');
        } else {
          nextOrder.unshift('weekly_retrospective');
        }
      }
      if (missingWidgets.includes('food_mood_correlation')) {
        const retroIdx = nextOrder.indexOf('weekly_retrospective');
        const weeklyIdx = nextOrder.indexOf('weekly_summary');
        const anchorIdx = retroIdx !== -1 ? retroIdx : weeklyIdx;
        if (anchorIdx !== -1) {
          nextOrder.splice(anchorIdx + 1, 0, 'food_mood_correlation');
        } else {
          nextOrder.unshift('food_mood_correlation');
        }
      }
      const remainingMissing = missingWidgets.filter(w => w !== 'mood' && w !== 'energy_recovery' && w !== 'weekly_summary' && w !== 'weekly_retrospective' && w !== 'food_mood_correlation');
      updateWidgetOrder([...nextOrder, ...remainingMissing]);
    }
  }, [widgetOrder, updateWidgetOrder]);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [viewDate, setViewDate] = useState(new Date());
  const [chartDate, setChartDate] = useState(new Date());
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);
  const [hoverMood, setHoverMood] = useState<number | null>(null);
  const [isSavingMood, setIsSavingMood] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const autoRequestedWeeksRef = useRef<Set<string>>(new Set());
  const [foodCorrelationRange, setFoodCorrelationRange] = useState<'30d' | '90d' | 'all'>('30d');
  const [foodCorrelationTiming, setFoodCorrelationTiming] = useState<'same_day' | 'next_day'>('same_day');
  const [foodCorrelationMealType, setFoodCorrelationMealType] = useState<'Alle' | 'Frühstück' | 'Mittagessen' | 'Abendessen' | 'Snack'>('Alle');
  const [foodCorrelationView, setFoodCorrelationView] = useState<'split' | 'chart'>('split');
  const [expandedMealKey, setExpandedMealKey] = useState<string | null>(null);

  const todayMoodEntry = useMemo(() => {
    const today = new Date();
    return diaryEntries.find(e => isSameDay(new Date(e.date), today)) || null;
  }, [diaryEntries]);

  const handleSelectDailyMood = async (rating: number) => {
    if (isSavingMood) return;
    setIsSavingMood(true);
    triggerHapticFeedback(30);
    try {
      await setDailyMood(rating, new Date());
      toast.success(`Stimmung für heute gespeichert: ${rating}/5 Sterne (${MOOD_ICONS[rating].label})`);
    } catch (error) {
      console.error('Failed to save daily mood:', error);
      toast.error('Stimmung konnte nicht gespeichert werden.');
    } finally {
      setIsSavingMood(false);
    }
  };

  // Calculate streak dynamically
  const activeDates = new Set<number>();
  quests.forEach(q => {
    if (q.completed && q.completedAt) {
      activeDates.add(startOfDay(new Date(q.completedAt)).getTime());
    }
    if (q.completions) {
      q.completions.forEach(c => {
        activeDates.add(startOfDay(new Date(c.date)).getTime());
      });
    }
  });
  diaryEntries.forEach(e => {
    if (e.date) {
      activeDates.add(startOfDay(new Date(e.date)).getTime());
    }
  });

  const sortedDates = Array.from(activeDates).sort((a, b) => b - a);
  let currentStreak = 0;

  if (sortedDates.length > 0) {
    const today = startOfDay(new Date());
    const yesterday = subDays(today, 1);
    let currentDate = today;

    if (sortedDates[0] === today.getTime()) {
      currentDate = today;
    } else if (sortedDates[0] === yesterday.getTime()) {
      currentDate = yesterday;
    } else {
      currentDate = new Date(0); // Reset to epoch if not active today or yesterday
    }

    if (currentDate.getTime() !== 0) {
      for (const date of sortedDates) {
        if (date === currentDate.getTime()) {
          currentStreak++;
          currentDate = subDays(currentDate, 1);
        } else if (date < currentDate.getTime()) {
          break;
        }
      }
    }
  }

  // Calendar logic
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        setPermission(Notification.permission);
      } catch (e) {
        console.warn('Could not read Notification permission:', e);
      }
    }
  }, []);

  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Dein Browser unterstützt keine Desktop-Benachrichtigungen.');
      return;
    }

    try {
      if (Notification.permission === 'denied') {
        toast.error(
          'Benachrichtigungen sind blockiert. Klicke auf das Schloss-Symbol in der Adressleiste deines Browsers, wähle "Benachrichtigungen" und setze sie auf "Zulassen". Lade die Seite danach neu.',
          { duration: 6000 }
        );
        return;
      }

      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        toast.success('Benachrichtigungen aktiviert!');
      } else if (result === 'denied') {
        toast.error(
          'Benachrichtigungen wurden blockiert. Klicke auf das Schloss-Symbol in der Adressleiste deines Browsers, wähle "Benachrichtigungen" und setze sie auf "Zulassen". Lade die Seite danach neu.',
          { duration: 6000 }
        );
      }
    } catch (err) {
      console.warn('Error requesting Notification permission:', err);
      toast.error('Benachrichtigungen werden von diesem Gerät/Browser nicht unterstützt.');
    }
  };

  const progress = (stats.xp / stats.xpToNextLevel) * 100;

  const upcomingReminders = quests
    .filter(q => !q.completed && q.dueDate)
    .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0))
    .slice(0, 3);

  const needsDiaryEntryToday = useMemo(() => {
    const today = new Date();
    return !diaryEntries.some(e => isSameDay(new Date(e.date), today));
  }, [diaryEntries]);

  const todayCompletedQuests = useMemo(() => {
    const today = new Date();
    const completed: Quest[] = [];
    
    quests.forEach(q => {
      if (q.completed && q.completedAt && isSameDay(new Date(q.completedAt), today)) {
        completed.push(q);
      }
      if (q.completions) {
        q.completions.forEach((c, index) => {
          if (isSameDay(new Date(c.date), today)) {
            completed.push({
              ...q,
              id: `${q.id}-completion-${index}`,
              habitDirection: c.direction,
              completedAt: c.date,
              completed: true
            });
          }
        });
      }
    });
    
    return completed;
  }, [quests]);

  const groupedCompletedQuests = useMemo(() => {
    return todayCompletedQuests.reduce((acc, quest) => {
      if (!acc[quest.skill]) acc[quest.skill] = [];
      acc[quest.skill].push(quest);
      return acc;
    }, {} as Record<SkillType, Quest[]>);
  }, [todayCompletedQuests]);

  const nextMonth = () => setViewDate(addMonths(viewDate, 1));
  const prevMonth = () => setViewDate(subMonths(viewDate, 1));

  const nextWeek = () => setChartDate(addWeeks(chartDate, 1));
  const prevWeek = () => setChartDate(subWeeks(chartDate, 1));

  // Calculate weekly recurring quests data
  const weeklyRecurringData = useMemo(() => {
    const start = startOfWeek(chartDate, { weekStartsOn: 1 }).getTime();
    const end = endOfWeek(chartDate, { weekStartsOn: 1 }).getTime();
    
    const recurringMap = new Map<string, { title: string, count: number, skill: SkillType }>();

    quests.forEach(q => {
      if (q.type === 'habit') {
        if (q.completions) {
          const count = q.completions.filter(c => c.direction === 'positive' && c.date >= start && c.date <= end).length;
          if (count > 0) {
            recurringMap.set(q.title, {
              title: q.title,
              count: (recurringMap.get(q.title)?.count || 0) + count,
              skill: q.skill,
            });
          }
        }
      } else if (q.recurrence && q.recurrence !== 'none' && q.completed && q.completedAt) {
        if (q.completedAt >= start && q.completedAt <= end) {
          recurringMap.set(q.title, {
            title: q.title,
            count: (recurringMap.get(q.title)?.count || 0) + 1,
            skill: q.skill,
          });
        }
      }
    });

    return Array.from(recurringMap.values())
      .map(item => ({
        name: item.title.length > 15 ? item.title.substring(0, 15) + '...' : item.title,
        fullTitle: item.title,
        count: item.count,
        fill: CHART_COLORS[item.skill],
        skill: item.skill
      }))
      .sort((a, b) => b.count - a.count);
  }, [quests, chartDate]);

  // Calculate weekly XP data
  const weeklyXpData = useMemo(() => {
    const start = startOfWeek(chartDate, { weekStartsOn: 1 });
    const end = endOfWeek(chartDate, { weekStartsOn: 1 });
    
    const days = eachDayOfInterval({ start, end });
    
    return days.map(day => {
      const dayData: any = {
        name: format(day, 'EEEEEE', { locale: de }),
        fullDate: format(day, 'dd.MM.yyyy'),
        Fitness: 0,
        Fokus: 0,
        Disziplin: 0,
        Wissen: 0,
        Soziales: 0,
      };

      quests.forEach(q => {
        if (q.completed && q.completedAt && isSameDay(new Date(q.completedAt), day)) {
          if (q.type === 'habit' && q.habitDirection === 'negative') {
            dayData[q.skill] -= q.xpReward;
          } else {
            dayData[q.skill] += q.xpReward;
          }
        }
        if (q.completions) {
          q.completions.forEach(c => {
            if (isSameDay(new Date(c.date), day)) {
              if (c.direction === 'negative') {
                dayData[q.skill] -= q.xpReward;
              } else {
                dayData[q.skill] += q.xpReward;
              }
            }
          });
        }
      });

      return dayData;
    });
  }, [quests, chartDate]);

  // Calculate 4-week trend data
  const fourWeekTrendData = useMemo(() => {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    
    const weeks = [3, 2, 1, 0].map(offset => {
      const weekStart = subWeeks(currentWeekStart, offset);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      return { 
        start: weekStart, 
        end: weekEnd,
        label: format(weekStart, 'dd.MM', { locale: de })
      };
    });

    return weeks.map(week => {
      const weekData: any = {
        name: week.label,
        Fitness: 0,
        Fokus: 0,
        Disziplin: 0,
        Wissen: 0,
        Soziales: 0,
      };

      quests.forEach(q => {
        if (q.completed && q.completedAt && q.completedAt >= week.start.getTime() && q.completedAt <= week.end.getTime()) {
          if (q.type === 'habit' && q.habitDirection === 'negative') {
            weekData[q.skill] -= q.xpReward;
          } else {
            weekData[q.skill] += q.xpReward;
          }
        }
        if (q.completions) {
          q.completions.forEach(c => {
            if (c.date >= week.start.getTime() && c.date <= week.end.getTime()) {
              if (c.direction === 'negative') {
                weekData[q.skill] -= q.xpReward;
              } else {
                weekData[q.skill] += q.xpReward;
              }
            }
          });
        }
      });

      return weekData;
    });
  }, [quests]);

  // Aggregate weekly mood (1-5 stars) & progress summary
  const weeklySummaryData = useMemo(() => {
    const computeWeekStats = (baseDate: Date) => {
      const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
      const skillXp: Record<SkillType, number> = {
        Fitness: 0,
        Fokus: 0,
        Disziplin: 0,
        Wissen: 0,
        Soziales: 0,
      };

      const dailyBreakdown = days.map((day) => {
        const entry = diaryEntries.find((e) => isSameDay(new Date(e.date), day)) || null;
        let dayXp = 0;
        let completedCount = 0;
        let focusMinutes = 0;

        quests.forEach((q) => {
          if (q.completed && !q.failed && q.completedAt && isSameDay(new Date(q.completedAt), day)) {
            if (q.type === 'habit' && q.habitDirection === 'negative') {
              dayXp -= q.xpReward;
              skillXp[q.skill] -= q.xpReward;
            } else {
              dayXp += q.xpReward;
              skillXp[q.skill] += q.xpReward;
              completedCount += 1;
            }
          }
          if (q.completions) {
            q.completions.forEach((c) => {
              if (isSameDay(new Date(c.date), day)) {
                if (c.direction === 'negative') {
                  dayXp -= q.xpReward;
                  skillXp[q.skill] -= q.xpReward;
                } else {
                  dayXp += q.xpReward;
                  skillXp[q.skill] += q.xpReward;
                  completedCount += 1;
                }
              }
            });
          }
        });

        focusSessions.forEach((f) => {
          if (f.completedAt && isSameDay(new Date(f.completedAt), day)) {
            const mins = f.durationMinutes || 0;
            focusMinutes += mins;
            dayXp += mins;
            if (skillXp[f.skill] !== undefined) {
              skillXp[f.skill] += mins;
            }
          }
        });

        return {
          day,
          shortDay: format(day, 'EEEEEE', { locale: de }),
          dateLabel: format(day, 'dd.MM.'),
          fullDate: format(day, 'dd.MM.yyyy'),
          mood: entry ? entry.mood : null,
          entry,
          xp: Math.max(0, dayXp),
          completedCount,
          focusMinutes,
          isToday: isSameDay(day, new Date()),
        };
      });

      const loggedDays = dailyBreakdown.filter((d) => d.mood !== null);
      const avgMood =
        loggedDays.length > 0
          ? loggedDays.reduce((sum, d) => sum + (d.mood || 0), 0) / loggedDays.length
          : null;

      const totalXp = dailyBreakdown.reduce((sum, d) => sum + d.xp, 0);
      const totalCompleted = dailyBreakdown.reduce((sum, d) => sum + d.completedCount, 0);
      const totalFocusMinutes = dailyBreakdown.reduce((sum, d) => sum + d.focusMinutes, 0);

      const topSkillEntry = (Object.entries(skillXp) as [SkillType, number][])
        .filter(([, val]) => val > 0)
        .sort((a, b) => b[1] - a[1])[0];

      const bestDay =
        loggedDays.length > 0
          ? [...loggedDays].sort((a, b) => (b.mood || 0) - (a.mood || 0) || b.xp - a.xp)[0]
          : null;

      const moodDistribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      loggedDays.forEach((d) => {
        if (d.mood && moodDistribution[d.mood] !== undefined) {
          moodDistribution[d.mood] += 1;
        }
      });

      const reflections = dailyBreakdown
        .filter((d) => d.entry && (d.entry.notes?.trim() || d.entry.progress?.trim()))
        .map((d) => ({
          dateLabel: d.dateLabel,
          shortDay: d.shortDay,
          entry: d.entry!,
        }));

      return {
        weekStart,
        weekEnd,
        dailyBreakdown,
        loggedDaysCount: loggedDays.length,
        avgMood,
        totalXp,
        totalCompleted,
        totalFocusMinutes,
        topSkill: topSkillEntry ? { skill: topSkillEntry[0], xp: topSkillEntry[1] } : null,
        bestDay,
        moodDistribution,
        reflections,
      };
    };

    const current = computeWeekStats(chartDate);
    const previous = computeWeekStats(subWeeks(chartDate, 1));

    const moodDelta =
      current.avgMood !== null && previous.avgMood !== null
        ? Number((current.avgMood - previous.avgMood).toFixed(1))
        : null;
    const xpDelta = current.totalXp - previous.totalXp;

    return {
      ...current,
      moodDelta,
      xpDelta,
      isCurrentWeek: isSameWeek(chartDate, new Date(), { weekStartsOn: 1 }),
    };
  }, [chartDate, diaryEntries, quests, focusSessions]);

  const weekKey = useMemo(
    () => format(weeklySummaryData.weekStart, 'yyyy-MM-dd'),
    [weeklySummaryData.weekStart]
  );

  const currentWeekCoachSummary = useMemo(
    () => weeklyCoachSummaries.find((s) => s.id === weekKey) || null,
    [weeklyCoachSummaries, weekKey]
  );

  const isCoachSummaryStale = useMemo(() => {
    if (!currentWeekCoachSummary) return false;
    return (
      currentWeekCoachSummary.loggedDaysCount !== weeklySummaryData.loggedDaysCount ||
      Math.abs((currentWeekCoachSummary.avgMood ?? 0) - (weeklySummaryData.avgMood ?? 0)) >= 0.05 ||
      currentWeekCoachSummary.totalXp !== weeklySummaryData.totalXp
    );
  }, [currentWeekCoachSummary, weeklySummaryData]);

  const handleGenerateWeeklyCoachSummary = useCallback(
    async (silent = false) => {
      if (isGeneratingSummary) return;
      setIsGeneratingSummary(true);
      setSummaryError(null);
      try {
        const weekLabel = `${format(weeklySummaryData.weekStart, 'dd.MM.')} – ${format(
          weeklySummaryData.weekEnd,
          'dd.MM.yyyy'
        )}`;
        const moodDistributionStr: Record<string, number> = {
          '5': weeklySummaryData.moodDistribution[5] ?? 0,
          '4': weeklySummaryData.moodDistribution[4] ?? 0,
          '3': weeklySummaryData.moodDistribution[3] ?? 0,
          '2': weeklySummaryData.moodDistribution[2] ?? 0,
          '1': weeklySummaryData.moodDistribution[1] ?? 0,
        };

        const { summary } = await generateWeeklyMoodSummary({
          weekLabel,
          avgMood: weeklySummaryData.avgMood,
          moodDelta: weeklySummaryData.moodDelta,
          loggedDaysCount: weeklySummaryData.loggedDaysCount,
          totalXp: weeklySummaryData.totalXp,
          xpDelta: weeklySummaryData.xpDelta,
          totalCompleted: weeklySummaryData.totalCompleted,
          totalFocusMinutes: weeklySummaryData.totalFocusMinutes,
          topSkill: weeklySummaryData.topSkill,
          moodDistribution: moodDistributionStr,
          dailyBreakdown: weeklySummaryData.dailyBreakdown.map((d) => ({
            shortDay: d.shortDay,
            dateLabel: d.dateLabel,
            mood: d.mood,
            moodLabel: d.mood ? MOOD_ICONS[d.mood]?.label : null,
            xp: d.xp,
            completedCount: d.completedCount,
            focusMinutes: d.focusMinutes,
            notes: d.entry?.notes || '',
            progress: d.entry?.progress || '',
          })),
          userLevel: stats.level,
        });

        await saveWeeklyCoachSummary({
          id: weekKey,
          weekStart: weeklySummaryData.weekStart.getTime(),
          summary,
          avgMood: weeklySummaryData.avgMood,
          loggedDaysCount: weeklySummaryData.loggedDaysCount,
          totalXp: weeklySummaryData.totalXp,
          generatedAt: Date.now(),
        });

        if (!silent) {
          toast.success('AI-Coach Wochenfazit generiert!');
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Wochenfazit konnte nicht generiert werden.';
        setSummaryError(message);
        if (!silent) {
          toast.error(message);
        }
      } finally {
        setIsGeneratingSummary(false);
      }
    },
    [isGeneratingSummary, weeklySummaryData, stats.level, saveWeeklyCoachSummary, weekKey]
  );

  useEffect(() => {
    setSummaryError(null);
  }, [weekKey]);

  useEffect(() => {
    if (user && !isInitialized) return;
    if (
      weeklySummaryData.loggedDaysCount > 0 &&
      !currentWeekCoachSummary &&
      !isGeneratingSummary &&
      !autoRequestedWeeksRef.current.has(weekKey)
    ) {
      const timer = setTimeout(() => {
        autoRequestedWeeksRef.current.add(weekKey);
        handleGenerateWeeklyCoachSummary(true);
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [
    user,
    isInitialized,
    weeklySummaryData.loggedDaysCount,
    currentWeekCoachSummary,
    isGeneratingSummary,
    weekKey,
    handleGenerateWeeklyCoachSummary,
  ]);

  // Correlate Food Journal meals with daily mood ratings (1-5 stars)
  const foodMoodCorrelationData = useMemo(() => {
    const now = startOfDay(new Date());
    const cutoffMs =
      foodCorrelationRange === '30d'
        ? subDays(now, 30).getTime()
        : foodCorrelationRange === '90d'
          ? subDays(now, 90).getTime()
          : 0;

    // 1. Build dayKey -> mood rating map
    const moodByDay = new Map<string, { sum: number; count: number; avg: number }>();
    diaryEntries.forEach((entry) => {
      if (typeof entry.mood !== 'number' || entry.mood < 1 || entry.mood > 5) return;
      const dayKey = format(new Date(entry.date), 'yyyy-MM-dd');
      const existing = moodByDay.get(dayKey);
      if (existing) {
        const sum = existing.sum + entry.mood;
        const count = existing.count + 1;
        moodByDay.set(dayKey, { sum, count, avg: sum / count });
      } else {
        moodByDay.set(dayKey, { sum: entry.mood, count: 1, avg: entry.mood });
      }
    });

    // 2. Filter food entries by timeframe & meal type
    const filteredFoods = foodEntries.filter((f) => {
      if (cutoffMs > 0 && f.date < cutoffMs) return false;
      if (foodCorrelationMealType !== 'Alle' && f.type !== foodCorrelationMealType) return false;
      return Boolean(f.name && f.name.trim());
    });

    // 3. Match each food entry to mood on same day or next day
    const matchedDayTotals = new Map<
      string,
      { mood: number; calories: number; protein: number; carbs: number; fat: number }
    >();

    interface MealAccumulator {
      key: string;
      displayName: string;
      totalCount: number;
      typeCounts: Record<string, number>;
      matchedDays: Map<
        string,
        {
          dateKey: string;
          mood: number;
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
        }
      >;
    }

    const mealMap = new Map<string, MealAccumulator>();

    filteredFoods.forEach((food) => {
      const foodDate = new Date(food.date);
      const targetDate = foodCorrelationTiming === 'next_day' ? addDays(foodDate, 1) : foodDate;
      const targetKey = format(targetDate, 'yyyy-MM-dd');
      const moodInfo = moodByDay.get(targetKey);
      if (!moodInfo) return;

      const dayTotal = matchedDayTotals.get(targetKey) || {
        mood: moodInfo.avg,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      };
      dayTotal.calories += food.calories || 0;
      dayTotal.protein += food.protein || 0;
      dayTotal.carbs += food.carbs || 0;
      dayTotal.fat += food.fat || 0;
      matchedDayTotals.set(targetKey, dayTotal);

      const normalizedKey = food.name.trim().toLowerCase();
      let acc = mealMap.get(normalizedKey);
      if (!acc) {
        acc = {
          key: normalizedKey,
          displayName: food.name.trim(),
          totalCount: 0,
          typeCounts: {},
          matchedDays: new Map(),
        };
        mealMap.set(normalizedKey, acc);
      }

      acc.displayName = food.name.trim();
      acc.totalCount += 1;
      acc.typeCounts[food.type] = (acc.typeCounts[food.type] || 0) + 1;

      const existingDay = acc.matchedDays.get(targetKey);
      if (existingDay) {
        existingDay.calories += food.calories || 0;
        existingDay.protein += food.protein || 0;
        existingDay.carbs += food.carbs || 0;
        existingDay.fat += food.fat || 0;
      } else {
        acc.matchedDays.set(targetKey, {
          dateKey: targetKey,
          mood: moodInfo.avg,
          calories: food.calories || 0,
          protein: food.protein || 0,
          carbs: food.carbs || 0,
          fat: food.fat || 0,
        });
      }
    });

    const matchedDaysList = Array.from(matchedDayTotals.values());
    const matchedDaysCount = matchedDaysList.length;
    const baselineAvgMood =
      matchedDaysCount > 0
        ? matchedDaysList.reduce((sum, d) => sum + d.mood, 0) / matchedDaysCount
        : null;

    const meals = Array.from(mealMap.values()).map((acc) => {
      const days = Array.from(acc.matchedDays.values()).sort((a, b) =>
        b.dateKey.localeCompare(a.dateKey)
      );
      const daysCount = days.length;
      const avgMood = days.reduce((sum, d) => sum + d.mood, 0) / daysCount;
      const delta = baselineAvgMood !== null ? avgMood - baselineAvgMood : 0;
      const positiveDays = days.filter((d) => d.mood >= 4).length;
      const neutralDays = days.filter((d) => d.mood >= 2.5 && d.mood < 4).length;
      const negativeDays = days.filter((d) => d.mood < 2.5).length;
      const avgCalories = Math.round(days.reduce((s, d) => s + d.calories, 0) / daysCount);
      const avgProtein = Math.round(days.reduce((s, d) => s + d.protein, 0) / daysCount);
      const avgCarbs = Math.round(days.reduce((s, d) => s + d.carbs, 0) / daysCount);
      const avgFat = Math.round(days.reduce((s, d) => s + d.fat, 0) / daysCount);
      const primaryType =
        Object.entries(acc.typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mahlzeit';

      return {
        key: acc.key,
        name: acc.displayName,
        shortName:
          acc.displayName.length > 18 ? acc.displayName.slice(0, 18) + '…' : acc.displayName,
        primaryType,
        daysCount,
        totalCount: acc.totalCount,
        avgMood,
        delta,
        positiveDays,
        neutralDays,
        negativeDays,
        avgCalories,
        avgProtein,
        avgCarbs,
        avgFat,
        days,
      };
    });

    const positiveMeals = meals
      .filter((m) => m.avgMood >= 3.5 || (m.delta >= 0.2 && m.avgMood >= 3.1))
      .sort((a, b) => b.avgMood - a.avgMood || b.delta - a.delta || b.daysCount - a.daysCount);

    const negativeMeals = meals
      .filter((m) => m.avgMood <= 2.9 || (m.delta <= -0.25 && m.avgMood < 3.5))
      .sort((a, b) => a.avgMood - b.avgMood || a.delta - b.delta || b.daysCount - a.daysCount);

    const chartMeals = [...meals]
      .sort((a, b) => b.daysCount - a.daysCount || Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8)
      .sort((a, b) => b.avgMood - a.avgMood);

    const goodMoodDays = matchedDaysList.filter((d) => d.mood >= 4);
    const lowMoodDays = matchedDaysList.filter((d) => d.mood <= 2);

    const avgMacros = (list: typeof matchedDaysList) =>
      list.length > 0
        ? {
            count: list.length,
            calories: Math.round(list.reduce((s, d) => s + d.calories, 0) / list.length),
            protein: Math.round(list.reduce((s, d) => s + d.protein, 0) / list.length),
            carbs: Math.round(list.reduce((s, d) => s + d.carbs, 0) / list.length),
            fat: Math.round(list.reduce((s, d) => s + d.fat, 0) / list.length),
          }
        : null;

    return {
      matchedDaysCount,
      baselineAvgMood,
      meals,
      positiveMeals,
      negativeMeals,
      chartMeals,
      topPositive: positiveMeals[0] || null,
      topNegative: negativeMeals[0] || null,
      goodDayMacros: avgMacros(goodMoodDays),
      lowDayMacros: avgMacros(lowMoodDays),
      hasAnyFoods: foodEntries.length > 0,
      hasAnyMoods: moodByDay.size > 0,
    };
  }, [
    foodEntries,
    diaryEntries,
    foodCorrelationRange,
    foodCorrelationTiming,
    foodCorrelationMealType,
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = widgetOrder.indexOf(active.id as string);
      const newIndex = widgetOrder.indexOf(over.id as string);
      updateWidgetOrder(arrayMove(widgetOrder, oldIndex, newIndex));
    }
  };

  const visibleWidgetIds = useMemo(
    () =>
      widgetOrder.filter(
        (id) => id !== 'skills' && id !== 'completed' && !hiddenWidgets.includes(id)
      ),
    [widgetOrder, hiddenWidgets]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Charakterstatus</h2>
          <p className="text-neutral-400">Dein aktueller Fortschritt, Stimmung &amp; Erholung</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsCustomizeOpen((prev) => !prev)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors min-h-[40px]',
              isCustomizeOpen
                ? 'bg-amber-500 text-neutral-950 border-amber-500'
                : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Widgets anpassen</span>
            {hiddenWidgets.length > 0 && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-md text-[10px] tabular-nums',
                  isCustomizeOpen ? 'bg-neutral-950/20 text-neutral-950' : 'bg-neutral-800 text-amber-400'
                )}
              >
                {hiddenWidgets.length} ausgeblendet
              </span>
            )}
          </button>

          {permission !== 'granted' && (
            <button
              type="button"
              onClick={requestPermission}
              className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3.5 py-2 rounded-xl text-xs font-bold text-neutral-300 hover:text-amber-400 hover:border-amber-500/40 transition-colors min-h-[40px]"
            >
              <Bell className="w-4 h-4" />
              Benachrichtigungen
            </button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {isCustomizeOpen && (
          <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Dashboard-Widgets ein- oder ausblenden</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Reihenfolge lässt sich zusätzlich per Drag &amp; Drop am Griff rechts oben ändern.
                </p>
              </div>
              <button
                type="button"
                onClick={resetDashboardLayout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Standard wiederherstellen
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(WIDGET_LABELS).map(([id, label]) => {
                const isVisible = !hiddenWidgets.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleWidgetVisibility(id)}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors min-h-[36px]',
                      isVisible
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                    )}
                  >
                    {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleWidgetIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleWidgetIds.map(id => {
              switch (id) {
                case 'avatar':
                  return (
                    <SortableWidget key="avatar" id="avatar" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 flex flex-col items-center justify-between text-center h-full gap-4">
                        <div className="flex flex-col items-center pt-2">
                          <AvatarVisual level={stats.level} size="md" className="mb-3" />
                          <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest mb-0.5">
                            Dein Rang
                          </div>
                          <div className="text-xl font-black text-white tabular-nums">
                            Level {stats.level}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('avatar')}
                          className="w-full py-2 px-3 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-amber-500/40 text-xs font-bold text-neutral-300 hover:text-amber-400 transition-colors min-h-[38px]"
                        >
                          Avatar &amp; Ausrüstung →
                        </button>
                      </div>
                    </SortableWidget>
                  );
                case 'level':
                  return (
                    <SortableWidget key="level" id="level" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 flex flex-col items-center justify-center text-center h-full">
                        <div className="w-full">
                          <div className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">
                            Aktuelles Level
                          </div>
                          <div className="text-6xl sm:text-7xl font-black mb-4 tabular-nums">
                            {stats.level}
                          </div>
                          <div className="w-full max-w-md mx-auto space-y-2">
                            <div className="flex justify-between text-sm text-neutral-400 font-mono tabular-nums">
                              <span>{stats.xp} EP</span>
                              <span>{stats.xpToNextLevel} EP</span>
                            </div>
                            <ProgressBar progress={progress} colorClass="bg-amber-500" className="h-3" />
                          </div>
                        </div>
                      </div>
                    </SortableWidget>
                  );
                case 'streak':
                  return (
                    <SortableWidget key="streak" id="streak" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 flex flex-col items-center justify-center text-center h-full">
                        <Flame className="w-11 h-11 text-orange-500 mb-3" />
                        <div className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">
                          Tägliche Serie
                        </div>
                        <div className="text-4xl font-black text-orange-500 tabular-nums">
                          {currentStreak}
                        </div>
                        <div className="text-sm text-neutral-500 mt-1.5">Tage aktiv</div>
                      </div>
                    </SortableWidget>
                  );
                case 'mood': {
                  const activeRating = hoverMood ?? todayMoodEntry?.mood ?? 0;
                  const activeMoodMeta = activeRating > 0 ? MOOD_ICONS[activeRating] : null;
                  const ActiveMoodIcon = activeMoodMeta?.icon;
                  return (
                    <SortableWidget key="mood" id="mood" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 flex flex-col justify-between h-full">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                              <Star className="w-5 h-5 text-amber-500 fill-amber-500/20" />
                              Tagesstimmung
                            </h3>
                            <p className="text-xs text-neutral-400 mt-0.5 capitalize">
                              {format(new Date(), 'EEEE, d. MMMM', { locale: de })}
                            </p>
                          </div>
                          {todayMoodEntry && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                              <CheckCircle2 className="w-3 h-3" />
                              Geloggt
                            </span>
                          )}
                        </div>

                        <div className="my-5 flex flex-col items-center justify-center">
                          <div
                            className="flex items-center justify-center gap-1.5 sm:gap-2"
                            role="radiogroup"
                            aria-label="Tagesstimmung bewerten (1 bis 5 Sterne)"
                            onMouseLeave={() => setHoverMood(null)}
                          >
                            {[1, 2, 3, 4, 5].map((rating) => {
                              const isHighlighted = rating <= activeRating;
                              const isSelected = todayMoodEntry?.mood === rating;
                              return (
                                <button
                                  key={rating}
                                  type="button"
                                  role="radio"
                                  aria-checked={isSelected}
                                  aria-label={`${rating} von 5 Sternen (${MOOD_ICONS[rating].label})`}
                                  disabled={isSavingMood}
                                  onMouseEnter={() => setHoverMood(rating)}
                                  onClick={() => handleSelectDailyMood(rating)}
                                  className={cn(
                                    "p-1.5 rounded-xl transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:scale-90",
                                    isHighlighted
                                      ? "bg-amber-500/10"
                                      : "hover:bg-neutral-800/70"
                                  )}
                                >
                                  <Star
                                    className={cn(
                                      "w-8 h-8 transition-all duration-150",
                                      isHighlighted
                                        ? "fill-amber-400 text-amber-400 scale-105 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]"
                                        : "text-neutral-700 hover:text-neutral-500"
                                    )}
                                  />
                                </button>
                              );
                            })}
                          </div>

                          <div className="mt-3 min-h-[24px] flex items-center justify-center">
                            {activeMoodMeta && ActiveMoodIcon ? (
                              <div className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold", activeMoodMeta.bg, activeMoodMeta.color)}>
                                <ActiveMoodIcon className="w-3.5 h-3.5" />
                                <span>{activeRating}/5 – {activeMoodMeta.label}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-neutral-500">
                                Tippe 1–5 Sterne für deinen heutigen Zustand
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-500">
                          <span>
                            {todayMoodEntry
                              ? 'Klicke einen Stern zum Aktualisieren'
                              : 'Wird direkt für heute gespeichert'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveTab('diary')}
                            className="text-amber-500 hover:text-amber-400 font-semibold transition-colors"
                          >
                            Tagebuch →
                          </button>
                        </div>
                      </div>
                    </SortableWidget>
                  );
                }
                case 'energy_recovery':
                  return (
                    <SortableWidget key="energy_recovery" id="energy_recovery" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <EnergyRecoveryWidget onNavigateToQuests={() => setActiveTab('quests')} />
                    </SortableWidget>
                  );
                case 'weekly_summary': {
                  const roundedAvg = weeklySummaryData.avgMood !== null ? Math.round(weeklySummaryData.avgMood) : null;
                  const avgMoodMeta = roundedAvg ? MOOD_ICONS[roundedAvg] : null;
                  return (
                    <SortableWidget key="weekly_summary" id="weekly_summary" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full flex flex-col gap-5">
                        {/* Header + Week Switcher */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                              <Sparkles className="w-5 h-5 text-amber-500" />
                              Wöchentliche Zusammenfassung
                            </h3>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              Aggregierte Stimmung (1–5 Sterne) & Fortschritte
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 rounded-xl p-1 self-start sm:self-auto">
                            <button
                              type="button"
                              onClick={prevWeek}
                              className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
                              aria-label="Vorherige Woche"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-bold text-neutral-300 px-2 whitespace-nowrap">
                              {format(weeklySummaryData.weekStart, 'dd.MM.')} – {format(weeklySummaryData.weekEnd, 'dd.MM.yyyy')}
                            </span>
                            <button
                              type="button"
                              onClick={nextWeek}
                              disabled={weeklySummaryData.isCurrentWeek}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                weeklySummaryData.isCurrentWeek
                                  ? "text-neutral-700 cursor-not-allowed"
                                  : "hover:bg-neutral-800 text-neutral-400 hover:text-white"
                              )}
                              aria-label="Nächste Woche"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                            {!weeklySummaryData.isCurrentWeek && (
                              <button
                                type="button"
                                onClick={() => setChartDate(new Date())}
                                className="px-2 py-1 text-[10px] font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 rounded-lg transition-colors ml-0.5"
                              >
                                Aktuell
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Top KPI Row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {/* Avg Mood */}
                          <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Ø Stimmung</span>
                            <div className="mt-1.5 flex items-baseline gap-1.5">
                              <span className="text-2xl font-black text-amber-400">
                                {weeklySummaryData.avgMood !== null ? weeklySummaryData.avgMood.toFixed(1) : '–'}
                              </span>
                              <span className="text-xs text-neutral-500 font-bold">/ 5 ★</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-1 text-[11px]">
                              <span className={cn("font-semibold truncate", avgMoodMeta?.color || "text-neutral-500")}>
                                {avgMoodMeta ? avgMoodMeta.label : `${weeklySummaryData.loggedDaysCount}/7 Tage`}
                              </span>
                              {weeklySummaryData.moodDelta !== null && (
                                <span className={cn(
                                  "inline-flex items-center gap-0.5 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  weeklySummaryData.moodDelta >= 0
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : "bg-rose-500/10 text-rose-400"
                                )}>
                                  {weeklySummaryData.moodDelta >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                                  {weeklySummaryData.moodDelta > 0 ? `+${weeklySummaryData.moodDelta}` : weeklySummaryData.moodDelta}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Weekly XP */}
                          <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Wochen-EP</span>
                            <div className="mt-1.5 flex items-baseline gap-1">
                              <span className="text-2xl font-black text-white">+{weeklySummaryData.totalXp}</span>
                              <span className="text-xs text-amber-500 font-bold">EP</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-1 text-[11px]">
                              <span className="text-neutral-500">vs. Vorwoche</span>
                              <span className={cn(
                                "font-mono text-[10px] font-bold px-1.5 py-0.5 rounded",
                                weeklySummaryData.xpDelta >= 0
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-rose-500/10 text-rose-400"
                              )}>
                                {weeklySummaryData.xpDelta > 0 ? `+${weeklySummaryData.xpDelta}` : weeklySummaryData.xpDelta} EP
                              </span>
                            </div>
                          </div>

                          {/* Completed Tasks */}
                          <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Abgeschlossen</span>
                            <div className="mt-1.5 flex items-baseline gap-1.5">
                              <span className="text-2xl font-black text-emerald-400">{weeklySummaryData.totalCompleted}</span>
                              <span className="text-xs text-neutral-500 font-bold">Quests</span>
                            </div>
                            <div className="mt-2 text-[11px] text-neutral-400 truncate">
                              {weeklySummaryData.loggedDaysCount}/7 Tage Stimmung
                            </div>
                          </div>

                          {/* Focus & Top Skill */}
                          <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Top-Skill & Fokus</span>
                            <div className="mt-1.5 flex items-baseline gap-1.5 truncate">
                              <span className={cn(
                                "text-lg font-black truncate",
                                weeklySummaryData.topSkill ? SKILL_COLORS[weeklySummaryData.topSkill.skill] : "text-neutral-500"
                              )}>
                                {weeklySummaryData.topSkill ? weeklySummaryData.topSkill.skill : '–'}
                              </span>
                            </div>
                            <div className="mt-2 text-[11px] text-neutral-400 flex items-center justify-between gap-1">
                              <span>{weeklySummaryData.totalFocusMinutes} Min Fokus</span>
                              {weeklySummaryData.topSkill && (
                                <span className="font-mono text-[10px] text-amber-400">+{weeklySummaryData.topSkill.xp}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Combined Mood + XP Chart */}
                        <div className="h-[185px] w-full bg-neutral-950/50 border border-neutral-800/80 rounded-xl p-3">
                          <WeeklySummaryChart data={weeklySummaryData.dailyBreakdown} />
                        </div>

                        {/* 7-Day Interactive Strip */}
                        <div className="grid grid-cols-7 gap-1.5">
                          {weeklySummaryData.dailyBreakdown.map((d) => {
                            const moodMeta = d.mood ? MOOD_ICONS[d.mood] : null;
                            const MoodIcon = moodMeta?.icon;
                            return (
                              <button
                                key={d.fullDate}
                                type="button"
                                onClick={() => {
                                  if (d.entry) {
                                    setSelectedEntry(d.entry);
                                  } else if (d.isToday) {
                                    toast.info('Wähle im Tagesstimmung-Widget 1–5 Sterne für heute.');
                                  }
                                }}
                                className={cn(
                                  "p-2 rounded-xl border flex flex-col items-center justify-between gap-1 text-center transition-all",
                                  d.isToday
                                    ? "border-amber-500/50 bg-amber-500/5"
                                    : "border-neutral-800 bg-neutral-950/60",
                                  d.entry ? "hover:border-amber-500/40 cursor-pointer" : "cursor-default"
                                )}
                              >
                                <span className={cn(
                                  "text-[10px] font-bold uppercase",
                                  d.isToday ? "text-amber-400" : "text-neutral-500"
                                )}>
                                  {d.shortDay}
                                </span>
                                {d.mood && MoodIcon && moodMeta ? (
                                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", moodMeta.bg)} title={`${d.mood}/5 Sterne – ${moodMeta.label}`}>
                                    <MoodIcon className={cn("w-4 h-4", moodMeta.color)} />
                                  </div>
                                ) : (
                                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-neutral-900/80 text-neutral-700 text-xs font-bold">
                                    –
                                  </div>
                                )}
                                <span className="text-[10px] font-mono font-bold text-amber-400">
                                  {d.mood ? `${d.mood}★` : '0★'}
                                </span>
                                <span className="text-[9px] font-mono text-neutral-500">
                                  +{d.xp}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {/* AI-Coach Motivational Weekly Summary */}
                        <div className="bg-gradient-to-br from-amber-500/10 via-neutral-950/90 to-neutral-950 border border-amber-500/25 rounded-xl p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                                <Bot className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                                  AI-Coach Wochenfazit
                                </h4>
                                <p className="text-[11px] text-neutral-400">
                                  {weeklySummaryData.loggedDaysCount > 0
                                    ? `Basierend auf ${weeklySummaryData.loggedDaysCount}/7 Stimmungstagen${
                                        weeklySummaryData.avgMood !== null
                                          ? ` · Ø ${weeklySummaryData.avgMood.toFixed(1)} ★`
                                          : ''
                                      }`
                                    : 'Motivationsimpuls basierend auf deinen Wochenwerten'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isCoachSummaryStale && !isGeneratingSummary && (
                                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md">
                                  Neue Werte verfügbar
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleGenerateWeeklyCoachSummary(false)}
                                disabled={isGeneratingSummary}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50",
                                  isCoachSummaryStale || !currentWeekCoachSummary
                                    ? "bg-amber-500 text-neutral-950 hover:bg-amber-400"
                                    : "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700"
                                )}
                              >
                                {isGeneratingSummary ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Analysiere...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    {currentWeekCoachSummary ? 'Aktualisieren' : 'Fazit generieren'}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {isGeneratingSummary && !currentWeekCoachSummary ? (
                            <div className="py-4 flex items-center gap-2.5 text-xs text-neutral-400">
                              <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                              <span>Dein AI-Coach wertet deine Stimmungswerte und Fortschritte aus...</span>
                            </div>
                          ) : summaryError ? (
                            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5 text-xs text-rose-300">
                              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <p className="font-semibold">AI-Coach konnte das Wochenfazit nicht erstellen</p>
                                <p className="text-rose-300/80">{summaryError}</p>
                              </div>
                            </div>
                          ) : currentWeekCoachSummary ? (
                            <div className="space-y-2.5">
                              <div className="prose prose-invert prose-sm max-w-none text-neutral-200 leading-relaxed [&_strong]:text-amber-300 [&_p]:my-1.5">
                                <ReactMarkdown>{currentWeekCoachSummary.summary}</ReactMarkdown>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800/70 text-[11px] text-neutral-500">
                                <span>
                                  Erstellt am {format(new Date(currentWeekCoachSummary.generatedAt), 'dd.MM.yyyy, HH:mm', { locale: de })} Uhr
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('coach')}
                                  className="text-amber-400 hover:text-amber-300 font-semibold transition-colors"
                                >
                                  Im AI-Coach vertiefen →
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-neutral-400 leading-relaxed">
                              Logge oben im widget „Tagesstimmung“ mindestens einen Tag mit 1–5 Sternen oder klicke auf „Fazit generieren“, damit dein AI-Coach einen persönlichen Motivationstext für deine Woche erstellt.
                            </p>
                          )}
                        </div>

                        {/* Footer Highlights */}
                        <div className="pt-3 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center gap-3 text-neutral-400">
                            {weeklySummaryData.bestDay && weeklySummaryData.bestDay.mood && (
                              <span className="inline-flex items-center gap-1.5">
                                <Award className="w-3.5 h-3.5 text-amber-500" />
                                Bester Tag: <strong className="text-white">{weeklySummaryData.bestDay.shortDay} ({weeklySummaryData.bestDay.mood}/5 ★)</strong>
                              </span>
                            )}
                            {weeklySummaryData.reflections.length > 0 && (
                              <span className="inline-flex items-center gap-1.5">
                                <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                                {weeklySummaryData.reflections.length} {weeklySummaryData.reflections.length === 1 ? 'Notiz' : 'Notizen'}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('diary')}
                            className="text-amber-500 hover:text-amber-400 font-semibold transition-colors ml-auto"
                          >
                            Alle Einträge im Tagebuch →
                          </button>
                        </div>
                      </div>
                    </SortableWidget>
                  );
                }
                case 'weekly_retrospective':
                  return (
                    <SortableWidget key="weekly_retrospective" id="weekly_retrospective" className="col-span-1 md:col-span-2 lg:col-span-3">
                      <WeeklyRetrospectiveWidget
                        onNavigateToQuests={() => setActiveTab('quests')}
                        onNavigateToCoach={() => setActiveTab('coach')}
                      />
                    </SortableWidget>
                  );
                case 'food_mood_correlation': {
                  const data = foodMoodCorrelationData;
                  return (
                    <SortableWidget key="food_mood_correlation" id="food_mood_correlation" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full flex flex-col gap-5">
                        {/* Header & Controls */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          <div>
                            <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                              <Utensils className="w-5 h-5 text-amber-500" />
                              Ernährung & Stimmung
                            </h3>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              Zusammenhang zwischen Mahlzeiten aus dem Food Journal und deinen Stimmungswerten
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Same day vs Next day */}
                            <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl p-1 text-[11px] font-bold">
                              <button
                                type="button"
                                onClick={() => setFoodCorrelationTiming('same_day')}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg transition-colors",
                                  foodCorrelationTiming === 'same_day'
                                    ? "bg-amber-500 text-neutral-950"
                                    : "text-neutral-400 hover:text-white"
                                )}
                              >
                                Gleicher Tag
                              </button>
                              <button
                                type="button"
                                onClick={() => setFoodCorrelationTiming('next_day')}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg transition-colors",
                                  foodCorrelationTiming === 'next_day'
                                    ? "bg-amber-500 text-neutral-950"
                                    : "text-neutral-400 hover:text-white"
                                )}
                              >
                                Folgetag
                              </button>
                            </div>

                            {/* Range filter */}
                            <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl p-1 text-[11px] font-bold">
                              {([
                                { id: '30d', label: '30T' },
                                { id: '90d', label: '90T' },
                                { id: 'all', label: 'Alle' },
                              ] as const).map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => setFoodCorrelationRange(r.id)}
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg transition-colors",
                                    foodCorrelationRange === r.id
                                      ? "bg-neutral-800 text-white"
                                      : "text-neutral-500 hover:text-neutral-300"
                                  )}
                                >
                                  {r.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Secondary Filter Bar: Meal Type & View Switch */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(['Alle', 'Frühstück', 'Mittagessen', 'Abendessen', 'Snack'] as const).map((mealType) => (
                              <button
                                key={mealType}
                                type="button"
                                onClick={() => setFoodCorrelationMealType(mealType)}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors",
                                  foodCorrelationMealType === mealType
                                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                                    : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white"
                                )}
                              >
                                {mealType}
                              </button>
                            ))}
                          </div>

                          {data.meals.length > 0 && (
                            <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl p-1 text-[11px] font-bold">
                              <button
                                type="button"
                                onClick={() => setFoodCorrelationView('split')}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg transition-colors",
                                  foodCorrelationView === 'split'
                                    ? "bg-neutral-800 text-white"
                                    : "text-neutral-500 hover:text-neutral-300"
                                )}
                              >
                                Positiv vs. Negativ
                              </button>
                              <button
                                type="button"
                                onClick={() => setFoodCorrelationView('chart')}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg transition-colors",
                                  foodCorrelationView === 'chart'
                                    ? "bg-neutral-800 text-white"
                                    : "text-neutral-500 hover:text-neutral-300"
                                )}
                              >
                                Vergleichs-Chart
                              </button>
                            </div>
                          )}
                        </div>

                        {data.matchedDaysCount === 0 ? (
                          <div className="flex-1 bg-neutral-950/70 border border-dashed border-neutral-800 rounded-xl p-6 text-center flex flex-col items-center justify-center gap-3">
                            <Utensils className="w-8 h-8 text-neutral-700" />
                            <div className="space-y-1 max-w-md">
                              <p className="text-sm font-bold text-neutral-300">
                                Noch keine verknüpften Food- & Stimmungsdaten
                              </p>
                              <p className="text-xs text-neutral-500 leading-relaxed">
                                {!data.hasAnyFoods
                                  ? 'Erfasse deine Mahlzeiten im Food Journal und bewerte deine Tagesstimmung (1–5 Sterne), um Zusammenhänge zu erkennen.'
                                  : !data.hasAnyMoods
                                    ? 'Du hast bereits Mahlzeiten erfasst! Logge noch deine Tagesstimmung (1–5 Sterne), damit Korrelationen berechnet werden können.'
                                    : 'Im gewählten Zeitraum oder für diese Mahlzeiten-Kategorie liegen noch keine gemeinsamen Tage vor.'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveTab('food')}
                              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold rounded-xl transition-colors"
                            >
                              Zum Food Journal →
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Summary KPI Strip */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                  Datenbasis ({foodCorrelationTiming === 'same_day' ? 'Gleicher Tag' : 'Folgetag'})
                                </span>
                                <div className="mt-1 flex items-baseline gap-2">
                                  <span className="text-2xl font-black text-white">{data.matchedDaysCount}</span>
                                  <span className="text-xs text-neutral-400 font-semibold">
                                    {data.matchedDaysCount === 1 ? 'Tag' : 'Tage'} · {data.meals.length} Mahlzeiten
                                  </span>
                                </div>
                                <p className="mt-1 text-[11px] text-neutral-500">
                                  Basis-Schnitt: <strong className="text-amber-400">{data.baselineAvgMood?.toFixed(1)} / 5 ★</strong>
                                </p>
                              </div>

                              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                                  <ThumbsUp className="w-3 h-3" /> Top Stimmungs-Booster
                                </span>
                                {data.topPositive ? (
                                  <>
                                    <div className="mt-1 text-sm font-bold text-white truncate" title={data.topPositive.name}>
                                      {data.topPositive.name}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-xs">
                                      <span className="font-mono font-bold text-emerald-400">
                                        Ø {data.topPositive.avgMood.toFixed(1)} ★
                                      </span>
                                      <span className="font-mono text-[11px] text-emerald-300/80">
                                        ({data.topPositive.delta >= 0 ? '+' : ''}{data.topPositive.delta.toFixed(1)} vs. Ø · {data.topPositive.daysCount}×)
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <p className="mt-2 text-xs text-neutral-500">Noch keine positiven Ausreißer</p>
                                )}
                              </div>

                              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                                  <ThumbsDown className="w-3 h-3" /> Mögliche Stimmungs-Dämpfer
                                </span>
                                {data.topNegative ? (
                                  <>
                                    <div className="mt-1 text-sm font-bold text-white truncate" title={data.topNegative.name}>
                                      {data.topNegative.name}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-xs">
                                      <span className="font-mono font-bold text-rose-400">
                                        Ø {data.topNegative.avgMood.toFixed(1)} ★
                                      </span>
                                      <span className="font-mono text-[11px] text-rose-300/80">
                                        ({data.topNegative.delta >= 0 ? '+' : ''}{data.topNegative.delta.toFixed(1)} vs. Ø · {data.topNegative.daysCount}×)
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <p className="mt-2 text-xs text-neutral-400">Keine negativen Muster erkannt</p>
                                )}
                              </div>
                            </div>

                            {foodCorrelationView === 'chart' ? (
                              <div className="h-[240px] w-full bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3">
                                <FoodMoodChart data={data.chartMeals} />
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Positive Correlation List */}
                                <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                      <TrendingUp className="w-3.5 h-3.5" />
                                      Positive Stimmungskorrelation
                                    </h4>
                                    <span className="text-[10px] font-mono text-neutral-500">
                                      {data.positiveMeals.length} {data.positiveMeals.length === 1 ? 'Mahlzeit' : 'Mahlzeiten'}
                                    </span>
                                  </div>

                                  {data.positiveMeals.length === 0 ? (
                                    <p className="text-xs text-neutral-500 py-4 text-center">
                                      Keine Mahlzeiten mit positiver Stimmungskorrelation im Zeitraum.
                                    </p>
                                  ) : (
                                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                      {data.positiveMeals.slice(0, 6).map((meal) => {
                                        const isExpanded = expandedMealKey === `pos-${meal.key}`;
                                        return (
                                          <div
                                            key={meal.key}
                                            className="bg-neutral-900/90 border border-neutral-800 hover:border-emerald-500/35 rounded-xl p-3 transition-colors"
                                          >
                                            <button
                                              type="button"
                                              onClick={() => setExpandedMealKey(isExpanded ? null : `pos-${meal.key}`)}
                                              className="w-full text-left space-y-1.5"
                                            >
                                              <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                  <p className="text-sm font-bold text-white truncate">{meal.name}</p>
                                                  <p className="text-[11px] text-neutral-400">
                                                    {meal.primaryType} · {meal.daysCount}× Tage · {meal.avgCalories} kcal
                                                    {meal.avgProtein > 0 ? ` · ${meal.avgProtein}g Prot` : ''}
                                                  </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                  <span className="text-xs font-mono font-black text-emerald-400">
                                                    {meal.avgMood.toFixed(1)} ★
                                                  </span>
                                                  <div className="text-[10px] font-mono text-emerald-400/80">
                                                    {meal.delta >= 0 ? '+' : ''}{meal.delta.toFixed(1)} vs. Ø
                                                  </div>
                                                </div>
                                              </div>
                                              <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden">
                                                <div
                                                  className="h-full bg-emerald-500 rounded-full"
                                                  style={{ width: `${Math.min(100, (meal.avgMood / 5) * 100)}%` }}
                                                />
                                              </div>
                                            </button>

                                            {isExpanded && (
                                              <div className="mt-2.5 pt-2 border-t border-neutral-800 space-y-1">
                                                {meal.days.slice(0, 4).map((d) => (
                                                  <div key={d.dateKey} className="flex items-center justify-between text-[11px] text-neutral-400">
                                                    <span>{d.dateKey.split('-').reverse().join('.')}</span>
                                                    <span className="font-mono text-neutral-500">{d.calories} kcal</span>
                                                    <span className="font-mono font-bold text-amber-400">{d.mood.toFixed(1)} ★</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* Negative Correlation List */}
                                <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                                      <TrendingDown className="w-3.5 h-3.5" />
                                      Negative Stimmungskorrelation
                                    </h4>
                                    <span className="text-[10px] font-mono text-neutral-500">
                                      {data.negativeMeals.length} {data.negativeMeals.length === 1 ? 'Mahlzeit' : 'Mahlzeiten'}
                                    </span>
                                  </div>

                                  {data.negativeMeals.length === 0 ? (
                                    <div className="py-6 text-center space-y-1">
                                      <p className="text-xs font-semibold text-neutral-300">
                                        Keine negativen Korrelationen gefunden
                                      </p>
                                      <p className="text-[11px] text-neutral-500">
                                        Alle erfassten Mahlzeiten lagen bei guter oder neutraler Stimmung.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                      {data.negativeMeals.slice(0, 6).map((meal) => {
                                        const isExpanded = expandedMealKey === `neg-${meal.key}`;
                                        return (
                                          <div
                                            key={meal.key}
                                            className="bg-neutral-900/90 border border-neutral-800 hover:border-rose-500/35 rounded-xl p-3 transition-colors"
                                          >
                                            <button
                                              type="button"
                                              onClick={() => setExpandedMealKey(isExpanded ? null : `neg-${meal.key}`)}
                                              className="w-full text-left space-y-1.5"
                                            >
                                              <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                  <p className="text-sm font-bold text-white truncate">{meal.name}</p>
                                                  <p className="text-[11px] text-neutral-400">
                                                    {meal.primaryType} · {meal.daysCount}× Tage · {meal.avgCalories} kcal
                                                    {meal.avgCarbs > 0 ? ` · ${meal.avgCarbs}g Carbs` : ''}
                                                  </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                  <span className="text-xs font-mono font-black text-rose-400">
                                                    {meal.avgMood.toFixed(1)} ★
                                                  </span>
                                                  <div className="text-[10px] font-mono text-rose-400/80">
                                                    {meal.delta >= 0 ? '+' : ''}{meal.delta.toFixed(1)} vs. Ø
                                                  </div>
                                                </div>
                                              </div>
                                              <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden">
                                                <div
                                                  className="h-full bg-rose-500 rounded-full"
                                                  style={{ width: `${Math.min(100, (meal.avgMood / 5) * 100)}%` }}
                                                />
                                              </div>
                                            </button>

                                            {isExpanded && (
                                              <div className="mt-2.5 pt-2 border-t border-neutral-800 space-y-1">
                                                {meal.days.slice(0, 4).map((d) => (
                                                  <div key={d.dateKey} className="flex items-center justify-between text-[11px] text-neutral-400">
                                                    <span>{d.dateKey.split('-').reverse().join('.')}</span>
                                                    <span className="font-mono text-neutral-500">{d.calories} kcal</span>
                                                    <span className="font-mono font-bold text-rose-400">{d.mood.toFixed(1)} ★</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Macro Comparison Insight Strip */}
                            <div className="bg-neutral-950/80 border border-neutral-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                              <div className="flex flex-wrap items-center gap-4">
                                {data.goodDayMacros && (
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    <span className="text-neutral-400">
                                      Gute Tage (4–5★):{' '}
                                      <strong className="text-white">
                                        {data.goodDayMacros.calories} kcal
                                      </strong>
                                      <span className="text-neutral-500 ml-1">
                                        (P {data.goodDayMacros.protein}g · C {data.goodDayMacros.carbs}g · F {data.goodDayMacros.fat}g)
                                      </span>
                                    </span>
                                  </div>
                                )}
                                {data.lowDayMacros && (
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                                    <span className="text-neutral-400">
                                      Schwächere Tage (1–2★):{' '}
                                      <strong className="text-white">
                                        {data.lowDayMacros.calories} kcal
                                      </strong>
                                      <span className="text-neutral-500 ml-1">
                                        (P {data.lowDayMacros.protein}g · C {data.lowDayMacros.carbs}g · F {data.lowDayMacros.fat}g)
                                      </span>
                                    </span>
                                  </div>
                                )}
                                {!data.goodDayMacros && !data.lowDayMacros && (
                                  <span className="text-neutral-500">
                                    Klicke auf eine Mahlzeit, um einzelne Tage & Werte anzuzeigen.
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveTab('food')}
                                className="text-amber-500 hover:text-amber-400 font-semibold transition-colors ml-auto"
                              >
                                Zum Food Journal →
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </SortableWidget>
                  );
                }
                case 'trend':
                  return (
                    <SortableWidget key="trend" id="trend" className="col-span-1 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="text-xl font-bold flex items-center gap-2">
                              <BarChart2 className="w-5 h-5 text-amber-500" />
                              Fähigkeits-Trends (4 Wochen)
                            </h3>
                            <p className="text-xs text-neutral-500 mt-1 uppercase tracking-widest font-bold">Wöchentlicher EP-Fortschritt</p>
                          </div>
                        </div>

                        <div className="h-[300px] w-full">
                          <FourWeekTrendChart data={fourWeekTrendData} />
                        </div>
                      </div>
                    </SortableWidget>
                  );
                case 'chart':
                  return (
                    <SortableWidget key="chart" id="chart" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-6">
                          <h3 className="text-xl font-bold flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-amber-500" />
                            Wöchentliche EP Übersicht
                          </h3>
                          <div className="flex items-center gap-2">
                            {!weeklySummaryData.isCurrentWeek && (
                              <button
                                type="button"
                                onClick={() => setChartDate(new Date())}
                                className="px-2 py-1 text-[10px] font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 rounded-lg transition-colors"
                              >
                                Aktuell
                              </button>
                            )}
                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider tabular-nums">
                              {format(startOfWeek(chartDate, { weekStartsOn: 1 }), 'dd.MM.')} – {format(endOfWeek(chartDate, { weekStartsOn: 1 }), 'dd.MM.yyyy')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 h-[300px] w-full -ml-2">
                          <button
                            type="button"
                            onClick={prevWeek}
                            className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors z-10"
                            aria-label="Vorherige Woche"
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </button>
                          <div className="flex-1 h-full min-w-0">
                            <WeeklyXpChart data={weeklyXpData} />
                          </div>
                          <button
                            type="button"
                            onClick={nextWeek}
                            disabled={weeklySummaryData.isCurrentWeek}
                            className={cn(
                              'p-2 rounded-full transition-colors z-10',
                              weeklySummaryData.isCurrentWeek
                                ? 'text-neutral-700 cursor-not-allowed'
                                : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
                            )}
                            aria-label="Nächste Woche"
                          >
                            <ChevronRight className="w-6 h-6" />
                          </button>
                        </div>
                      </div>
                    </SortableWidget>
                  );
                case 'recurring_chart':
                  return (
                    <SortableWidget key="recurring_chart" id="recurring_chart" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <div className="flex flex-wrap justify-between items-center gap-2 mb-6">
                          <h3 className="text-xl font-bold flex items-center gap-2">
                            <Target className="w-5 h-5 text-amber-500" />
                            Wiederkehrende Quests
                          </h3>
                          <div className="flex items-center gap-2">
                            {!weeklySummaryData.isCurrentWeek && (
                              <button
                                type="button"
                                onClick={() => setChartDate(new Date())}
                                className="px-2 py-1 text-[10px] font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 rounded-lg transition-colors"
                              >
                                Aktuell
                              </button>
                            )}
                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider tabular-nums">
                              {format(startOfWeek(chartDate, { weekStartsOn: 1 }), 'dd.MM.')} – {format(endOfWeek(chartDate, { weekStartsOn: 1 }), 'dd.MM.yyyy')}
                            </span>
                          </div>
                        </div>
                        {weeklyRecurringData.length === 0 ? (
                          <div className="flex items-center gap-2 h-[300px] w-full -ml-2">
                            <button
                              type="button"
                              onClick={prevWeek}
                              className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors z-10"
                              aria-label="Vorherige Woche"
                            >
                              <ChevronLeft className="w-6 h-6" />
                            </button>
                            <div className="flex-1 h-full min-w-0 flex items-center justify-center text-neutral-500 text-sm">
                              Keine Quests in dieser Woche abgeschlossen.
                            </div>
                            <button
                              type="button"
                              onClick={nextWeek}
                              disabled={weeklySummaryData.isCurrentWeek}
                              className={cn(
                                'p-2 rounded-full transition-colors z-10',
                                weeklySummaryData.isCurrentWeek
                                  ? 'text-neutral-700 cursor-not-allowed'
                                  : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
                              )}
                              aria-label="Nächste Woche"
                            >
                              <ChevronRight className="w-6 h-6" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 h-[300px] w-full -ml-2">
                            <button
                              type="button"
                              onClick={prevWeek}
                              className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors z-10 shrink-0"
                              aria-label="Vorherige Woche"
                            >
                              <ChevronLeft className="w-6 h-6" />
                            </button>
                            <div className="flex-1 h-full min-w-0 flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 pb-2">
                              {weeklyRecurringData.map((item, index) => {
                                const maxCount = Math.max(7, ...weeklyRecurringData.map(d => d.count));
                                return (
                                  <div key={index} className="flex flex-col bg-neutral-950 p-3 rounded-xl border border-neutral-800 shrink-0">
                                    <div className="flex justify-between items-start mb-2 gap-2">
                                      <span className="text-sm font-medium text-white break-words" title={item.fullTitle}>
                                        {item.fullTitle}
                                      </span>
                                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider hidden sm:inline-block">{item.skill}</span>
                                        <span className="text-sm font-mono font-bold tabular-nums" style={{ color: item.fill }}>
                                          {item.count}×
                                        </span>
                                      </div>
                                    </div>
                                    <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className="h-full rounded-full transition-all duration-500 ease-in-out" 
                                        style={{ width: `${Math.min((item.count / maxCount) * 100, 100)}%`, backgroundColor: item.fill }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={nextWeek}
                              disabled={weeklySummaryData.isCurrentWeek}
                              className={cn(
                                'p-2 rounded-full transition-colors z-10 shrink-0',
                                weeklySummaryData.isCurrentWeek
                                  ? 'text-neutral-700 cursor-not-allowed'
                                  : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
                              )}
                              aria-label="Nächste Woche"
                            >
                              <ChevronRight className="w-6 h-6" />
                            </button>
                          </div>
                        )}
                      </div>
                    </SortableWidget>
                  );
                case 'calendar':
                  return (
                    <SortableWidget key="calendar" id="calendar" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-bold flex items-center gap-2">
                            <CalendarIcon className="w-5 h-5 text-amber-500" />
                            Stimmungs-Kalender
                          </h3>
                          <div className="text-sm font-bold text-neutral-400 uppercase tracking-widest text-center">
                            {format(viewDate, 'MMMM yyyy', { locale: de })}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 -ml-2">
                          <button 
                            onClick={prevMonth}
                            className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors z-10"
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="grid grid-cols-7 gap-2">
                          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                            <div key={day} className="text-center text-[10px] font-bold text-neutral-500 uppercase tracking-tighter pb-2">
                              {day}
                            </div>
                          ))}
                          {calendarDays.map((day, i) => {
                            const entry = diaryEntries.find(e => isSameDay(new Date(e.date), day));
                            const isCurrentMonth = day.getMonth() === viewDate.getMonth();
                            const isToday = isSameDay(day, new Date());
                            const isCurrentWeek = isSameWeek(day, new Date(), { weekStartsOn: 1 });
                            const mood = entry ? MOOD_ICONS[entry.mood] : null;
                            const MoodIcon = mood?.icon;

                            return (
                              <button 
                                key={i} 
                                disabled={!entry}
                                onClick={() => entry && setSelectedEntry(entry)}
                                className={cn(
                                  "aspect-square rounded-lg border flex flex-col items-center justify-center relative transition-all",
                                  isCurrentMonth ? "bg-neutral-950/50 border-neutral-800" : "bg-transparent border-transparent opacity-20",
                                  isCurrentWeek && !isToday && "bg-neutral-800/40 border-neutral-700",
                                  isToday && "border-amber-500/50 ring-1 ring-amber-500/20 bg-amber-500/5",
                                  entry ? "hover:border-amber-500/30 cursor-pointer" : "cursor-default"
                                )}
                              >
                                <span className={cn(
                                  "text-[10px] absolute top-1 left-1 font-mono",
                                  isToday ? "text-amber-500 font-bold" : "text-neutral-600"
                                )}>
                                  {format(day, 'd')}
                                </span>
                                {MoodIcon && (
                                  <div className={cn("p-1.5 rounded-full", mood.bg)}>
                                    <MoodIcon className={cn("w-4 h-4", mood.color)} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                            </div>
                          </div>
                          <button 
                            onClick={nextMonth}
                            className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors z-10"
                          >
                            <ChevronRight className="w-6 h-6" />
                          </button>
                        </div>
                        
                        <div className="mt-6 flex flex-wrap gap-4 justify-center border-t border-neutral-800 pt-4">
                          {Object.entries(MOOD_ICONS).map(([val, info]) => {
                            const Icon = info.icon;
                            return (
                              <div key={val} className="flex items-center gap-1.5">
                                <Icon className={cn("w-3.5 h-3.5", info.color)} />
                                <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
                                  {val === '1' ? 'Schlecht' : val === '2' ? 'Geht so' : val === '3' ? 'Gut' : val === '4' ? 'Sehr gut' : 'Exzellent'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </SortableWidget>
                  );
                case 'today':
                  return (
                    <SortableWidget key="today" id="today" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                          Heute erledigt
                        </h3>
                        {Object.keys(groupedCompletedQuests).length === 0 ? (
                          <p className="text-sm text-neutral-500 italic">Noch keine Quests heute abgeschlossen.</p>
                        ) : (
                          <div className="space-y-4">
                            {(Object.entries(groupedCompletedQuests) as [SkillType, Quest[]][]).map(([skill, skillQuests]) => (
                              <div key={skill} className="space-y-2">
                                <div className={cn("text-xs font-bold uppercase tracking-wider", SKILL_COLORS[skill])}>
                                  {skill}
                                </div>
                                <div className="space-y-2">
                                  {skillQuests.map(quest => (
                                    <div key={quest.id} className="flex items-center gap-3 bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                                      <CheckCircle2 className={cn("w-4 h-4 shrink-0", SKILL_COLORS[skill])} />
                                      <div className="flex flex-col min-w-0">
                                        <span className="text-sm text-neutral-200 font-medium truncate">
                                          {quest.title}
                                        </span>
                                      </div>
                                      <span className="ml-auto text-xs font-mono text-neutral-400 tabular-nums shrink-0">
                                        {quest.type === 'habit' && quest.habitDirection === 'negative' ? `-${quest.xpReward}` : `+${quest.xpReward}`} EP
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </SortableWidget>
                  );
                case 'reminders':
                  return (upcomingReminders.length > 0 || needsDiaryEntryToday) ? (
                    <SortableWidget key="reminders" id="reminders" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                          <Bell className="w-5 h-5 text-amber-500" />
                          Anstehende Erinnerungen
                        </h3>
                        <div className="space-y-3">
                          {needsDiaryEntryToday && (
                            <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex items-center justify-between gap-3 cursor-pointer hover:border-indigo-500/40 transition-colors" onClick={() => setActiveTab('diary')}>
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                                  <BookOpen className="w-5 h-5 text-indigo-400" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-white text-sm">Tagebuch-Eintrag fehlt</div>
                                  <div className="text-xs text-neutral-400 truncate">Halte deine heutigen Gedanken fest.</div>
                                </div>
                              </div>
                              <button type="button" className="text-indigo-400 hover:text-indigo-300 font-bold text-xs uppercase tracking-wider shrink-0">
                                Erstellen
                              </button>
                            </div>
                          )}
                          {upcomingReminders.map(quest => {
                            const isDueSoon = (quest.dueDate || 0) - Date.now() < 86400000;
                            return (
                              <div key={quest.id} className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-bold text-white text-sm truncate">
                                    {quest.title}
                                  </div>
                                  <div className={cn(
                                    "text-xs flex items-center gap-1 mt-1 tabular-nums",
                                    isDueSoon ? "text-rose-400" : "text-neutral-500"
                                  )}>
                                    <Clock className="w-3 h-3" />
                                    <span>Fällig: {new Date(quest.dueDate!).toLocaleString('de-DE', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      ...(quest.hasTime ? { hour: '2-digit', minute: '2-digit' } : {}) 
                                    })}</span>
                                  </div>
                                  <div className="flex gap-2 mt-2">
                                    <button 
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const today = new Date();
                                        today.setHours(23, 59, 59, 999);
                                        updateQuest(quest.id, { dueDate: today.getTime() });
                                        toast.success('Auf Heute verschoben');
                                      }}
                                      className="px-2 py-1 bg-neutral-900 hover:bg-amber-500/10 text-[10px] font-bold text-neutral-400 hover:text-amber-400 rounded border border-neutral-800 transition-colors"
                                    >
                                      Heute
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const tomorrow = new Date();
                                        tomorrow.setDate(tomorrow.getDate() + 1);
                                        tomorrow.setHours(23, 59, 59, 999);
                                        updateQuest(quest.id, { dueDate: tomorrow.getTime() });
                                        toast.success('Auf Morgen verschoben');
                                      }}
                                      className="px-2 py-1 bg-neutral-900 hover:bg-sky-500/10 text-[10px] font-bold text-neutral-400 hover:text-sky-400 rounded border border-neutral-800 transition-colors"
                                    >
                                      Morgen
                                    </button>
                                  </div>
                                </div>
                                <div className={cn("text-xs font-mono px-2 py-1 rounded shrink-0", SKILL_COLORS[quest.skill], SKILL_BG_COLORS[quest.skill])}>
                                  {quest.skill}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </SortableWidget>
                  ) : null;
                case 'settings':
                  return (
                    <SortableWidget key="settings" id="settings" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full flex flex-col gap-6">
                        <div>
                          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Bell className="w-5 h-5 text-amber-500" />
                            Benachrichtigungen
                          </h3>
                          <div className="flex flex-col gap-4">
                            <div className="space-y-1">
                              <div className="text-sm font-medium">Desktop-Benachrichtigungen</div>
                              <div className="text-xs text-neutral-500">
                                {permission === 'granted' 
                                  ? 'Aktiviert - Du erhältst Push-Nachrichten.' 
                                  : permission === 'denied' 
                                  ? 'Blockiert - Bitte in den Browser-Einstellungen ändern.' 
                                  : 'Nicht konfiguriert - In-App-Hinweise sind aktiv.'}
                              </div>
                            </div>
                            {permission !== 'granted' ? (
                              <button 
                                type="button"
                                onClick={requestPermission}
                                className="bg-amber-500 text-neutral-950 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-400 transition-colors w-full"
                              >
                                {permission === 'denied' ? 'Aktivieren' : 'Erlauben'}
                              </button>
                            ) : (
                              <button 
                                type="button"
                                onClick={() => {
                                  toast('Test-Benachrichtigung', {
                                    description: 'So sehen deine Erinnerungen aus!',
                                    icon: <Bell className="w-4 h-4 text-amber-500" />,
                                  });
                                  if ('Notification' in window && Notification.permission === 'granted') {
                                    new Notification('Test-Benachrichtigung', {
                                      body: 'So sehen deine Erinnerungen aus!',
                                    });
                                  }
                                }}
                                className="bg-neutral-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-neutral-700 transition-colors w-full flex items-center justify-center gap-2"
                              >
                                <Bell className="w-4 h-4" />
                                Testen
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="pt-6 border-t border-neutral-800">
                          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <Lock className="w-5 h-5 text-amber-500" />
                            Sicherheit
                          </h3>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <div className="text-sm font-medium">PIN-Sperre</div>
                                <div className="text-xs text-neutral-500">
                                  Schützt deine Daten bei Inaktivität.
                                </div>
                              </div>
                              <button 
                                onClick={() => {
                                  if (settings.isPinEnabled) {
                                    updateSettings({ isPinEnabled: false, pin: null });
                                    toast.success('PIN-Sperre deaktiviert');
                                  } else {
                                    setIsPinModalOpen(true);
                                  }
                                }}
                                className={cn(
                                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                                  settings.isPinEnabled ? "bg-amber-500" : "bg-neutral-800 border border-neutral-700"
                                )}
                              >
                                <span className={cn(
                                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                  settings.isPinEnabled ? "translate-x-6" : "translate-x-1"
                                )} />
                              </button>
                            </div>
                            
                            {settings.isPinEnabled && (
                              <div className="grid grid-cols-2 gap-3">
                                <button
                                  onClick={() => setIsPinModalOpen(true)}
                                  className="py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                  <Lock className="w-3 h-3" />
                                  PIN ändern
                                </button>
                                <button
                                  onClick={() => {
                                    setLocked(true);
                                    toast.info('App gesperrt');
                                  }}
                                  className="py-2 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                  <Unlock className="w-3 h-3" />
                                  Sperren
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </SortableWidget>
                  );
                default:
                  return null;
              }
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Entry Detail Modal */}
      <AnimatePresence>
        {isPinModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsPinModalOpen(false);
                setNewPin('');
                setConfirmPin('');
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden p-6"
            >
              <div className="flex flex-col items-center text-center gap-4 mb-8">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Lock className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold">PIN {settings.isPinEnabled ? 'ändern' : 'einrichten'}</h3>
                <p className="text-neutral-400 text-sm italic leading-relaxed">
                  Gib einen 4-stelligen Code ein, um den Zugriff auf dein Tagebuch und deine Daten zu sichern.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 px-1">Neuer PIN</label>
                  <div className="relative">
                    <input
                      type={showPins ? "text" : "password"}
                      maxLength={4}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full bg-black border border-neutral-800 rounded-xl py-4 px-4 text-center text-2xl font-black tracking-[1em] text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-mono"
                      placeholder="••••"
                    />
                    <button 
                      onClick={() => setShowPins(!showPins)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                    >
                      {showPins ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 px-1">PIN bestätigen</label>
                  <input
                    type={showPins ? "text" : "password"}
                    maxLength={4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full bg-black border border-neutral-800 rounded-xl py-4 px-4 text-center text-2xl font-black tracking-[1em] text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-mono"
                    placeholder="••••"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setIsPinModalOpen(false);
                      setNewPin('');
                      setConfirmPin('');
                    }}
                    className="flex-1 py-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl font-bold transition-all"
                  >
                    Abbrechen
                  </button>
                  <button
                    disabled={newPin.length !== 4 || newPin !== confirmPin}
                    onClick={() => {
                      updateSettings({ isPinEnabled: true, pin: newPin });
                      setIsPinModalOpen(false);
                      setNewPin('');
                      setConfirmPin('');
                      toast.success('PIN erfolgreich gespeichert!');
                    }}
                    className="flex-1 py-4 bg-amber-500 disabled:opacity-50 disabled:grayscale text-neutral-950 rounded-2xl font-black transition-all shadow-lg shadow-amber-500/20"
                  >
                    Speichern
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {selectedEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEntry(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-xl", (MOOD_ICONS[selectedEntry.mood] || MOOD_ICONS[3]).bg)}>
                    {(() => {
                      const moodInfo = MOOD_ICONS[selectedEntry.mood] || MOOD_ICONS[3];
                      const Icon = moodInfo.icon;
                      return <Icon className={cn("w-6 h-6", moodInfo.color)} />;
                    })()}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">
                      Tagebucheintrag • {(MOOD_ICONS[selectedEntry.mood] || MOOD_ICONS[3]).label}
                    </h3>
                    <p className="text-xs text-neutral-500">{format(selectedEntry.date, 'dd. MMMM yyyy', { locale: de })}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedEntry(null)}
                  className="p-2 hover:bg-neutral-800 rounded-xl text-neutral-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between bg-neutral-950 px-4 py-3 rounded-2xl border border-neutral-800">
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Stimmung</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={cn(
                          "w-4 h-4",
                          star <= selectedEntry.mood
                            ? "fill-amber-400 text-amber-400"
                            : "text-neutral-700"
                        )}
                      />
                    ))}
                    <span className="ml-2 text-xs font-mono font-bold text-amber-400">
                      {selectedEntry.mood}/5
                    </span>
                  </div>
                </div>

                {selectedEntry.notes && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                      <BookOpen className="w-3 h-3 text-amber-500" />
                      Wohlbefinden
                    </div>
                    <p className="text-neutral-200 leading-relaxed whitespace-pre-wrap text-sm">{selectedEntry.notes}</p>
                  </div>
                )}
                
                {selectedEntry.progress && (
                  <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                    <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Star className="w-3 h-3 text-amber-500" />
                      Fortschritt
                    </div>
                    <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap italic text-sm">{selectedEntry.progress}</p>
                  </div>
                )}

                {!selectedEntry.notes && !selectedEntry.progress && (
                  <p className="text-xs text-neutral-500 text-center italic">
                    Nur Stimmung geloggt. Im Tagebuch kannst du Notizen ergänzen.
                  </p>
                )}
              </div>

              <div className="p-6 border-t border-neutral-800 bg-neutral-900/50 flex gap-3">
                <button
                  onClick={() => {
                    setSelectedEntry(null);
                    setActiveTab('diary');
                  }}
                  className="flex-1 py-3 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-xl font-bold transition-colors text-sm"
                >
                  Zum Tagebuch
                </button>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-colors text-sm"
                >
                  Schließen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

