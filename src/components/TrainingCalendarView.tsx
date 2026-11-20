import { useMemo, useState } from 'react';
import {
  Activity,
  BatteryCharging,
  Brain,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  Edit2,
  Flame,
  Footprints,
  HeartPulse,
  Lightbulb,
  Moon,
  Plus,
  RefreshCw,
  Route,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import {
  calculateRecoveryMetrics,
  formatMinutesAsHoursMinutes,
  getHealthSessionToken,
  fetchHealthProvidersStatus,
  syncHealthProvider,
} from '@/services/healthSyncService';
import {
  GarminWorkoutActivity,
  HealthDailyRecord,
  MentalTrainingCategory,
  MentalTrainingEntry,
} from '@/types';

const MENTAL_CATEGORIES: MentalTrainingCategory[] = [
  'Meditation',
  'Atemarbeit',
  'Visualisierung',
  'Fokus-Session',
  'Reflexion',
  'Mindset-Übung',
  'Sonstiges',
];

const QUICK_MENTAL_PRESETS: Array<{
  title: string;
  category: MentalTrainingCategory;
  durationMinutes: number;
}> = [
  { title: 'Atem-Reset (Box Breathing)', category: 'Atemarbeit', durationMinutes: 10 },
  { title: 'Achtsamkeits-Meditation', category: 'Meditation', durationMinutes: 15 },
  { title: 'Wettkampf- / Ziel-Visualisierung', category: 'Visualisierung', durationMinutes: 12 },
  { title: 'Abend-Reflexion & Fokus-Check', category: 'Reflexion', durationMinutes: 10 },
];

const DURATION_PRESETS = [5, 10, 15, 20, 30, 45];

const SPORT_TYPE_LABELS: Record<string, string> = {
  running: 'Laufen',
  treadmill_running: 'Laufband',
  trail_running: 'Trailrunning',
  cycling: 'Radfahren',
  indoor_cycling: 'Indoor Cycling',
  virtual_ride: 'Virtuelles Radfahren',
  strength_training: 'Krafttraining',
  walking: 'Gehen',
  hiking: 'Wandern',
  swimming: 'Schwimmen',
  lap_swimming: 'Bahnschwimmen',
  yoga: 'Yoga',
  pilates: 'Pilates',
  hiit: 'HIIT',
  cardio: 'Cardio',
  fitness_equipment: 'Fitnesstraining',
  elliptical: 'Crosstrainer',
  rowing: 'Rudern',
  indoor_rowing: 'Rudergerät',
  breathwork: 'Atemübung',
  meditation: 'Meditation',
  other: 'Training',
};

function formatSportType(raw: string): string {
  const key = raw.toLowerCase().trim();
  if (SPORT_TYPE_LABELS[key]) return SPORT_TYPE_LABELS[key];
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRecoveryDotClass(score: number): string {
  if (score >= 80) return 'bg-emerald-400';
  if (score >= 60) return 'bg-sky-400';
  if (score >= 35) return 'bg-amber-400';
  return 'bg-rose-400';
}

type SourceFilter = 'all' | 'garmin' | 'mental';

interface MonthlyChartRow {
  dayNum: string;
  fullDate: string;
  garminMinutes: number;
  mentalMinutes: number;
  workoutsCount: number;
  mentalCount: number;
}

function MonthlyLoadTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MonthlyChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl shadow-xl space-y-1.5 min-w-[175px]">
      <p className="font-bold text-white text-xs">{row.fullDate}</p>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-neutral-400">Garmin Aktivität</span>
        <span className="font-mono font-bold text-emerald-400 tabular-nums">
          {row.garminMinutes} Min{row.workoutsCount > 0 ? ` (${row.workoutsCount}×)` : ''}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-neutral-400">Mentaltraining</span>
        <span className="font-mono font-bold text-amber-400 tabular-nums">
          {row.mentalMinutes} Min{row.mentalCount > 0 ? ` (${row.mentalCount}×)` : ''}
        </span>
      </div>
    </div>
  );
}

const MONTHLY_LOAD_MARGIN = { top: 8, right: 6, left: -22, bottom: 0 };
const BAR_RADIUS_TOP: [number, number, number, number] = [3, 3, 0, 0];
const CHART_CURSOR = { fill: '#262626', opacity: 0.35 };

