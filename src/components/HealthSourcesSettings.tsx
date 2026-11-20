import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Link2,
  RefreshCw,
  Unlink,
  Watch,
  X,
} from 'lucide-react';
import { format, isSameDay, isToday, isYesterday, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import {
  HEALTH_METRICS_CATALOG,
  HealthProvidersStatus,
  ProviderNotConfiguredError,
  RemoteHealthDayMetric,
  buildTodayHealthRecord,
  calculateRecoveryMetrics,
  disconnectHealthProvider,
  fetchHealthProvidersStatus,
  formatHealthMetricValue,
  getHealthSessionToken,
  getVisibleHealthMetricsSet,
  hasHealthMetricValue,
  openHealthProviderOAuthPopup,
  setHealthSessionToken,
  syncHealthProvider,
} from '@/services/healthSyncService';
import { HealthDataSource, HealthMetricKey } from '@/types';
import { HealthMetricsPicker } from '@/components/HealthMetricsPicker';

const SOURCE_LABELS: Record<HealthDataSource, string> = {
  browser_idle: 'Garmin Connect',
  device_motion: 'Garmin Connect',
  web_bluetooth: 'Garmin Connect',
  health_export: 'Garmin Connect',
  aura_activity: 'Garmin Connect',
  garmin_connect: 'Garmin Connect',
  google_health: 'Garmin Connect',
  manual: 'Garmin Connect',
};

function safeDate(val: unknown): Date | null {
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
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

export function HealthSourcesSettings() {
  const {
    quests = [],
    diaryEntries = [],
    focusSessions = [],
    healthRecords = [],
    settings,
    updateSettings,
    saveHealthRecord,
  } = useStore();

  const [showMetricsSection, setShowMetricsSection] = useState(false);

  const [providerStatus, setProviderStatus] = useState<HealthProvidersStatus | null>(null);
  const [providerBackendError, setProviderBackendError] = useState<string | null>(null);
  const [isSyncingGarmin, setIsSyncingGarmin] = useState(false);
  const [garminLastSyncAt, setGarminLastSyncAt] = useState<number | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [setupCallbackUrl, setSetupCallbackUrl] = useState<string>('');

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
      setProviderBackendError(null);
      setProviderStatus({
        backendAvailable: status.backendAvailable,
        garmin: {
          ...status.garmin,
          connected: status.garmin.connected || Boolean(getHealthSessionToken('garmin')),
        },
      });
    } catch (error: unknown) {
      setProviderBackendError(
        error instanceof Error
          ? error.message
          : 'Garmin-Backend ist unter dieser Live-URL aktuell nicht erreichbar.'
      );
    }
  }, []);

  useEffect(() => {
    void refreshProviderStatus();
  }, [refreshProviderStatus]);

  const persistGarminDays = useCallback(
    async (days?: RemoteHealthDayMetric[]) => {
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
          const resolvedSleepOverride =
            day.sleepDurationMinutes > 0
              ? day.sleepDurationMinutes
              : existing?.sleepDurationMinutes ?? 0;

          const baseToday = buildTodayHealthRecord({
            existingRecord: existing,
            focusSessions: state.focusSessions,
            quests: state.quests,
            diaryEntries: state.diaryEntries,
            overrideSleepMinutes: resolvedSleepOverride,
            overrideActivityMinutes:
              day.activityDurationMinutes > 0
                ? day.activityDurationMinutes
                : existing?.activityDurationMinutes,
            overrideAvgHeartRate: day.avgHeartRate ?? existing?.avgHeartRate ?? null,
            overrideMetrics: {
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
              restingHeartRate: pickVal(day.restingHeartRate, existing?.restingHeartRate),
              hrvMs: pickVal(day.hrvMs, existing?.hrvMs),
              stressLevel: pickVal(day.stressLevel, existing?.stressLevel),
              bodyBattery: pickVal(day.bodyBattery, existing?.bodyBattery),
              spo2Percent: pickVal(day.spo2Percent, existing?.spo2Percent),
              respirationRate: pickVal(day.respirationRate, existing?.respirationRate),
              vo2Max: pickVal(day.vo2Max, existing?.vo2Max),
              weightKg: pickVal(day.weightKg, existing?.weightKg),
              bodyFatPercent: pickVal(day.bodyFatPercent, existing?.bodyFatPercent),
              hydrationMl: pickVal(day.hydrationMl, existing?.hydrationMl),
            },
            extraSources: ['garmin_connect'],
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
        }
      }

      if (!touchedToday) {
        const existingToday = useStore.getState().healthRecords.find((r) => r.id === todayKey);
        const freshToday = buildTodayHealthRecord({
          existingRecord: existingToday,
          focusSessions: state.focusSessions,
          quests: state.quests,
          diaryEntries: state.diaryEntries,
          overrideSleepMinutes: existingToday?.sleepDurationMinutes ?? 0,
          extraSources: ['garmin_connect'],
        });
        await saveHealthRecord(freshToday);
      }

      return targetDays.length;
    },
    [saveHealthRecord, todayKey]
  );

  const handleSyncGarmin = useCallback(
    async (silent = false) => {
      setIsSyncingGarmin(true);
      try {
        const res = await syncHealthProvider('garmin');
        setGarminLastSyncAt(res.garminLastSyncAt ?? null);
        if (res.activities?.length) {
          useStore.getState().mergeGarminActivities(res.activities);
        }
        const count = await persistGarminDays(res.days);
        const todaySynced = res.days.find((d) => d.dateKey === todayKey);
        const watchSyncLabel = res.garminLastSyncAt
          ? format(new Date(res.garminLastSyncAt), 'HH:mm', { locale: de })
          : null;
        if (!silent) {
          toast.success(
            count > 0
              ? `Garmin Connect: ${
                  typeof todaySynced?.steps === 'number'
                    ? `${todaySynced.steps.toLocaleString('de-DE')} Schritte heute`
                    : `${count} ${count === 1 ? 'Tag' : 'Tage'} synchronisiert`
                }${watchSyncLabel ? ` · Watch-Stand ${watchSyncLabel} Uhr` : ''}`
              : 'Garmin Connect verbunden – aktuell noch keine neuen Tageswerte im Zeitraum'
          );
        }
        return count;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : 'Synchronisierung mit Garmin Connect fehlgeschlagen.';
        if (!silent) {
          toast.error(msg);
        }
        void refreshProviderStatus();
        return -1;
      } finally {
        setIsSyncingGarmin(false);
      }
    },
    [persistGarminDays, refreshProviderStatus, todayKey]
  );

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }

      const data = event.data as
        | {
            type?: string;
            provider?: string;
            sessionToken?: string;
            connectedAt?: number;
            message?: string;
          }
        | undefined;

      if (!data?.type || data.provider !== 'garmin') return;

      if (data.type === 'HEALTH_OAUTH_ERROR') {
        toast.error(data.message || 'Anmeldung bei Garmin Connect fehlgeschlagen.');
        return;
      }

      if (data.type === 'HEALTH_OAUTH_SUCCESS' && data.sessionToken) {
        setHealthSessionToken('garmin', data.sessionToken);
        setShowSetupGuide(false);
        setProviderStatus((prev) =>
          prev
            ? {
                ...prev,
                garmin: {
                  ...prev.garmin,
                  connected: true,
                  connectedAt: data.connectedAt || Date.now(),
                },
              }
            : prev
        );
        void handleSyncGarmin();
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [handleSyncGarmin]);

  const handleConnectGarmin = async () => {
    try {
      await openHealthProviderOAuthPopup('garmin');
    } catch (error: unknown) {
      if (error instanceof ProviderNotConfiguredError) {
        setShowSetupGuide(true);
        setSetupCallbackUrl(error.callbackUrl);
        toast.info(error.message);
        return;
      }
      const msg = error instanceof Error ? error.message : 'Verbindung konnte nicht gestartet werden.';
      toast.error(msg);
    }
  };

  const handleDisconnectGarmin = async () => {
    try {
      await disconnectHealthProvider('garmin');
      await refreshProviderStatus();
      toast.info('Garmin Connect getrennt');
    } catch {
      toast.error('Verbindung konnte nicht getrennt werden.');
    }
  };

  const handleCopyCallbackUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Callback-URL kopiert');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  return (
    <div className="space-y-5">
      {/* Garmin Connect Provider Card */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-neutral-200">
            Verbundene Gesundheitsquelle
          </span>
          <span className="text-neutral-400">
            Quelle: Garmin Connect
          </span>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
              <Watch className="w-5 h-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white truncate">Garmin Connect</span>
                {providerStatus?.garmin.connected && (
                  <span className="text-[11px] font-bold text-emerald-400 shrink-0">Aktiv</span>
                )}
              </div>
              <div className="text-xs text-neutral-400 truncate">
                {providerStatus?.garmin.connected
                  ? providerStatus.garmin.authMode === 'api_key'
                    ? 'Verbunden · Personal API Key (14-Tage-Sync)'
                    : 'Verbunden · Dailies & Schlaf'
                  : providerStatus?.backendAvailable === false
                  ? 'Node-Server erforderlich'
                  : providerStatus?.garmin.configured
                  ? providerStatus.garmin.authMode === 'api_key'
                    ? 'Personal API Key bereit'
                    : 'OAuth 2.0 PKCE bereit'
                  : 'Personal API Key erforderlich'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {providerStatus?.garmin.connected ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSyncGarmin()}
                  disabled={isSyncingGarmin}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-neutral-950 text-xs font-bold transition-colors disabled:opacity-60 min-h-[38px]"
                >
                  <RefreshCw
                    className={cn('w-3.5 h-3.5', isSyncingGarmin && 'animate-spin')}
                  />
                  <span>Jetzt abrufen</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectGarmin}
                  title="Garmin trennen"
                  aria-label="Garmin trennen"
                  className="inline-flex items-center justify-center p-2 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-rose-400 transition-colors min-h-[38px] min-w-[38px]"
                >
                  <Unlink className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnectGarmin}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-semibold transition-colors min-h-[38px]"
              >
                <Link2 className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  {providerStatus?.garmin.configured
                    ? 'Mit Garmin verbinden'
                    : 'Garmin einrichten'}
                </span>
              </button>
            )}
          </div>
        </div>

        {providerBackendError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 leading-relaxed">
            {providerBackendError}
          </div>
        )}

        {garminLastSyncAt && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-3.5 py-2.5 text-[11px] text-neutral-400 leading-relaxed">
            <span className="text-neutral-200 font-semibold">
              Letzter Watch-Sync in Garmin Connect:{' '}
              {format(new Date(garminLastSyncAt), 'dd.MM., HH:mm', { locale: de })} Uhr.
            </span>{' '}
            {Date.now() - garminLastSyncAt > 15 * 60_000 && (
              <span>
                Falls deine Garmin Watch aktuell mehr Schritte anzeigt, öffne kurz die Garmin Connect
                App auf deinem Handy, damit die Uhr die aktuellen Schritte in dein Garmin-Konto
                hochlädt, und rufe danach hier erneut ab.
              </span>
            )}
          </div>
        )}

        {/* Setup instructions if Garmin Personal API Key is not yet configured */}
        {showSetupGuide && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-amber-300">
                Garmin Connect Personal API einrichten
              </span>
              <button
                type="button"
                onClick={() => setShowSetupGuide(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-neutral-300 leading-relaxed">
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Öffne in <strong>Garmin Connect Web</strong> unter{' '}
                  <strong>Profil &amp; Konto &rarr; Einstellungen &rarr; Personal API Key</strong>{' '}
                  den Bereich für deinen persönlichen Schlüssel und klicke auf{' '}
                  <strong>Schlüssel erstellen</strong>.
                </li>
                <li>
                  Kopiere den einmalig angezeigten Schlüssel und hinterlege ihn in den AI Studio{' '}
                  <strong>Settings &gt; Secrets</strong> unter dem Namen{' '}
                  <code className="text-amber-300 font-semibold">GARMIN_PERSONAL_API_KEY</code>.
                </li>
                <li>
                  Lade die App neu &ndash; Garmin Connect synchronisiert dann Schlaf, HRV, Body
                  Battery, Puls, Schritte und Workouts direkt.
                </li>
              </ol>
              {(() => {
                const activeCallbackUrl =
                  setupCallbackUrl ||
                  providerStatus?.garmin.callbackUrl ||
                  `${window.location.origin}/api/health/garmin/callback`;
                return (
                  <div className="pt-1 border-t border-neutral-800/80 space-y-1.5">
                    <span className="block text-[11px] text-neutral-400">
                      Optional (nur für OAuth 2.0 PKCE mit GARMIN_CLIENT_ID / GARMIN_CLIENT_SECRET):
                    </span>
                    <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5">
                      <code className="text-xs text-neutral-300 truncate flex-1">
                        {activeCallbackUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyCallbackUrl(activeCallbackUrl)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Kopieren</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Sichtbare Kennzahlen (User Configuration for all 24 metrics) */}
      {(() => {
        const visibleSet = getVisibleHealthMetricsSet(settings?.visibleHealthMetrics);
        const handleUpdateVisible = (next: HealthMetricKey[]) => {
          updateSettings({ visibleHealthMetrics: next });
        };

        return (
          <>
            <div className="pt-4 border-t border-neutral-800 space-y-3">
              <button
                type="button"
                onClick={() => setShowMetricsSection((prev) => !prev)}
                aria-expanded={showMetricsSection}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-3 text-left hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Eye className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">
                      Angezeigte Health-Kennzahlen ({visibleSet.size}/24)
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      Wähle aus, welche Garmin Connect Messwerte sichtbar sind
                    </div>
                  </div>
                </div>
                {showMetricsSection ? (
                  <ChevronUp className="w-4 h-4 text-neutral-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                )}
              </button>

              {showMetricsSection && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-3.5 sm:p-4">
                  <HealthMetricsPicker
                    visibleMetrics={settings?.visibleHealthMetrics}
                    onChange={handleUpdateVisible}
                    currentRecord={todayRecord}
                    historyRecords={healthRecords}
                  />
                </div>
              )}
            </div>

            {/* Synced Health History Preview */}
            <div className="pt-4 border-t border-neutral-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  Synchronisierte Garmin-Historie (letzte 14 Tage)
                </span>
                <span className="text-neutral-500 tabular-nums">
                  {healthRecords.length} {healthRecords.length === 1 ? 'Tag' : 'Tage'} gespeichert
                </span>
              </div>

              {healthRecords.length === 0 ? (
                <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-3.5 text-xs text-neutral-400">
                  Noch keine historischen Tagesdaten vorhanden. Verbinde Garmin Connect und klicke
                  auf „Jetzt abrufen“, um die letzten 14 Tage zu importieren.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto pr-1 space-y-1.5">
                  {[...healthRecords]
                    .filter((rec) => safeDate(rec.date) !== null)
                    .sort((a, b) => (b.date || 0) - (a.date || 0))
                    .slice(0, 14)
                    .map((rec) => {
                      const dateObj = safeDate(rec.date)!;
                      const label = isToday(dateObj)
                        ? 'Heute'
                        : isYesterday(dateObj)
                        ? 'Gestern'
                        : format(dateObj, 'EEE, dd.MM.', { locale: de });
                      const recSources = Array.isArray(rec.sources) ? rec.sources : [];
                      const enabledValues = HEALTH_METRICS_CATALOG.filter(
                        (m) =>
                          m.key !== 'recoveryScore' &&
                          visibleSet.has(m.key) &&
                          hasHealthMetricValue(m.key, rec)
                      );

                      return (
                        <div
                          key={rec.id}
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 space-y-1.5 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-semibold text-white">{label}</span>
                              <span className="text-neutral-500 text-[11px] ml-2">
                                {recSources.length > 0
                                  ? SOURCE_LABELS[recSources[0]] || 'Garmin Connect'
                                  : 'Garmin Connect'}
                              </span>
                            </div>
                            {visibleSet.has('recoveryScore') && (
                              <span className="font-mono font-bold text-amber-400 tabular-nums">
                                {rec.recoveryScore}/100
                              </span>
                            )}
                          </div>

                          {enabledValues.length > 0 && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-[11px] text-neutral-300">
                              {enabledValues.map((m) => {
                                const val = formatHealthMetricValue(m.key, rec);
                                if (!val) return null;
                                return (
                                  <span key={m.key}>
                                    <span className="text-neutral-500">{m.shortLabel}: </span>
                                    <span className="font-medium text-neutral-200">{val}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}
