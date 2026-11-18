import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Activity,
  BatteryCharging,
  Check,
  HeartPulse,
  Moon,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { format, isSameDay, startOfDay } from 'date-fns';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { cn, SKILL_COLORS } from '@/lib/utils';
import {
  HealthProvidersStatus,
  RemoteHealthDayMetric,
  buildTodayHealthRecord,
  calculateRecoveryMetrics,
  fetchHealthProvidersStatus,
  formatMinutesAsHoursMinutes,
  generateEnergyRecoveryQuests,
  getHealthSessionToken,
  loadBrowserTelemetry,
  syncHealthProvider,
} from '@/services/healthSyncService';
import { EnergyRecoverySuggestion, HealthDataSource, RecoveryState } from '@/types';

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

export function EnergyRecoveryWidget({
  onNavigateToQuests,
  onNavigateToSettings,
}: {
  onNavigateToQuests?: () => void;
  onNavigateToSettings?: () => void;
}) {
  const {
    quests,
    diaryEntries,
    focusSessions,
    healthRecords,
    saveHealthRecord,
    markRecoverySuggestionDecision,
    addQuest,
  } = useStore();

  const [isSyncing, setIsSyncing] = useState(false);
  const [providerStatus, setProviderStatus] = useState<HealthProvidersStatus | null>(null);

  const todayKey = format(new Date(), 'yyyy-MM-dd');

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

      if (targetDays.length === 0) {
        const freshToday = buildTodayHealthRecord({
          existingRecord: state.healthRecords.find((r) => r.id === todayKey),
          focusSessions: state.focusSessions,
          quests: state.quests,
          diaryEntries: state.diaryEntries,
          extraSources: [source],
        });
        await saveHealthRecord(freshToday);
        return 0;
      }

      for (const day of targetDays) {
        const [y, m, d] = day.dateKey.split('-').map(Number);
        const dayDate = new Date(y, m - 1, d, 12, 0, 0);
        const existing = useStore.getState().healthRecords.find((r) => r.id === day.dateKey);
        const dayMood =
          state.diaryEntries.find((e) => isSameDay(new Date(e.date), dayDate))?.mood ?? null;

        if (day.dateKey === todayKey) {
          const baseToday = buildTodayHealthRecord({
            existingRecord: existing,
            focusSessions: state.focusSessions,
            quests: state.quests,
            diaryEntries: state.diaryEntries,
            overrideSleepMinutes:
              day.sleepDurationMinutes > 0
                ? day.sleepDurationMinutes
                : existing?.sleepDurationMinutes,
            overrideActivityMinutes:
              day.activityDurationMinutes > 0
                ? Math.max(day.activityDurationMinutes, existing?.activityDurationMinutes || 0)
                : undefined,
            overrideAvgHeartRate: day.avgHeartRate ?? existing?.avgHeartRate ?? null,
            extraSources: [source],
          });
          await saveHealthRecord(baseToday);
        } else {
          const sleepMin = day.sleepDurationMinutes || existing?.sleepDurationMinutes || 0;
          const activityMin =
            day.activityDurationMinutes || existing?.activityDurationMinutes || 0;
          const avgHr = day.avgHeartRate ?? existing?.avgHeartRate ?? null;
          const { recoveryScore, recoveryState } = calculateRecoveryMetrics({
            sleepDurationMinutes: sleepMin,
            activityDurationMinutes: activityMin,
            avgHeartRate: avgHr,
            todayMood: dayMood,
          });

          await saveHealthRecord({
            id: day.dateKey,
            date: startOfDay(dayDate).getTime(),
            sleepDurationMinutes: sleepMin,
            activityDurationMinutes: activityMin,
            avgHeartRate: avgHr,
            sources: Array.from(
              new Set<HealthDataSource>([...(existing?.sources || []), source])
            ).slice(0, 8),
            recoveryScore,
            recoveryState,
            acceptedSuggestionIds: existing?.acceptedSuggestionIds || [],
            dismissedSuggestionIds: existing?.dismissedSuggestionIds || [],
            syncedAt: Date.now(),
          });
        }
      }

      return targetDays.length;
    },
    [saveHealthRecord, todayKey]
  );

  const todayMood = useMemo(() => {
    return diaryEntries.find((e) => isSameDay(new Date(e.date), new Date()))?.mood ?? null;
  }, [diaryEntries]);

  const todayFocusMinutes = useMemo(() => {
    const today = new Date();
    return focusSessions
      .filter((f) => isSameDay(new Date(f.completedAt), today))
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

  const recoveryMeta = RECOVERY_STATE_META[todayRecord.recoveryState];

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

        <div className="flex items-center gap-2 shrink-0">
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

      {/* Primary Readiness & Duration Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            Ziel: 7h 30m ·{' '}
            {todayRecord.sources.includes('garmin_connect')
              ? 'Garmin Connect'
              : todayRecord.sources.includes('google_health')
              ? 'Google Health'
              : telemetry.overnightRestGapMinutes > 0
              ? 'Browser-Ruhefenster'
              : 'Einstellungen → Quellen'}
          </div>
        </div>

        <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Aktivitätsdauer</span>
          </div>
          <div className="text-xl font-bold text-white tabular-nums mt-1">
            {todayRecord.activityDurationMinutes} Min
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
            {todayRecord.avgHeartRate
              ? `Ø ${todayRecord.avgHeartRate} BPM`
              : `Fokus heute: ${todayFocusMinutes} Min`}
          </div>
        </div>
      </div>

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
            <span>Alle passenden Recovery-Quests für heute sind bereits aktiv oder erledigt.</span>
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
                      <span className={cn('font-semibold', SKILL_COLORS[s.skill])}>{s.skill}</span>
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

      {/* Footer Info */}
      <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span>
          Letzter Sync:{' '}
          {storedTodayRecord
            ? format(new Date(storedTodayRecord.syncedAt), 'HH:mm') + ' Uhr'
            : 'Live-Vorschau'}
        </span>
        <span>
          {todayRecord.sources.map((s) => SOURCE_LABELS[s]).join(' · ')}
        </span>
      </div>
    </div>
  );
}
