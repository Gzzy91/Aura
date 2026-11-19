import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Activity,
  BatteryCharging,
  Calendar,
  Check,
  Droplets,
  Dumbbell,
  Eye,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Moon,
  Plus,
  RefreshCw,
  Route,
  Scale,
  SlidersHorizontal,
  TrendingUp,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { format, isSameDay, isToday, isYesterday, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { cn, SKILL_COLORS } from '@/lib/utils';
import {
  DEFAULT_VISIBLE_HEALTH_METRICS,
  HEALTH_METRICS_CATALOG,
  HealthProvidersStatus,
  RemoteHealthDayMetric,
  buildTodayHealthRecord,
  calculateRecoveryMetrics,
  fetchHealthProvidersStatus,
  formatHealthMetricValue,
  formatMinutesAsHoursMinutes,
  generateEnergyRecoveryQuests,
  getHealthSessionToken,
  getVisibleHealthMetricsSet,
  hasHealthMetricValue,
  loadBrowserTelemetry,
  syncHealthProvider,
} from '@/services/healthSyncService';
import {
  EnergyRecoverySuggestion,
  HealthDailyRecord,
  HealthDataSource,
  HealthMetricKey,
  RecoveryState,
} from '@/types';
import { HealthMetricsPicker } from '@/components/HealthMetricsPicker';

const SOURCE_LABELS: Record<HealthDataSource, string> = {
  browser_idle: 'Browser-Ruhezeit',
  device_motion: 'Bewegungssensor',
  web_bluetooth: 'Bluetooth-Sensor',
  health_export: 'Health-Export',
  aura_activity: 'Aura Aktivität',
  garmin_connect: 'Garmin Connect',
  google_health: 'Google Health',
  manual: 'Manuell',
};

const RECOVERY_STATE_META: Record<
  RecoveryState,
  { label: string; textClass: string; barClass: string }
> = {
  depleted: {
    label: 'Hoher Erholungsbedarf',
    textClass: 'text-rose-400',
    barClass: 'bg-rose-500',
  },
  strained: {
    label: 'Erholung empfohlen',
    textClass: 'text-amber-400',
    barClass: 'bg-amber-500',
  },
  balanced: {
    label: 'Ausgeglichen',
    textClass: 'text-sky-400',
    barClass: 'bg-sky-500',
  },
  charged: {
    label: 'Voll aufgeladen',
    textClass: 'text-emerald-400',
    barClass: 'bg-emerald-500',
  },
};

const METRIC_ICON_META: Record<
  HealthMetricKey,
  { icon: typeof Activity; colorClass: string }
> = {
  recoveryScore: { icon: BatteryCharging, colorClass: 'text-amber-400' },
  sleepDurationMinutes: { icon: Moon, colorClass: 'text-indigo-400' },
  sleepDeepMinutes: { icon: Moon, colorClass: 'text-indigo-400' },
  sleepLightMinutes: { icon: Moon, colorClass: 'text-sky-400' },
  sleepRemMinutes: { icon: Moon, colorClass: 'text-purple-400' },
  sleepAwakeMinutes: { icon: Moon, colorClass: 'text-amber-400' },
  activityDurationMinutes: { icon: Activity, colorClass: 'text-emerald-400' },
  steps: { icon: Footprints, colorClass: 'text-emerald-400' },
  distanceMeters: { icon: Route, colorClass: 'text-teal-400' },
  caloriesActive: { icon: Flame, colorClass: 'text-orange-400' },
  floorsClimbed: { icon: TrendingUp, colorClass: 'text-cyan-400' },
  heartPoints: { icon: HeartPulse, colorClass: 'text-rose-400' },
  workoutsCount: { icon: Dumbbell, colorClass: 'text-lime-400' },
  avgHeartRate: { icon: HeartPulse, colorClass: 'text-rose-400' },
  restingHeartRate: { icon: HeartPulse, colorClass: 'text-pink-400' },
  hrvMs: { icon: Activity, colorClass: 'text-violet-400' },
  stressLevel: { icon: Zap, colorClass: 'text-amber-400' },
  bodyBattery: { icon: BatteryCharging, colorClass: 'text-sky-400' },
  spo2Percent: { icon: Wind, colorClass: 'text-cyan-400' },
  respirationRate: { icon: Wind, colorClass: 'text-sky-300' },
  vo2Max: { icon: Gauge, colorClass: 'text-emerald-300' },
  weightKg: { icon: Scale, colorClass: 'text-neutral-300' },
  bodyFatPercent: { icon: Scale, colorClass: 'text-amber-300' },
  hydrationMl: { icon: Droplets, colorClass: 'text-sky-400' },
};

const HISTORY_CHART_MARGIN = { top: 8, right: 4, left: -20, bottom: 0 };
const SLEEP_DOMAIN: [number, number] = [0, 12];
const SCORE_DOMAIN: [number, number] = [0, 100];
const HISTORY_BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
const HISTORY_CURSOR = { fill: '#262626', opacity: 0.35 };
const SCORE_LINE_DOT = { r: 3.5, fill: '#f59e0b', stroke: '#171717', strokeWidth: 2 };
const SCORE_LINE_ACTIVE_DOT = { r: 5, fill: '#fbbf24' };

function CustomHealthHistoryTooltip({
  active,
  payload,
  visibleKeys,
}: {
  active?: boolean;
  payload?: Array<{ payload: { fullDate: string; record: HealthDailyRecord } }>;
  visibleKeys: HealthMetricKey[];
}) {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    const rec = d.record;
    const visibleSet = new Set(visibleKeys);
    const items = HEALTH_METRICS_CATALOG.filter(
      (m) => visibleSet.has(m.key) && hasHealthMetricValue(m.key, rec)
    ).slice(0, 8);

    return (
      <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl shadow-xl space-y-1.5 min-w-[175px]">
        <p className="font-bold text-white text-xs">{d.fullDate}</p>
        {items.map((m) => {
          const val = formatHealthMetricValue(m.key, rec);
          if (!val) return null;
          const iconMeta = METRIC_ICON_META[m.key];
          return (
            <div key={m.key} className="flex items-center justify-between gap-4 text-xs">
              <span className="text-neutral-400">{m.shortLabel}</span>
              <span className={cn('font-mono font-bold tabular-nums', iconMeta.colorClass)}>
                {val}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}

function safeDate(val: unknown): Date | null {
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatHistoryDateLabel(ts: number): string {
  const dateObj = safeDate(ts);
  if (!dateObj) return 'Unbekannt';
  if (isToday(dateObj)) return 'Heute';
  if (isYesterday(dateObj)) return 'Gestern';
  return format(dateObj, 'EEE, dd.MM.', { locale: de });
}

export function EnergyRecoveryWidget({
  onNavigateToQuests,
  onNavigateToSettings,
}: {
  onNavigateToQuests?: () => void;
  onNavigateToSettings?: () => void;
}) {
  const {
    quests = [],
    diaryEntries = [],
    focusSessions = [],
    healthRecords = [],
    settings,
    updateSettings,
    saveHealthRecord,
    markRecoverySuggestionDecision,
    addQuest,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'today' | 'history'>('today');
  const [showMetricsConfig, setShowMetricsConfig] = useState(false);
  const [showEmptyMetrics, setShowEmptyMetrics] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [providerStatus, setProviderStatus] = useState<HealthProvidersStatus | null>(null);

  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const visibleSet = useMemo(
    () => getVisibleHealthMetricsSet(settings?.visibleHealthMetrics),
    [settings?.visibleHealthMetrics]
  );

  const visibleKeysList = useMemo(() => Array.from(visibleSet), [visibleSet]);

  const historyTooltipEl = useMemo(
    () => <CustomHealthHistoryTooltip visibleKeys={visibleKeysList} />,
    [visibleKeysList]
  );

  const handleChangeVisibleMetrics = (next: HealthMetricKey[]) => {
    updateSettings({ visibleHealthMetrics: next });
  };

  const storedTodayRecord = useMemo(
    () => healthRecords.find((r) => r.id === todayKey) || null,
    [healthRecords, todayKey]
  );

  const todayRecord = useMemo(() => {
    return buildTodayHealthRecord({
      existingRecord: storedTodayRecord,
      focusSessions,
      quests,
      diaryEntries,
    });
  }, [storedTodayRecord, focusSessions, quests, diaryEntries]);

  const sortedHistory = useMemo<HealthDailyRecord[]>(() => {
    return [...healthRecords]
      .filter((r) => safeDate(r.date) !== null)
      .sort((a, b) => (b.date || 0) - (a.date || 0))
      .slice(0, 14);
  }, [healthRecords]);

  const historySummary = useMemo(() => {
    const withSleep = sortedHistory.filter((r) => r.sleepDurationMinutes > 0);
    const avgSleep =
      withSleep.length > 0
        ? Math.round(
            withSleep.reduce((s, r) => s + r.sleepDurationMinutes, 0) / withSleep.length
          )
        : 0;
    const avgActivity =
      sortedHistory.length > 0
        ? Math.round(
            sortedHistory.reduce((s, r) => s + r.activityDurationMinutes, 0) /
              sortedHistory.length
          )
        : 0;
    const avgRecovery =
      sortedHistory.length > 0
        ? Math.round(
            sortedHistory.reduce((s, r) => s + r.recoveryScore, 0) / sortedHistory.length
          )
        : 0;
    const withSteps = sortedHistory.filter((r) => typeof r.steps === 'number' && r.steps > 0);
    const avgSteps =
      withSteps.length > 0
        ? Math.round(withSteps.reduce((s, r) => s + (r.steps || 0), 0) / withSteps.length)
        : 0;

    return {
      totalDays: sortedHistory.length,
      sleepDaysCount: withSleep.length,
      avgSleep,
      avgActivity,
      avgRecovery,
      avgSteps,
    };
  }, [sortedHistory]);

  const historyChartData = useMemo(() => {
    return [...sortedHistory]
      .sort((a, b) => a.date - b.date)
      .map((r) => {
        const d = safeDate(r.date);
        if (!d) return null;
        return {
          dateKey: r.id,
          label: format(d, 'dd.MM.'),
          fullDate: format(d, 'EEEE, dd.MM.yyyy', { locale: de }),
          sleepHours: Number(((r.sleepDurationMinutes || 0) / 60).toFixed(2)),
          recoveryScore: typeof r.recoveryScore === 'number' ? r.recoveryScore : 0,
          record: r,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [sortedHistory]);

  const refreshProviderStatus = useCallback(async () => {
    try {
      const status = await fetchHealthProvidersStatus();
      setProviderStatus({
        garmin: {
          ...status.garmin,
          connected: status.garmin.connected || Boolean(getHealthSessionToken('garmin')),
        },
        google: {
          ...status.google,
          connected: status.google.connected || Boolean(getHealthSessionToken('google')),
        },
      });
    } catch {
      // Ignore transient status fetch failure on mount
    }
  }, []);

  useEffect(() => {
    void refreshProviderStatus();
  }, [refreshProviderStatus]);

  const persistRemoteDays = useCallback(
    async (source: 'garmin_connect' | 'google_health', days?: RemoteHealthDayMetric[]) => {
      const state = useStore.getState();
      const safeDays = Array.isArray(days) ? days : [];
      const targetDays = safeDays.slice(0, 14);
      let touchedToday = false;

      const pickVal = (
        nextVal: number | null | undefined,
        prevVal: number | null | undefined
      ): number | null => {
        if (typeof nextVal === 'number' && Number.isFinite(nextVal)) return nextVal;
        if (typeof prevVal === 'number' && Number.isFinite(prevVal)) return prevVal;
        return null;
      };
      const pickMax = (
        nextVal: number | null | undefined,
        prevVal: number | null | undefined
      ): number | null => {
        const a = typeof nextVal === 'number' && Number.isFinite(nextVal) ? nextVal : null;
        const b = typeof prevVal === 'number' && Number.isFinite(prevVal) ? prevVal : null;
        if (a !== null && b !== null) return Math.max(a, b);
        return a ?? b;
      };

      for (const day of targetDays) {
        if (!day?.dateKey) continue;
        const [y, m, d] = day.dateKey.split('-').map(Number);
        const dayDate = new Date(y, m - 1, d, 12, 0, 0);
        if (Number.isNaN(dayDate.getTime())) continue;
        const existing = useStore.getState().healthRecords.find((r) => r.id === day.dateKey);
        const dayMood =
          state.diaryEntries.find((e) => {
            const ed = safeDate(e.date);
            return ed ? isSameDay(ed, dayDate) : false;
          })?.mood ?? null;

        if (day.dateKey === todayKey) {
          touchedToday = true;
          const existingHasAuthSleep = Boolean(
            existing?.sources?.some(
              (s) =>
                s === 'google_health' ||
                s === 'garmin_connect' ||
                s === 'manual' ||
                s === 'health_export'
            )
          );
          const resolvedSleepOverride =
            day.sleepDurationMinutes > 0
              ? day.sleepDurationMinutes
              : existingHasAuthSleep
              ? existing?.sleepDurationMinutes ?? 0
              : 0;

          const baseToday = buildTodayHealthRecord({
            existingRecord: existing,
            focusSessions: state.focusSessions,
            quests: state.quests,
            diaryEntries: state.diaryEntries,
            overrideSleepMinutes: resolvedSleepOverride,
            overrideActivityMinutes:
              day.activityDurationMinutes > 0
                ? Math.max(day.activityDurationMinutes, existing?.activityDurationMinutes || 0)
                : undefined,
            overrideAvgHeartRate: day.avgHeartRate ?? existing?.avgHeartRate ?? null,
            overrideMetrics: {
              sleepDeepMinutes: pickVal(day.sleepDeepMinutes, existing?.sleepDeepMinutes),
              sleepLightMinutes: pickVal(day.sleepLightMinutes, existing?.sleepLightMinutes),
              sleepRemMinutes: pickVal(day.sleepRemMinutes, existing?.sleepRemMinutes),
              sleepAwakeMinutes: pickVal(day.sleepAwakeMinutes, existing?.sleepAwakeMinutes),
              steps: pickMax(day.steps, existing?.steps),
              distanceMeters: pickMax(day.distanceMeters, existing?.distanceMeters),
              caloriesActive: pickMax(day.caloriesActive, existing?.caloriesActive),
              floorsClimbed: pickMax(day.floorsClimbed, existing?.floorsClimbed),
              heartPoints: pickMax(day.heartPoints, existing?.heartPoints),
              workoutsCount: pickMax(day.workoutsCount, existing?.workoutsCount),
              restingHeartRate: pickVal(day.restingHeartRate, existing?.restingHeartRate),
              hrvMs: pickVal(day.hrvMs, existing?.hrvMs),
              stressLevel: pickVal(day.stressLevel, existing?.stressLevel),
              bodyBattery: pickVal(day.bodyBattery, existing?.bodyBattery),
              spo2Percent: pickVal(day.spo2Percent, existing?.spo2Percent),
              respirationRate: pickVal(day.respirationRate, existing?.respirationRate),
              vo2Max: pickVal(day.vo2Max, existing?.vo2Max),
              weightKg: pickVal(day.weightKg, existing?.weightKg),
              bodyFatPercent: pickVal(day.bodyFatPercent, existing?.bodyFatPercent),
              hydrationMl: pickMax(day.hydrationMl, existing?.hydrationMl),
            },
            extraSources: [source],
          });
          await saveHealthRecord(baseToday);
        } else {
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
            steps: pickMax(day.steps, existing?.steps),
            distanceMeters: pickMax(day.distanceMeters, existing?.distanceMeters),
            caloriesActive: pickMax(day.caloriesActive, existing?.caloriesActive),
            floorsClimbed: pickMax(day.floorsClimbed, existing?.floorsClimbed),
            heartPoints: pickMax(day.heartPoints, existing?.heartPoints),
            workoutsCount: pickMax(day.workoutsCount, existing?.workoutsCount),
            restingHeartRate,
            hrvMs,
            stressLevel,
            bodyBattery,
            spo2Percent: pickVal(day.spo2Percent, existing?.spo2Percent),
            respirationRate: pickVal(day.respirationRate, existing?.respirationRate),
            vo2Max: pickVal(day.vo2Max, existing?.vo2Max),
            weightKg: pickVal(day.weightKg, existing?.weightKg),
            bodyFatPercent: pickVal(day.bodyFatPercent, existing?.bodyFatPercent),
            hydrationMl: pickMax(day.hydrationMl, existing?.hydrationMl),
            sources: Array.from(
              new Set<HealthDataSource>([
                ...(existing?.sources || []).filter((s) => s !== 'browser_idle'),
                source,
              ])
            ).slice(0, 8),
            recoveryScore,
            recoveryState,
            acceptedSuggestionIds: existing?.acceptedSuggestionIds || [],
            dismissedSuggestionIds: existing?.dismissedSuggestionIds || [],
            syncedAt: Date.now(),
          });
        }
      }

      if (!touchedToday) {
        const existingToday = useStore.getState().healthRecords.find((r) => r.id === todayKey);
        const existingHasAuthSleep = Boolean(
          existingToday?.sources?.some(
            (s) =>
              s === 'google_health' ||
              s === 'garmin_connect' ||
              s === 'manual' ||
              s === 'health_export'
          )
        );
        const freshToday = buildTodayHealthRecord({
          existingRecord: existingToday,
          focusSessions: state.focusSessions,
          quests: state.quests,
          diaryEntries: state.diaryEntries,
          overrideSleepMinutes: existingHasAuthSleep
            ? existingToday?.sleepDurationMinutes ?? 0
            : 0,
          extraSources: [source],
        });
        await saveHealthRecord(freshToday);
      }

      return targetDays.length;
    },
    [saveHealthRecord, todayKey]
  );

  const todayMood = useMemo(() => {
    return diaryEntries.find((e) => {
      const ed = safeDate(e.date);
      return ed ? isSameDay(ed, new Date()) : false;
    })?.mood ?? null;
  }, [diaryEntries]);

  const todayFocusMinutes = useMemo(() => {
    const today = new Date();
    return focusSessions
      .filter((f) => {
        const fd = safeDate(f.completedAt);
        return fd ? isSameDay(fd, today) : false;
      })
      .reduce((sum, f) => sum + (f.durationMinutes || 0), 0);
  }, [focusSessions]);

  const suggestions = useMemo(
    () =>
      generateEnergyRecoveryQuests({
        record: todayRecord,
        todayMood,
        todayFocusMinutes,
        existingQuests: quests,
      }),
    [todayRecord, todayMood, todayFocusMinutes, quests]
  );

  const recoveryMeta = RECOVERY_STATE_META[todayRecord.recoveryState] ?? RECOVERY_STATE_META.balanced;

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const syncedRemoteProviders: string[] = [];

      if (providerStatus?.garmin.connected) {
        try {
          const res = await syncHealthProvider('garmin');
          await persistRemoteDays(res.provider, res.days);
          syncedRemoteProviders.push('Garmin Connect');
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Garmin-Sync fehlgeschlagen.');
        }
      }

      if (providerStatus?.google.connected) {
        try {
          const res = await syncHealthProvider('google');
          await persistRemoteDays(res.provider, res.days);
          syncedRemoteProviders.push('Google Health');
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Google Health-Sync fehlgeschlagen.');
        }
      }

      const latestState = useStore.getState();
      const freshRecord = buildTodayHealthRecord({
        existingRecord: latestState.healthRecords.find((r) => r.id === todayKey),
        focusSessions: latestState.focusSessions,
        quests: latestState.quests,
        diaryEntries: latestState.diaryEntries,
      });
      await saveHealthRecord(freshRecord);

      const providerNote =
        syncedRemoteProviders.length > 0 ? ` (${syncedRemoteProviders.join(' & ')})` : '';
      toast.success(
        `Gesundheitsdaten synchronisiert${providerNote} · Recovery-Score: ${freshRecord.recoveryScore}/100`
      );
    } catch (error) {
      console.error('Health sync error:', error);
      toast.error('Synchronisierung fehlgeschlagen.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAcceptSuggestion = async (suggestion: EnergyRecoverySuggestion) => {
    if (!storedTodayRecord) {
      await saveHealthRecord(todayRecord);
    }

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    addQuest({
      title: suggestion.title,
      description: `${suggestion.description}\n\nAuslöser: ${suggestion.reason}`,
      skill: suggestion.skill,
      xpReward: suggestion.xpReward,
      type: 'daily',
      dueDate: todayEnd.getTime(),
      hasTime: false,
      reminderTiming: 'none',
      recurrence: 'none',
      tags: suggestion.tags,
    });

    await markRecoverySuggestionDecision(todayRecord.id, suggestion.id, 'accepted');
    toast.success(`Energy-Recovery Quest "${suggestion.title}" zu Quests hinzugefügt`);
  };

  const handleDismissSuggestion = async (suggestionId: string) => {
    if (!storedTodayRecord) {
      await saveHealthRecord(todayRecord);
    }
    await markRecoverySuggestionDecision(todayRecord.id, suggestionId, 'dismissed');
  };

  const telemetry = loadBrowserTelemetry();
  const hasRemoteConnection = Boolean(
    providerStatus?.google.connected || providerStatus?.garmin.connected
  );

  // Derived visibility splits for Heute tab
  const showRecoveryPrimary = visibleSet.has('recoveryScore');
  const showSleepPrimary = visibleSet.has('sleepDurationMinutes');
  const showActivityPrimary = visibleSet.has('activityDurationMinutes');
  const primaryVisibleCount =
    (showRecoveryPrimary ? 1 : 0) +
    (showSleepPrimary ? 1 : 0) +
    (showActivityPrimary ? 1 : 0);

  const sleepPhaseKeys: HealthMetricKey[] = [
    'sleepDeepMinutes',
    'sleepRemMinutes',
    'sleepLightMinutes',
    'sleepAwakeMinutes',
  ];
  const enabledSleepPhases = sleepPhaseKeys.filter(
    (k) => visibleSet.has(k) && hasHealthMetricValue(k, todayRecord)
  );
  const sleepPhaseTotals = {
    deep: visibleSet.has('sleepDeepMinutes') ? todayRecord.sleepDeepMinutes || 0 : 0,
    rem: visibleSet.has('sleepRemMinutes') ? todayRecord.sleepRemMinutes || 0 : 0,
    light: visibleSet.has('sleepLightMinutes') ? todayRecord.sleepLightMinutes || 0 : 0,
    awake: visibleSet.has('sleepAwakeMinutes') ? todayRecord.sleepAwakeMinutes || 0 : 0,
  };
  const sleepPhaseSum =
    sleepPhaseTotals.deep +
    sleepPhaseTotals.rem +
    sleepPhaseTotals.light +
    sleepPhaseTotals.awake;

  const secondaryEnabledCatalog = HEALTH_METRICS_CATALOG.filter(
    (m) => !m.isPrimary && visibleSet.has(m.key)
  );
  const secondaryWithData = secondaryEnabledCatalog.filter((m) =>
    hasHealthMetricValue(m.key, todayRecord)
  );
  const secondaryWithoutData = secondaryEnabledCatalog.filter(
    (m) => !hasHealthMetricValue(m.key, todayRecord)
  );
  const displayedSecondaryMetrics = showEmptyMetrics
    ? secondaryEnabledCatalog
    : secondaryWithData;

  return (
    <div className="bg-neutral-900 p-4 sm:p-6 rounded-2xl border border-neutral-800 h-full flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-white">
            <HeartPulse className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Energie &amp; Erholung</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Recovery-Score &amp; personalisierte Energy-Recovery-Quests
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center p-1 rounded-xl bg-neutral-950 border border-neutral-800">
            <button
              type="button"
              onClick={() => setActiveTab('today')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap',
                activeTab === 'today'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              )}
            >
              Heute
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1',
                activeTab === 'history'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-neutral-200'
              )}
            >
              <Calendar className="w-3 h-3" />
              <span>Historie ({sortedHistory.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowMetricsConfig((prev) => !prev)}
            aria-expanded={showMetricsConfig}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap min-h-[38px]',
              showMetricsConfig
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Kennzahlen ({visibleSet.size})</span>
          </button>

          {onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-neutral-950 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-xs font-semibold transition-colors whitespace-nowrap min-h-[38px]"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Quellen</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors whitespace-nowrap min-h-[38px] disabled:opacity-60"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Collapsible Metric Visibility Selector */}
      {showMetricsConfig && (
        <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 sm:p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-white">
                Sichtbare Kennzahlen auswählen
              </h4>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Entscheide individuell, welche der 24 Google Health &amp; Garmin Kennzahlen im
                Dashboard und in der Historie angezeigt werden.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMetricsConfig(false)}
              aria-label="Kennzahlen-Auswahl schließen"
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <HealthMetricsPicker
            visibleMetrics={settings?.visibleHealthMetrics}
            onChange={handleChangeVisibleMetrics}
            currentRecord={todayRecord}
            historyRecords={sortedHistory}
            compact
          />
        </div>
      )}

      {visibleSet.size === 0 ? (
        <div className="p-6 rounded-xl bg-neutral-950/80 border border-neutral-800 text-center space-y-3">
          <p className="text-xs text-neutral-400">
            Alle Health-Kennzahlen sind derzeit ausgeblendet. Wähle gewünschte Kennzahlen aus oder
            stelle die Standardansicht wieder her.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setShowMetricsConfig(true)}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors"
            >
              Kennzahlen wählen
            </button>
            <button
              type="button"
              onClick={() => handleChangeVisibleMetrics(DEFAULT_VISIBLE_HEALTH_METRICS)}
              className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition-colors"
            >
              Standard wiederherstellen
            </button>
          </div>
        </div>
      ) : activeTab === 'today' ? (
        <>
          {/* Primary Readiness & Duration Metrics */}
          {primaryVisibleCount > 0 && (
            <div
              className={cn(
                'grid gap-3',
                primaryVisibleCount === 1
                  ? 'grid-cols-1'
                  : primaryVisibleCount === 2
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-3'
              )}
            >
              {showRecoveryPrimary && (
                <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-neutral-400">
                    <span className="flex items-center gap-1.5">
                      <BatteryCharging className="w-3.5 h-3.5 text-amber-500" />
                      Recovery-Score
                    </span>
                    <span className="font-mono font-bold text-white tabular-nums">
                      {todayRecord.recoveryScore}/100
                    </span>
                  </div>
                  <div className="mt-2 w-full h-2 bg-neutral-900 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', recoveryMeta.barClass)}
                      style={{ width: `${todayRecord.recoveryScore}%` }}
                    />
                  </div>
                  <div className={cn('text-xs font-semibold mt-2', recoveryMeta.textClass)}>
                    {recoveryMeta.label}
                  </div>
                </div>
              )}

              {showSleepPrimary && (
                <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Schlafdauer</span>
                  </div>
                  <div className="text-xl font-bold text-white tabular-nums mt-1">
                    {todayRecord.sleepDurationMinutes > 0
                      ? formatMinutesAsHoursMinutes(todayRecord.sleepDurationMinutes)
                      : 'Nicht erfasst'}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1">
                    {todayRecord.sleepDurationMinutes === 0 ? (
                      'Noch keine Schlafdaten'
                    ) : (
                      <>
                        Ziel: 7h 30m ·{' '}
                        {todayRecord.sources.includes('garmin_connect')
                          ? 'Garmin Connect'
                          : todayRecord.sources.includes('google_health')
                          ? 'Google Health'
                          : todayRecord.sources.includes('manual')
                          ? 'Manuell'
                          : todayRecord.sources.includes('health_export')
                          ? 'Health-Export'
                          : telemetry.overnightRestGapMinutes > 0
                          ? 'Browser-Ruhefenster'
                          : 'Einstellungen → Quellen'}
                      </>
                    )}
                  </div>
                </div>
              )}

              {showActivityPrimary && (
                <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Aktivitätsdauer</span>
                  </div>
                  <div className="text-xl font-bold text-white tabular-nums mt-1">
                    {todayRecord.activityDurationMinutes} Min
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
                    {visibleSet.has('avgHeartRate') && todayRecord.avgHeartRate
                      ? `Ø ${todayRecord.avgHeartRate} BPM`
                      : `Fokus heute: ${todayFocusMinutes} Min`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sleep Stages Architecture Bar */}
          {enabledSleepPhases.length > 0 && sleepPhaseSum > 0 && (
            <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  Schlafphasen-Verteilung
                </span>
                <div className="flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
                  {sleepPhaseTotals.deep > 0 && (
                    <span className="flex items-center gap-1 text-indigo-300">
                      <span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" />
                      Tief {formatMinutesAsHoursMinutes(sleepPhaseTotals.deep)}
                    </span>
                  )}
                  {sleepPhaseTotals.rem > 0 && (
                    <span className="flex items-center gap-1 text-purple-300">
                      <span className="w-2 h-2 rounded-sm bg-purple-500 inline-block" />
                      REM {formatMinutesAsHoursMinutes(sleepPhaseTotals.rem)}
                    </span>
                  )}
                  {sleepPhaseTotals.light > 0 && (
                    <span className="flex items-center gap-1 text-sky-300">
                      <span className="w-2 h-2 rounded-sm bg-sky-400 inline-block" />
                      Leicht {formatMinutesAsHoursMinutes(sleepPhaseTotals.light)}
                    </span>
                  )}
                  {sleepPhaseTotals.awake > 0 && (
                    <span className="flex items-center gap-1 text-amber-300">
                      <span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" />
                      Wach {sleepPhaseTotals.awake} Min
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2.5 w-full rounded-full overflow-hidden bg-neutral-900 flex">
                {sleepPhaseTotals.deep > 0 && (
                  <div
                    className="bg-indigo-500 h-full"
                    style={{ width: `${(sleepPhaseTotals.deep / sleepPhaseSum) * 100}%` }}
                  />
                )}
                {sleepPhaseTotals.rem > 0 && (
                  <div
                    className="bg-purple-500 h-full"
                    style={{ width: `${(sleepPhaseTotals.rem / sleepPhaseSum) * 100}%` }}
                  />
                )}
                {sleepPhaseTotals.light > 0 && (
                  <div
                    className="bg-sky-400 h-full"
                    style={{ width: `${(sleepPhaseTotals.light / sleepPhaseSum) * 100}%` }}
                  />
                )}
                {sleepPhaseTotals.awake > 0 && (
                  <div
                    className="bg-amber-500 h-full"
                    style={{ width: `${(sleepPhaseTotals.awake / sleepPhaseSum) * 100}%` }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Extended Metrics Grid (All user-enabled non-primary metrics) */}
          {secondaryEnabledCatalog.length > 0 && (
            <div className="space-y-2.5">
              {displayedSecondaryMetrics.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {displayedSecondaryMetrics.map((metric) => {
                    const iconMeta = METRIC_ICON_META[metric.key];
                    const Icon = iconMeta.icon;
                    const formatted = formatHealthMetricValue(metric.key, todayRecord);
                    return (
                      <div
                        key={metric.key}
                        className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3 flex flex-col justify-between gap-1 min-w-0"
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 min-w-0">
                          <Icon className={cn('w-3.5 h-3.5 shrink-0', iconMeta.colorClass)} />
                          <span className="truncate">{metric.shortLabel}</span>
                        </div>
                        <div
                          className={cn(
                            'text-base font-bold tabular-nums truncate',
                            formatted ? 'text-white' : 'text-neutral-600'
                          )}
                        >
                          {formatted || '–'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {secondaryWithoutData.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-neutral-950/60 border border-neutral-800/80 text-[11px] text-neutral-500">
                  <span className="min-w-0">
                    Heute ohne Messwert ({secondaryWithoutData.length}):{' '}
                    <span className="text-neutral-400">
                      {secondaryWithoutData.map((m) => m.shortLabel).join(', ')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEmptyMetrics((prev) => !prev)}
                    className="text-amber-400 hover:text-amber-300 font-semibold whitespace-nowrap shrink-0"
                  >
                    {showEmptyMetrics ? 'Leere ausblenden' : 'Trotzdem als Kacheln'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Personalized Energy-Recovery Quests */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-neutral-200">
                Vorgeschlagene Energy-Recovery-Quests ({suggestions.length})
              </span>
              {onNavigateToQuests && (
                <button
                  type="button"
                  onClick={onNavigateToQuests}
                  className="text-amber-400 hover:text-amber-300 font-semibold transition-colors whitespace-nowrap"
                >
                  Zu Quests →
                </button>
              )}
            </div>

            {suggestions.length === 0 ? (
              <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 text-xs text-neutral-400 flex items-center justify-between gap-2">
                <span>
                  Alle passenden Recovery-Quests für heute sind bereits aktiv oder erledigt.
                </span>
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
            ) : (
              <div className="space-y-2">
                {suggestions.map((s) => {
                  const isAccepted = todayRecord.acceptedSuggestionIds?.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-400">
                          <span className={cn('font-semibold', SKILL_COLORS[s.skill])}>
                            {s.skill}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-bold text-amber-400 tabular-nums">
                            +{s.xpReward} EP
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{s.recommendedDurationMinutes} Min</span>
                          {s.priority === 'high' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-rose-400 font-semibold">Hohe Priorität</span>
                            </>
                          )}
                        </div>
                        <h4 className="font-bold text-sm text-white">{s.title}</h4>
                        <p className="text-xs text-neutral-400">{s.reason}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleAcceptSuggestion(s)}
                          disabled={isAccepted}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap min-h-[38px]',
                            isAccepted
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-default'
                              : 'bg-amber-500 hover:bg-amber-400 text-neutral-950'
                          )}
                        >
                          {isAccepted ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Übernommen</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Als Quest</span>
                            </>
                          )}
                        </button>

                        {!isAccepted && (
                          <button
                            type="button"
                            onClick={() => handleDismissSuggestion(s.id)}
                            title="Vorschlag ausblenden"
                            aria-label="Vorschlag ausblenden"
                            className="p-2 rounded-xl border border-neutral-800 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Health History Tab (Last 14 Days) */
        <div className="space-y-4">
          {/* 14-Day Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {showSleepPrimary && (
              <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3">
                <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <Moon className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span className="truncate">Ø Schlaf</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-white tabular-nums mt-0.5">
                  {historySummary.avgSleep > 0
                    ? formatMinutesAsHoursMinutes(historySummary.avgSleep)
                    : '–'}
                </div>
                <div className="text-[10px] text-neutral-500">
                  {historySummary.sleepDaysCount}{' '}
                  {historySummary.sleepDaysCount === 1 ? 'Nacht' : 'Nächte'}
                </div>
              </div>
            )}

            {showActivityPrimary && (
              <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3">
                <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">Ø Aktivität</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-white tabular-nums mt-0.5">
                  {historySummary.avgActivity} Min
                </div>
                <div className="text-[10px] text-neutral-500">pro Tag</div>
              </div>
            )}

            {visibleSet.has('steps') && (
              <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3">
                <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <Footprints className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">Ø Schritte</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-white tabular-nums mt-0.5">
                  {historySummary.avgSteps > 0
                    ? historySummary.avgSteps.toLocaleString('de-DE')
                    : '–'}
                </div>
                <div className="text-[10px] text-neutral-500">pro Tag</div>
              </div>
            )}

            {showRecoveryPrimary && (
              <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3">
                <div className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <BatteryCharging className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="truncate">Ø Recovery</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-white tabular-nums mt-0.5">
                  {historySummary.totalDays > 0 ? `${historySummary.avgRecovery}/100` : '–'}
                </div>
                <div className="text-[10px] text-neutral-500">
                  {historySummary.totalDays}{' '}
                  {historySummary.totalDays === 1 ? 'Tag' : 'Tage'}
                </div>
              </div>
            )}
          </div>

          {historyChartData.length > 0 ? (
            <>
              {/* Sleep & Recovery Trend Chart */}
              <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-neutral-200">
                    Schlaf (Std) &amp; Recovery-Verlauf
                  </span>
                  <div className="flex items-center gap-3 text-[11px] text-neutral-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 inline-block" />
                      Schlaf
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                      Recovery
                    </span>
                  </div>
                </div>
                <div className="h-48 w-full min-w-0">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={0}
                    minHeight={180}
                    initialDimension={{ width: 320, height: 180 }}
                    debounce={50}
                  >
                    <ComposedChart data={historyChartData} margin={HISTORY_CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#737373"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        yAxisId="sleep"
                        domain={SLEEP_DOMAIN}
                        stroke="#737373"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}h`}
                      />
                      <YAxis
                        yAxisId="score"
                        orientation="right"
                        domain={SCORE_DOMAIN}
                        stroke="#737373"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        hide
                      />
                      <Tooltip cursor={HISTORY_CURSOR} content={historyTooltipEl} />
                      <Bar
                        yAxisId="sleep"
                        dataKey="sleepHours"
                        name="Schlaf (Std)"
                        fill="#818cf8"
                        radius={HISTORY_BAR_RADIUS}
                        maxBarSize={24}
                      />
                      <Line
                        yAxisId="score"
                        type="monotone"
                        dataKey="recoveryScore"
                        name="Recovery-Score"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={SCORE_LINE_DOT}
                        activeDot={SCORE_LINE_ACTIVE_DOT}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Daily History Breakdown */}
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {sortedHistory.map((item) => {
                  const meta = RECOVERY_STATE_META[item.recoveryState] ?? RECOVERY_STATE_META.balanced;
                  const itemSources = Array.isArray(item.sources) ? item.sources : [];
                  const visibleSources = itemSources.filter(
                    (s) => s !== 'browser_idle' || itemSources.length === 1
                  );
                  const rowMetrics = HEALTH_METRICS_CATALOG.filter(
                    (m) =>
                      m.key !== 'recoveryScore' &&
                      visibleSet.has(m.key) &&
                      hasHealthMetricValue(m.key, item)
                  );
                  return (
                    <div
                      key={item.id}
                      className="bg-neutral-950/90 border border-neutral-800 rounded-xl px-3.5 py-2.5 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-semibold text-white">
                            {formatHistoryDateLabel(item.date)}
                          </span>
                          <span className="text-[11px] text-neutral-500 ml-2">
                            {visibleSources.map((s) => SOURCE_LABELS[s] || s).join(' · ')}
                          </span>
                        </div>
                        {showRecoveryPrimary && (
                          <span className={cn('font-mono font-bold tabular-nums', meta.textClass)}>
                            {item.recoveryScore}/100
                          </span>
                        )}
                      </div>

                      {rowMetrics.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 tabular-nums text-[11px]">
                          {rowMetrics.map((m) => {
                            const val = formatHealthMetricValue(m.key, item);
                            if (!val) return null;
                            const iconMeta = METRIC_ICON_META[m.key];
                            const Icon = iconMeta.icon;
                            return (
                              <span
                                key={m.key}
                                className="inline-flex items-center gap-1 text-neutral-200 font-medium"
                              >
                                <Icon className={cn('w-3 h-3 shrink-0', iconMeta.colorClass)} />
                                <span className="text-neutral-400">{m.shortLabel}:</span>
                                <span>{val}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="p-5 rounded-xl bg-neutral-950/70 border border-neutral-800 text-center space-y-2.5">
              <p className="text-xs text-neutral-400">
                Noch keine Health-Historie gespeichert. Synchronisiere deinen Anbieter, um die
                letzten 14 Tage zu laden.
              </p>
              {hasRemoteConnection ? (
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
                  <span>14 Tage synchronisieren</span>
                </button>
              ) : (
                onNavigateToSettings && (
                  <button
                    type="button"
                    onClick={onNavigateToSettings}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition-colors"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Quellen einrichten</span>
                  </button>
                )
              )}
            </div>
          )}

          {sortedHistory.length <= 1 && hasRemoteConnection && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200">
              <span>Es liegt bisher nur 1 Tag vor. Du kannst jetzt die letzten 14 Tage abrufen.</span>
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="font-bold text-amber-400 hover:text-amber-300 underline whitespace-nowrap"
              >
                14 Tage abrufen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="pt-2 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500 mt-auto">
        <span>
          Letzter Sync:{' '}
          {(() => {
            const syncDate = safeDate(storedTodayRecord?.syncedAt);
            return syncDate ? `${format(syncDate, 'HH:mm')} Uhr` : 'Live-Vorschau';
          })()}
        </span>
        <span>
          {(Array.isArray(todayRecord.sources) ? todayRecord.sources : [])
            .filter((s) => s !== 'browser_idle' || (todayRecord.sources || []).length === 1)
            .map((s) => SOURCE_LABELS[s] || s)
            .join(' · ')}
        </span>
      </div>
    </div>
  );
}