export function TrainingCalendarView({ compactHeader = false }: { compactHeader?: boolean }) {
  const {
    healthRecords = [],
    garminActivities = [],
    mentalTrainingEntries = [],
    quests = [],
    focusSessions = [],
    diaryEntries = [],
    saveHealthRecord,
    mergeGarminActivities,
    addMentalTrainingEntry,
    updateMentalTrainingEntry,
    deleteMentalTrainingEntry,
  } = useStore();

  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [isSyncingMonth, setIsSyncingMonth] = useState(false);

  // Modal state for manual Mentaltraining entries
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MentalTrainingEntry | null>(null);
  const [formDateKey, setFormDateKey] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<MentalTrainingCategory>('Meditation');
  const [formDuration, setFormDuration] = useState<number>(15);
  const [formRating, setFormRating] = useState<number | null>(4);
  const [formNotes, setFormNotes] = useState('');

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart, calendarEnd]
  );

  const monthDays = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart, monthEnd]
  );

  const healthByDateKey = useMemo(() => {
    const map = new Map<string, HealthDailyRecord>();
    for (const r of healthRecords) {
      if (r?.id) map.set(r.id, r);
    }
    return map;
  }, [healthRecords]);

  const garminActivitiesByDateKey = useMemo(() => {
    const map = new Map<string, GarminWorkoutActivity[]>();
    for (const act of garminActivities) {
      if (!act?.dateKey) continue;
      const list = map.get(act.dateKey) || [];
      list.push(act);
      map.set(act.dateKey, list);
    }
    return map;
  }, [garminActivities]);

  const mentalEntriesByDateKey = useMemo(() => {
    const map = new Map<string, MentalTrainingEntry[]>();
    for (const entry of mentalTrainingEntries) {
      const dk = entry.dateKey || format(new Date(entry.date), 'yyyy-MM-dd');
      const list = map.get(dk) || [];
      list.push(entry);
      map.set(dk, list);
    }
    return map;
  }, [mentalTrainingEntries]);

  const mentalQuestsByDateKey = useMemo(() => {
    const map = new Map<string, typeof quests>();
    for (const q of quests) {
      if (!q.tags?.includes('Mentaltraining')) continue;
      const refMs = q.completed && q.completedAt ? q.completedAt : q.dueDate || q.createdAt;
      if (!refMs) continue;
      const dk = format(new Date(refMs), 'yyyy-MM-dd');
      const list = map.get(dk) || [];
      list.push(q);
      map.set(dk, list);
    }
    return map;
  }, [quests]);

  // Monthly aggregates
  const monthStats = useMemo(() => {
    let activeDays = 0;
    let garminDays = 0;
    let mentalDays = 0;
    let garminWorkoutsTotal = 0;
    let garminMinutesTotal = 0;
    let garminCaloriesTotal = 0;
    let garminDistanceMetersTotal = 0;
    let mentalEntriesTotal = 0;
    let mentalMinutesTotal = 0;
    let recoverySum = 0;
    let recoveryCount = 0;

    for (const day of monthDays) {
      const dk = format(day, 'yyyy-MM-dd');
      const rec = healthByDateKey.get(dk);
      const acts = garminActivitiesByDateKey.get(dk) || [];
      const mentals = mentalEntriesByDateKey.get(dk) || [];

      const dayWorkouts = Math.max(rec?.workoutsCount || 0, acts.length);
      const actsMinutes = acts.reduce((s, a) => s + (a.durationMinutes || 0), 0);
      const dayGarminMin = Math.max(rec?.activityDurationMinutes || 0, actsMinutes);
      const hasGarminTraining =
        dayWorkouts > 0 || dayGarminMin > 0 || (rec?.caloriesActive || 0) > 0;
      const hasMental = mentals.length > 0;

      if (hasGarminTraining || hasMental) activeDays += 1;
      if (hasGarminTraining) garminDays += 1;
      if (hasMental) mentalDays += 1;

      garminWorkoutsTotal += dayWorkouts;
      garminMinutesTotal += dayGarminMin;
      garminCaloriesTotal +=
        rec?.caloriesActive ||
        acts.reduce((s, a) => s + (a.calories || 0), 0);
      garminDistanceMetersTotal +=
        rec?.distanceMeters ||
        acts.reduce((s, a) => s + (a.distanceMeters || 0), 0);

      mentalEntriesTotal += mentals.length;
      mentalMinutesTotal += mentals.reduce((s, m) => s + (m.durationMinutes || 0), 0);

      if (rec && typeof rec.recoveryScore === 'number' && rec.recoveryScore > 0) {
        recoverySum += rec.recoveryScore;
        recoveryCount += 1;
      }
    }

    const totalCombinedMin = garminMinutesTotal + mentalMinutesTotal;
    const garminSharePct =
      totalCombinedMin > 0 ? Math.round((garminMinutesTotal / totalCombinedMin) * 100) : 50;

    return {
      activeDays,
      garminDays,
      mentalDays,
      garminWorkoutsTotal,
      garminMinutesTotal,
      garminCaloriesTotal,
      garminDistanceKm: Number((garminDistanceMetersTotal / 1000).toFixed(1)),
      mentalEntriesTotal,
      mentalMinutesTotal,
      avgRecovery: recoveryCount > 0 ? Math.round(recoverySum / recoveryCount) : null,
      garminSharePct,
      totalCombinedMin,
    };
  }, [monthDays, healthByDateKey, garminActivitiesByDateKey, mentalEntriesByDateKey]);

  const monthlyChartData = useMemo<MonthlyChartRow[]>(() => {
    return monthDays.map((day) => {
      const dk = format(day, 'yyyy-MM-dd');
      const rec = healthByDateKey.get(dk);
      const acts = garminActivitiesByDateKey.get(dk) || [];
      const mentals = mentalEntriesByDateKey.get(dk) || [];
      const actsMin = acts.reduce((s, a) => s + (a.durationMinutes || 0), 0);
      const garminMinutes =
        sourceFilter === 'mental'
          ? 0
          : Math.max(rec?.activityDurationMinutes || 0, actsMin);
      const mentalMinutes =
        sourceFilter === 'garmin'
          ? 0
          : mentals.reduce((s, m) => s + (m.durationMinutes || 0), 0);

      return {
        dayNum: format(day, 'd'),
        fullDate: format(day, 'EEEE, dd.MM.yyyy', { locale: de }),
        garminMinutes,
        mentalMinutes,
        workoutsCount: Math.max(rec?.workoutsCount || 0, acts.length),
        mentalCount: mentals.length,
      };
    });
  }, [monthDays, healthByDateKey, garminActivitiesByDateKey, mentalEntriesByDateKey, sourceFilter]);

  const selectedDateKey = format(selectedDay, 'yyyy-MM-dd');
  const selectedHealthRecord = healthByDateKey.get(selectedDateKey) || null;
  const selectedGarminActivities = garminActivitiesByDateKey.get(selectedDateKey) || [];
  const selectedMentalEntries = mentalEntriesByDateKey.get(selectedDateKey) || [];
  const selectedMentalQuests = mentalQuestsByDateKey.get(selectedDateKey) || [];
  const selectedFocusSessions = useMemo(
    () =>
      focusSessions.filter((f) => {
        const d = new Date(f.completedAt);
        return !Number.isNaN(d.getTime()) && isSameDay(d, selectedDay);
      }),
    [focusSessions, selectedDay]
  );

  const openCreateModal = (day: Date = selectedDay) => {
    setEditingEntry(null);
    setFormDateKey(format(day, 'yyyy-MM-dd'));
    setFormTitle('');
    setFormCategory('Meditation');
    setFormDuration(15);
    setFormRating(4);
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (entry: MentalTrainingEntry) => {
    setEditingEntry(entry);
    setFormDateKey(entry.dateKey || format(new Date(entry.date), 'yyyy-MM-dd'));
    setFormTitle(entry.title);
    setFormCategory(entry.category);
    setFormDuration(entry.durationMinutes);
    setFormRating(entry.focusRating ?? null);
    setFormNotes(entry.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveMentalEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = formTitle.trim() || formCategory;
    const [y, m, d] = formDateKey.split('-').map(Number);
    const parsedDate = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
    const dateMs = Number.isNaN(parsedDate.getTime()) ? Date.now() : parsedDate.getTime();

    if (editingEntry) {
      updateMentalTrainingEntry(editingEntry.id, {
        date: dateMs,
        dateKey: formDateKey,
        title: trimmedTitle,
        category: formCategory,
        durationMinutes: formDuration,
        focusRating: formRating,
        notes: formNotes,
      });
      toast.success('Mentaltraining-Eintrag aktualisiert');
    } else {
      addMentalTrainingEntry({
        date: dateMs,
        dateKey: formDateKey,
        title: trimmedTitle,
        category: formCategory,
        durationMinutes: formDuration,
        focusRating: formRating,
        notes: formNotes,
      });
      toast.success('Mentaltraining-Eintrag gespeichert');
    }
    if (!Number.isNaN(parsedDate.getTime())) {
      setSelectedDay(parsedDate);
      setCurrentMonth(parsedDate);
    }
    setIsModalOpen(false);
  };

  const handleSyncVisibleMonth = async () => {
    setIsSyncingMonth(true);
    try {
      const status = await fetchHealthProvidersStatus();
      const isConnected = status.garmin.connected || Boolean(getHealthSessionToken('garmin'));
      if (!isConnected) {
        toast.info('Garmin Connect ist nicht verbunden. Bitte in den Einstellungen verbinden.');
        return;
      }

      const todayKey = format(new Date(), 'yyyy-MM-dd');
      const startKey = format(monthStart, 'yyyy-MM-dd');
      const rawEndKey = format(monthEnd, 'yyyy-MM-dd');
      const endKey = rawEndKey > todayKey ? todayKey : rawEndKey;

      if (startKey > todayKey) {
        toast.info('Für zukünftige Monate liegen noch keine Garmin-Daten vor.');
        return;
      }

      const res = await syncHealthProvider('garmin', {
        startDate: startKey,
        endDate: endKey,
      });

      if (res.activities?.length) {
        mergeGarminActivities(res.activities);
      }

      const pickVal = (nextVal: number | null | undefined, prevVal: number | null | undefined) => {
        if (typeof nextVal === 'number' && Number.isFinite(nextVal)) return nextVal;
        if (typeof prevVal === 'number' && Number.isFinite(prevVal)) return prevVal;
        return null;
      };

      const existingRecords = useStore.getState().healthRecords;
      let savedCount = 0;

      for (const day of res.days) {
        if (!day?.dateKey) continue;
        const [y, m, d] = day.dateKey.split('-').map(Number);
        const dayDate = new Date(y, m - 1, d, 12, 0, 0);
        if (Number.isNaN(dayDate.getTime())) continue;
        const existing = existingRecords.find((r) => r.id === day.dateKey);
        const dayMood =
          diaryEntries.find((entry) => isSameDay(new Date(entry.date), dayDate))?.mood ?? null;

        const sleepMin =
          day.sleepDurationMinutes > 0
            ? day.sleepDurationMinutes
            : existing?.sleepDurationMinutes || 0;
        const activityMin =
          day.activityDurationMinutes > 0
            ? day.activityDurationMinutes
            : existing?.activityDurationMinutes || 0;
        const avgHr = pickVal(day.avgHeartRate, existing?.avgHeartRate);
        const restingHeartRate = pickVal(day.restingHeartRate, existing?.restingHeartRate);
        const hrvMs = pickVal(day.hrvMs, existing?.hrvMs);
        const stressLevel = pickVal(day.stressLevel, existing?.stressLevel);
        const bodyBattery = pickVal(day.bodyBattery, existing?.bodyBattery);

        const { recoveryScore, recoveryState } = calculateRecoveryMetrics({
          sleepDurationMinutes: sleepMin,
          activityDurationMinutes: activityMin,
          avgHeartRate: avgHr,
          restingHeartRate,
          hrvMs,
          stressLevel,
          bodyBattery,
          todayMood: dayMood,
        });

        await saveHealthRecord({
          id: day.dateKey,
          date: startOfDay(dayDate).getTime(),
          sleepDurationMinutes: sleepMin,
          activityDurationMinutes: activityMin,
          avgHeartRate: avgHr,
          sleepDeepMinutes: pickVal(day.sleepDeepMinutes, existing?.sleepDeepMinutes),
          sleepLightMinutes: pickVal(day.sleepLightMinutes, existing?.sleepLightMinutes),
          sleepRemMinutes: pickVal(day.sleepRemMinutes, existing?.sleepRemMinutes),
          sleepAwakeMinutes: pickVal(day.sleepAwakeMinutes, existing?.sleepAwakeMinutes),
          steps: pickVal(day.steps, existing?.steps),
          distanceMeters: pickVal(day.distanceMeters, existing?.distanceMeters),
          caloriesActive: pickVal(day.caloriesActive, existing?.caloriesActive),
          floorsClimbed: pickVal(day.floorsClimbed, existing?.floorsClimbed),
          heartPoints: pickVal(day.heartPoints, existing?.heartPoints),
          workoutsCount: pickVal(day.workoutsCount, existing?.workoutsCount),
          restingHeartRate,
          hrvMs,
          stressLevel,
          bodyBattery,
          spo2Percent: pickVal(day.spo2Percent, existing?.spo2Percent),
          respirationRate: pickVal(day.respirationRate, existing?.respirationRate),
          vo2Max: pickVal(day.vo2Max, existing?.vo2Max),
          weightKg: pickVal(day.weightKg, existing?.weightKg),
          bodyFatPercent: pickVal(day.bodyFatPercent, existing?.bodyFatPercent),
          hydrationMl: pickVal(day.hydrationMl, existing?.hydrationMl),
          sources: ['garmin_connect'],
          recoveryScore,
          recoveryState,
          acceptedSuggestionIds: existing?.acceptedSuggestionIds || [],
          dismissedSuggestionIds: existing?.dismissedSuggestionIds || [],
          syncedAt: Date.now(),
        });
        savedCount += 1;
      }

      const actCount = res.activities?.length || 0;
      toast.success(
        `Garmin-Monatsdaten aktualisiert (${savedCount} Tage${
          actCount > 0 ? `, ${actCount} Workouts geladen` : ''
        })`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Garmin-Sync fehlgeschlagen.');
    } finally {
      setIsSyncingMonth(false);
    }
  };

  const jumpToToday = () => {
    const now = new Date();
    setCurrentMonth(now);
    setSelectedDay(now);
  };

  const isViewingCurrentMonth = isSameMonth(currentMonth, new Date());

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        {!compactHeader ? (
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
              <CalendarIcon className="w-7 h-7 text-amber-500 shrink-0" />
              <span>Trainings-Kalender</span>
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Erfasste Garmin-Trainingsdaten und manuelle Mentaltraining-Einträge in einer monatlichen Übersicht
            </p>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-bold text-white">Trainings-Kalender (Monatsübersicht)</h3>
            <p className="text-xs text-neutral-400">
              Kombiniert deine Garmin-Trainingsdaten mit manuellen Mentaltraining-Einträgen
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Source Filter */}
          <div className="inline-flex items-center p-1 rounded-xl bg-neutral-900 border border-neutral-800">
            {(
              [
                { id: 'all', label: 'Alle' },
                { id: 'garmin', label: 'Garmin' },
                { id: 'mental', label: 'Mental' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceFilter(tab.id)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap',
                  sourceFilter === tab.id
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {(!isViewingCurrentMonth || !isToday(selectedDay)) && (
            <button
              type="button"
              onClick={jumpToToday}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors min-h-[38px]"
            >
              Heute
            </button>
          )}

          {/* Month Switcher */}
          <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 font-bold min-w-[130px] text-center text-xs sm:text-sm capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: de })}
            </span>
            <button
              type="button"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
              aria-label="Nächster Monat"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleSyncVisibleMonth}
            disabled={isSyncingMonth}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-200 hover:text-white text-xs font-semibold transition-colors whitespace-nowrap min-h-[38px] disabled:opacity-60"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-emerald-400', isSyncingMonth && 'animate-spin')} />
            <span>Garmin Sync</span>
          </button>

          <button
            type="button"
            onClick={() => openCreateModal(selectedDay)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors whitespace-nowrap min-h-[38px]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Mentaltraining</span>
          </button>
        </div>
      </div>

      {/* Monthly KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Aktive Tage</span>
          </div>
          <div className="text-xl font-bold text-white tabular-nums mt-1">
            {monthStats.activeDays} / {monthDays.length}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
            {monthStats.garminDays} Garmin · {monthStats.mentalDays} Mental
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Dumbbell className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Garmin Training</span>
          </div>
          <div className="text-xl font-bold text-white tabular-nums mt-1">
            {formatMinutesAsHoursMinutes(monthStats.garminMinutesTotal)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
            {monthStats.garminWorkoutsTotal} Workouts ·{' '}
            {monthStats.garminCaloriesTotal.toLocaleString('de-DE')} kcal
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Brain className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Mentaltraining</span>
          </div>
          <div className="text-xl font-bold text-white tabular-nums mt-1">
            {formatMinutesAsHoursMinutes(monthStats.mentalMinutesTotal)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
            {monthStats.mentalEntriesTotal}{' '}
            {monthStats.mentalEntriesTotal === 1 ? 'Eintrag' : 'Einträge'}
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
            <span className="flex items-center gap-1.5">
              <BatteryCharging className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Balance &amp; Ø Recovery</span>
            </span>
            {monthStats.avgRecovery !== null && (
              <span className="font-mono font-bold text-white tabular-nums">
                {monthStats.avgRecovery}/100
              </span>
            )}
          </div>
          <div className="mt-2 h-2 w-full rounded-full overflow-hidden bg-neutral-950 flex">
            {monthStats.totalCombinedMin > 0 ? (
              <>
                <div
                  className="bg-emerald-400 h-full"
                  style={{ width: `${monthStats.garminSharePct}%` }}
                />
                <div
                  className="bg-amber-400 h-full"
                  style={{ width: `${100 - monthStats.garminSharePct}%` }}
                />
              </>
            ) : (
              <div className="bg-neutral-800 h-full w-full" />
            )}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1.5 tabular-nums flex justify-between">
            <span>{monthStats.garminDistanceKm.toFixed(1).replace('.', ',')} km</span>
            <span>
              {monthStats.totalCombinedMin > 0
                ? `${monthStats.garminSharePct}% Physisch · ${100 - monthStats.garminSharePct}% Mental`
                : 'Noch keine Zeiten'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Split: Calendar + Monthly Chart (Left) | Day Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid + Monthly Chart */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-neutral-800">
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
                <div
                  key={day}
                  className="py-2.5 text-center text-[11px] font-bold text-neutral-500 uppercase tracking-wider"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarDays.map((day, idx) => {
                const dk = format(day, 'yyyy-MM-dd');
                const rec = healthByDateKey.get(dk);
                const acts = garminActivitiesByDateKey.get(dk) || [];
                const mentals = mentalEntriesByDateKey.get(dk) || [];

                const dayWorkouts = Math.max(rec?.workoutsCount || 0, acts.length);
                const actsMinutes = acts.reduce((s, a) => s + (a.durationMinutes || 0), 0);
                const dayGarminMin = Math.max(rec?.activityDurationMinutes || 0, actsMinutes);
                const dayMentalMin = mentals.reduce((s, m) => s + (m.durationMinutes || 0), 0);

                const showGarmin = sourceFilter !== 'mental' && (dayWorkouts > 0 || dayGarminMin > 0);
                const showMental = sourceFilter !== 'garmin' && mentals.length > 0;

                const totalCellMin =
                  (sourceFilter !== 'mental' ? dayGarminMin : 0) +
                  (sourceFilter !== 'garmin' ? dayMentalMin : 0);
                const garminBarWidth =
                  totalCellMin > 0 && sourceFilter !== 'mental'
                    ? Math.round((dayGarminMin / Math.max(totalCellMin, 60)) * 100)
                    : 0;
                const mentalBarWidth =
                  totalCellMin > 0 && sourceFilter !== 'garmin'
                    ? Math.round((dayMentalMin / Math.max(totalCellMin, 60)) * 100)
                    : 0;

                const inCurrentMonth = isSameMonth(day, monthStart);
                const isSel = isSameDay(day, selectedDay);
                const isTodayDay = isToday(day);

                return (
                  <button
                    type="button"
                    key={dk}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      'min-h-[70px] sm:min-h-[94px] p-1.5 sm:p-2 border-r border-b border-neutral-800 transition-colors relative text-left flex flex-col justify-between gap-1',
                      !inCurrentMonth && 'opacity-30',
                      isSel
                        ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/60'
                        : 'hover:bg-neutral-800/40',
                      idx % 7 === 6 && 'border-r-0'
                    )}
                  >
                    {/* Day Number & Recovery Indicator */}
                    <div className="flex items-center justify-between w-full gap-1">
                      <span
                        className={cn(
                          'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full tabular-nums',
                          isTodayDay
                            ? 'bg-amber-500 text-neutral-950 font-bold'
                            : isSel
                            ? 'text-amber-400 font-bold'
                            : 'text-neutral-300'
                        )}
                      >
                        {format(day, 'd')}
                      </span>

                      {rec && typeof rec.recoveryScore === 'number' && rec.recoveryScore > 0 && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] text-neutral-400 tabular-nums"
                          title={`Recovery-Score: ${rec.recoveryScore}/100`}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              getRecoveryDotClass(rec.recoveryScore)
                            )}
                          />
                          <span className="hidden sm:inline font-mono">{rec.recoveryScore}</span>
                        </span>
                      )}
                    </div>

                    {/* Markers for Garmin & Mentaltraining */}
                    <div className="space-y-0.5 w-full min-w-0">
                      {showGarmin && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-medium tabular-nums truncate">
                          <span className="w-1.5 h-1.5 rounded-sm bg-emerald-400 shrink-0" />
                          <span className="truncate">
                            {dayWorkouts > 0 ? `${dayWorkouts}× ` : ''}
                            {dayGarminMin > 0 ? `${dayGarminMin}m` : 'Aktiv'}
                          </span>
                        </div>
                      )}
                      {showMental && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-300 font-medium tabular-nums truncate">
                          <span className="w-1.5 h-1.5 rounded-sm bg-amber-400 shrink-0" />
                          <span className="truncate">
                            {mentals.length > 1 ? `${mentals.length}× ` : ''}
                            {dayMentalMin}m
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Dual Training Load Bar */}
                    <div className="w-full h-1 rounded-full bg-neutral-950/90 overflow-hidden flex">
                      {garminBarWidth > 0 && (
                        <div
                          className="bg-emerald-400 h-full"
                          style={{ width: `${Math.min(100, garminBarWidth)}%` }}
                        />
                      )}
                      {mentalBarWidth > 0 && (
                        <div
                          className="bg-amber-400 h-full"
                          style={{
                            width: `${Math.min(100 - Math.min(100, garminBarWidth), mentalBarWidth)}%`,
                          }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Compact Legend Footer */}
            <div className="px-4 py-2.5 border-t border-neutral-800 bg-neutral-950/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />
                  Garmin Training / Aktivität
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />
                  Manuelles Mentaltraining
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                  Recovery-Score
                </span>
              </div>
              <span className="text-neutral-500">Tag anklicken für Details</span>
            </div>
          </div>

          {/* Monthly Minutes Comparison BarChart */}
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Monatliche Trainingsminuten: Garmin vs. Mentaltraining</span>
              </span>
              <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                {sourceFilter !== 'mental' && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                    Garmin (Min)
                  </span>
                )}
                {sourceFilter !== 'garmin' && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />
                    Mentaltraining (Min)
                  </span>
                )}
              </div>
            </div>
            <div className="h-44 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={160}
                initialDimension={{ width: 320, height: 170 }}
                debounce={50}
              >
                <BarChart data={monthlyChartData} margin={MONTHLY_LOAD_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="dayNum"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}m`}
                  />
                  <Tooltip cursor={CHART_CURSOR} content={<MonthlyLoadTooltip />} />
                  {sourceFilter !== 'mental' && (
                    <Bar
                      dataKey="garminMinutes"
                      stackId="training"
                      name="Garmin (Min)"
                      fill="#10b981"
                      radius={sourceFilter === 'garmin' ? BAR_RADIUS_TOP : undefined}
                      maxBarSize={18}
                      isAnimationActive={false}
                    />
                  )}
                  {sourceFilter !== 'garmin' && (
                    <Bar
                      dataKey="mentalMinutes"
                      stackId="training"
                      name="Mentaltraining (Min)"
                      fill="#f59e0b"
                      radius={BAR_RADIUS_TOP}
                      maxBarSize={18}
                      isAnimationActive={false}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Sticky Column: Selected Day Training Details */}
        <div className="space-y-4">
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 sm:p-5 lg:sticky lg:top-6 space-y-5">
            {/* Day Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-white capitalize truncate">
                  {format(selectedDay, 'EEEE, d. MMMM', { locale: de })}
                </h3>
                <p className="text-xs text-neutral-400 tabular-nums mt-0.5">
                  {selectedGarminActivities.length > 0
                    ? `${selectedGarminActivities.length} Garmin-Workout${
                        selectedGarminActivities.length === 1 ? '' : 's'
                      }`
                    : selectedHealthRecord?.workoutsCount
                    ? `${selectedHealthRecord.workoutsCount} Garmin-Workout${
                        selectedHealthRecord.workoutsCount === 1 ? '' : 's'
                      }`
                    : 'Keine Garmin-Workouts'}
                  {' · '}
                  {selectedMentalEntries.length}{' '}
                  {selectedMentalEntries.length === 1 ? 'Mental-Eintrag' : 'Mental-Einträge'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openCreateModal(selectedDay)}
                className="p-2 bg-amber-500 text-neutral-950 rounded-xl hover:bg-amber-400 transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center shrink-0"
                title="Mentaltraining für diesen Tag eintragen"
                aria-label="Mentaltraining eintragen"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Vital Strip if healthRecord exists */}
            {selectedHealthRecord && (
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs tabular-nums">
                <div>
                  <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <BatteryCharging className="w-3 h-3 text-amber-400" />
                    Recovery
                  </div>
                  <div className="font-bold text-white mt-0.5">
                    {selectedHealthRecord.recoveryScore}/100
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Moon className="w-3 h-3 text-indigo-400" />
                    Schlaf
                  </div>
                  <div className="font-bold text-white mt-0.5">
                    {selectedHealthRecord.sleepDurationMinutes > 0
                      ? formatMinutesAsHoursMinutes(selectedHealthRecord.sleepDurationMinutes)
                      : '–'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <HeartPulse className="w-3 h-3 text-pink-400" />
                    Ruhepuls
                  </div>
                  <div className="font-bold text-white mt-0.5">
                    {selectedHealthRecord.restingHeartRate
                      ? `${selectedHealthRecord.restingHeartRate} BPM`
                      : '–'}
                  </div>
                </div>
              </div>
            )}

            {/* Section 1: Garmin Training Data */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-200 flex items-center gap-1.5">
                  <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Garmin-Trainingsdaten</span>
                </span>
              </div>

              {selectedGarminActivities.length > 0 && (
                <div className="space-y-2">
                  {selectedGarminActivities.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-xl bg-neutral-950 border border-emerald-500/20 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-white truncate">
                            {act.name}
                          </div>
                          <div className="text-[11px] text-emerald-400 font-medium">
                            {formatSportType(act.sportType)}
                            {act.startTimeLocal && act.startTimeLocal.length >= 16
                              ? ` · ${act.startTimeLocal.slice(11, 16)} Uhr`
                              : ''}
                          </div>
                        </div>
                        <span className="font-mono text-xs font-bold text-emerald-300 tabular-nums shrink-0">
                          {act.durationMinutes} Min
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400 tabular-nums">
                        {act.distanceMeters !== null && act.distanceMeters > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Route className="w-3 h-3 text-teal-400" />
                            {(act.distanceMeters / 1000).toFixed(2).replace('.', ',')} km
                          </span>
                        )}
                        {act.calories !== null && act.calories > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Flame className="w-3 h-3 text-orange-400" />
                            {act.calories} kcal
                          </span>
                        )}
                        {act.avgHeartRate !== null && act.avgHeartRate > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <HeartPulse className="w-3 h-3 text-rose-400" />
                            Ø {act.avgHeartRate}
                            {act.maxHeartRate ? ` / Max ${act.maxHeartRate}` : ''} BPM
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedHealthRecord ? (
                <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                  <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800">
                    <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      Aktivitätsdauer
                    </div>
                    <div className="font-bold text-white mt-0.5">
                      {selectedHealthRecord.activityDurationMinutes} Min
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800">
                    <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                      <Flame className="w-3 h-3 text-orange-400" />
                      Aktivkalorien
                    </div>
                    <div className="font-bold text-white mt-0.5">
                      {selectedHealthRecord.caloriesActive
                        ? `${selectedHealthRecord.caloriesActive.toLocaleString('de-DE')} kcal`
                        : '–'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800">
                    <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                      <Footprints className="w-3 h-3 text-emerald-400" />
                      Schritte
                    </div>
                    <div className="font-bold text-white mt-0.5">
                      {selectedHealthRecord.steps
                        ? selectedHealthRecord.steps.toLocaleString('de-DE')
                        : '–'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800">
                    <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                      <Route className="w-3 h-3 text-teal-400" />
                      Distanz
                    </div>
                    <div className="font-bold text-white mt-0.5">
                      {selectedHealthRecord.distanceMeters
                        ? `${(selectedHealthRecord.distanceMeters / 1000)
                            .toFixed(2)
                            .replace('.', ',')} km`
                        : '–'}
                    </div>
                  </div>
                </div>
              ) : selectedGarminActivities.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-dashed border-neutral-800 text-xs text-neutral-500 text-center space-y-2">
                  <p>Für diesen Tag sind noch keine Garmin-Trainingsdaten gespeichert.</p>
                  <button
                    type="button"
                    onClick={handleSyncVisibleMonth}
                    disabled={isSyncingMonth}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    Jetzt mit Garmin synchronisieren
                  </button>
                </div>
              ) : null}
            </div>

            {/* Section 2: Manual Mentaltraining Entries */}
            <div className="space-y-2.5 pt-2 border-t border-neutral-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-200 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-amber-400" />
                  <span>Manuelles Mentaltraining</span>
                </span>
                <button
                  type="button"
                  onClick={() => openCreateModal(selectedDay)}
                  className="text-[11px] font-semibold text-amber-400 hover:text-amber-300"
                >
                  + Neu
                </button>
              </div>

              {selectedMentalEntries.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-dashed border-neutral-800 text-xs text-neutral-500 text-center space-y-2">
                  <p>Noch kein manueller Mentaltraining-Eintrag für diesen Tag.</p>
                  <button
                    type="button"
                    onClick={() => openCreateModal(selectedDay)}
                    className="text-amber-400 hover:text-amber-300 font-semibold"
                  >
                    + Eintrag erfassen
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedMentalEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl bg-neutral-950 border border-amber-500/20 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-white truncate">
                            {entry.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-400 mt-0.5 tabular-nums">
                            <span className="text-amber-400 font-medium">{entry.category}</span>
                            <span>·</span>
                            <span>{entry.durationMinutes} Min</span>
                            {typeof entry.focusRating === 'number' && entry.focusRating > 0 && (
                              <>
                                <span>·</span>
                                <span className="inline-flex items-center gap-0.5 text-amber-300">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  {entry.focusRating}/5
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditModal(entry)}
                            aria-label="Eintrag bearbeiten"
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              deleteMentalTrainingEntry(entry.id);
                              toast.success('Eintrag gelöscht');
                            }}
                            aria-label="Eintrag löschen"
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {entry.notes && (
                        <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Supplemental: Completed Mentaltraining Quests & Focus Sessions */}
              {(selectedMentalQuests.length > 0 || selectedFocusSessions.length > 0) && (
                <div className="pt-2 space-y-1.5">
                  <div className="text-[11px] font-semibold text-neutral-500">
                    Weitere Fokus- &amp; Mental-Aktivitäten
                  </div>
                  {selectedMentalQuests.map((q) => (
                    <div
                      key={q.id}
                      className="px-2.5 py-2 rounded-lg bg-neutral-950/70 border border-neutral-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex items-center gap-1.5 min-w-0 text-neutral-300 truncate">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">{q.title}</span>
                      </span>
                      {q.completed && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </div>
                  ))}
                  {selectedFocusSessions.map((f) => (
                    <div
                      key={f.id}
                      className="px-2.5 py-2 rounded-lg bg-neutral-950/70 border border-neutral-800 flex items-center justify-between gap-2 text-xs tabular-nums"
                    >
                      <span className="text-neutral-300 truncate">Fokus ({f.skill})</span>
                      <span className="font-mono text-sky-400 shrink-0">
                        {f.durationMinutes} Min
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create / Edit Manual Mentaltraining Entry Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mental-entry-modal-title"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h3 id="mental-entry-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-amber-400" />
                <span>
                  {editingEntry ? 'Mentaltraining bearbeiten' : 'Mentaltraining eintragen'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Modal schließen"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!editingEntry && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-neutral-400">Schnellauswahl</span>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_MENTAL_PRESETS.map((preset) => (
                    <button
                      key={preset.title}
                      type="button"
                      onClick={() => {
                        setFormTitle(preset.title);
                        setFormCategory(preset.category);
                        setFormDuration(preset.durationMinutes);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800 hover:border-amber-500/40 text-[11px] text-neutral-300 hover:text-amber-300 transition-colors"
                    >
                      {preset.title} ({preset.durationMinutes}m)
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveMentalEntry} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">
                    Datum
                  </label>
                  <input
                    type="date"
                    value={formDateKey}
                    onChange={(e) => setFormDateKey(e.target.value)}
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">
                    Kategorie
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as MentalTrainingCategory)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {MENTAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">
                  Übung / Titel
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="z. B. Box Breathing, Fokus-Meditation, Visualisierung..."
                  maxLength={160}
                  required
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">
                    Dauer (Minuten)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={formDuration}
                    onChange={(e) => setFormDuration(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {DURATION_PRESETS.map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setFormDuration(min)}
                        className={cn(
                          'px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums border transition-colors',
                          formDuration === min
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                        )}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-400 mb-1">
                    Fokus / Klarheit (optional)
                  </label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {[1, 2, 3, 4, 5].map((rating) => {
                      const active = formRating !== null && formRating >= rating;
                      return (
                        <button
                          key={rating}
                          type="button"
                          onClick={() => setFormRating(formRating === rating ? null : rating)}
                          aria-label={`${rating} von 5 Sternen`}
                          className={cn(
                            'p-2 rounded-xl border transition-colors',
                            active
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                              : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                          )}
                        >
                          <Star className={cn('w-4 h-4', active && 'fill-amber-400')} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">
                  Notizen &amp; Erkenntnisse (optional)
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Wie war die Session? Welche Gedanken oder Effekte hast du beobachtet?"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors"
                >
                  {editingEntry ? 'Änderungen speichern' : 'Eintrag speichern'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
