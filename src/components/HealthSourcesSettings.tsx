import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Activity,
  Bluetooth,
  Calendar,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  FileUp,
  HeartPulse,
  Link2,
  Moon,
  RefreshCw,
  Smartphone,
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
  GoogleHealthApiMode,
  HEALTH_METRICS_CATALOG,
  HealthProvidersStatus,
  ProviderNotConfiguredError,
  RemoteHealthDayMetric,
  buildTodayHealthRecord,
  calculateRecoveryMetrics,
  connectBrowserIdleDetector,
  connectWebBluetoothHeartRate,
  detectBrowserHealthCapabilities,
  disconnectHealthProvider,
  fetchHealthProvidersStatus,
  formatHealthMetricValue,
  getHealthSessionToken,
  getVisibleHealthMetricsSet,
  hasHealthMetricValue,
  loadBrowserTelemetry,
  openHealthProviderOAuthPopup,
  parseHealthExportFile,
  setHealthSessionToken,
  startMotionActivityTracker,
  syncHealthProvider,
} from '@/services/healthSyncService';
import { HealthDataSource, HealthMetricKey } from '@/types';
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

export function HealthSourcesSettings() {
  const {
    quests,
    diaryEntries,
    focusSessions,
    healthRecords,
    settings,
    updateSettings,
    saveHealthRecord,
  } = useStore();

  const [showMetricsSection, setShowMetricsSection] = useState(false);

  const [providerStatus, setProviderStatus] = useState<HealthProvidersStatus | null>(null);
  const [providerBackendError, setProviderBackendError] = useState<string | null>(null);
  const [googleApiMode, setGoogleApiMode] = useState<GoogleHealthApiMode>('google_health');
  const [syncingProvider, setSyncingProvider] = useState<'garmin' | 'google' | null>(null);
  const [setupGuideProvider, setSetupGuideProvider] = useState<'garmin' | 'google' | null>(null);
  const [setupCallbackUrl, setSetupCallbackUrl] = useState<string>('');

  const [idleActive, setIdleActive] = useState(false);
  const [motionActive, setMotionActive] = useState(false);
  const [bleDeviceName, setBleDeviceName] = useState<string | null>(null);
  const [liveBpm, setLiveBpm] = useState<number | null>(null);

  const idleStopRef = useRef<(() => void) | null>(null);
  const motionStopRef = useRef<(() => void) | null>(null);
  const bleDisconnectRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const capabilities = useMemo(() => detectBrowserHealthCapabilities(), []);
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

  const [sleepHoursInput, setSleepHoursInput] = useState(() =>
    String(Math.floor(todayRecord.sleepDurationMinutes / 60))
  );
  const [sleepMinutesInput, setSleepMinutesInput] = useState(() =>
    String(todayRecord.sleepDurationMinutes % 60)
  );
  const [activityMinutesInput, setActivityMinutesInput] = useState(() =>
    String(todayRecord.activityDurationMinutes)
  );

  useEffect(() => {
    setSleepHoursInput(String(Math.floor(todayRecord.sleepDurationMinutes / 60)));
    setSleepMinutesInput(String(todayRecord.sleepDurationMinutes % 60));
    setActivityMinutesInput(String(todayRecord.activityDurationMinutes));
  }, [todayRecord.sleepDurationMinutes, todayRecord.activityDurationMinutes]);

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
        google: {
          ...status.google,
          connected: status.google.connected || Boolean(getHealthSessionToken('google')),
        },
      });
      if (status.google.apiMode) {
        setGoogleApiMode(status.google.apiMode);
      }
    } catch (error: unknown) {
      setProviderBackendError(
        error instanceof Error
          ? error.message
          : 'Health-Backend ist unter dieser Live-URL aktuell nicht erreichbar.'
      );
    }
  }, []);

  useEffect(() => {
    void refreshProviderStatus();
    return () => {
      idleStopRef.current?.();
      motionStopRef.current?.();
      bleDisconnectRef.current?.();
    };
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
        const [y, m, d] = day.dateKey.split('-').map(Number);
        const dayDate = new Date(y, m - 1, d, 12, 0, 0);
        const existing = useStore.getState().healthRecords.find((r) => r.id === day.dateKey);
        const dayMood =
          state.diaryEntries.find((e) => isSameDay(new Date(e.date), dayDate))?.mood ?? null;

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

  const handleSyncProvider = useCallback(
    async (provider: 'garmin' | 'google', silent = false) => {
      setSyncingProvider(provider);
      try {
        const res = await syncHealthProvider(provider);
        const count = await persistRemoteDays(res.provider, res.days);
        const label = provider === 'garmin' ? 'Garmin Connect' : 'Google Health';
        if (!silent) {
          toast.success(
            count > 0
              ? `${label}: ${count} ${count === 1 ? 'Tag' : 'Tage'} direkt synchronisiert`
              : `${label} verbunden – aktuell noch keine neuen Tageswerte im Zeitraum`
          );
        }
        return count;
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : 'Synchronisierung mit Health-Anbieter fehlgeschlagen.';
        if (!silent) {
          toast.error(msg);
        }
        void refreshProviderStatus();
        return -1;
      } finally {
        setSyncingProvider(null);
      }
    },
    [persistRemoteDays, refreshProviderStatus]
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
            provider?: 'garmin' | 'google';
            sessionToken?: string;
            apiMode?: GoogleHealthApiMode;
            connectedAt?: number;
            message?: string;
          }
        | undefined;

      if (!data?.type || !data.provider) return;

      if (data.type === 'HEALTH_OAUTH_ERROR') {
        toast.error(data.message || 'Anmeldung beim Gesundheitsdienst fehlgeschlagen.');
        return;
      }

      if (data.type === 'HEALTH_OAUTH_SUCCESS' && data.sessionToken) {
        setHealthSessionToken(data.provider, data.sessionToken);
        if (data.provider === 'google' && data.apiMode) {
          setGoogleApiMode(data.apiMode);
        }
        setSetupGuideProvider(null);
        setProviderStatus((prev) =>
          prev
            ? {
                ...prev,
                [data.provider!]: {
                  ...prev[data.provider!],
                  connected: true,
                  connectedAt: data.connectedAt || Date.now(),
                  ...(data.provider === 'google' && data.apiMode ? { apiMode: data.apiMode } : {}),
                },
              }
            : prev
        );
        void handleSyncProvider(data.provider);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [handleSyncProvider]);

  const handleConnectProvider = async (provider: 'garmin' | 'google') => {
    try {
      await openHealthProviderOAuthPopup(provider, googleApiMode);
    } catch (error: unknown) {
      if (error instanceof ProviderNotConfiguredError) {
        setSetupGuideProvider(provider);
        setSetupCallbackUrl(error.callbackUrl);
        toast.info(error.message);
        return;
      }
      const msg = error instanceof Error ? error.message : 'Verbindung konnte nicht gestartet werden.';
      toast.error(msg);
    }
  };

  const handleDisconnectProvider = async (provider: 'garmin' | 'google') => {
    try {
      await disconnectHealthProvider(provider);
      await refreshProviderStatus();
      toast.info(`${provider === 'garmin' ? 'Garmin Connect' : 'Google Health'} getrennt`);
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

  const handleToggleIdleDetector = async () => {
    if (idleActive) {
      idleStopRef.current?.();
      idleStopRef.current = null;
      setIdleActive(false);
      toast.info('IdleDetector gestoppt');
      return;
    }

    try {
      const handle = await connectBrowserIdleDetector(async () => {
        const fresh = buildTodayHealthRecord({
          existingRecord: useStore.getState().healthRecords.find((r) => r.id === todayKey),
          focusSessions: useStore.getState().focusSessions,
          quests: useStore.getState().quests,
          diaryEntries: useStore.getState().diaryEntries,
          extraSources: ['browser_idle'],
        });
        await saveHealthRecord(fresh);
      });
      idleStopRef.current = handle.stop;
      setIdleActive(true);
      toast.success('Browser IdleDetector verbunden');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'IdleDetector nicht verfügbar';
      toast.error(msg);
    }
  };

  const handleToggleMotion = async () => {
    if (motionActive) {
      motionStopRef.current?.();
      motionStopRef.current = null;
      setMotionActive(false);
      toast.info('Bewegungssensor gestoppt');
      return;
    }

    try {
      const handle = await startMotionActivityTracker(async () => {
        const fresh = buildTodayHealthRecord({
          existingRecord: useStore.getState().healthRecords.find((r) => r.id === todayKey),
          focusSessions: useStore.getState().focusSessions,
          quests: useStore.getState().quests,
          diaryEntries: useStore.getState().diaryEntries,
          extraSources: ['device_motion'],
        });
        await saveHealthRecord(fresh);
      });
      motionStopRef.current = handle.stop;
      setMotionActive(true);
      toast.success('Bewegungssensor-Sync aktiv');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Bewegungssensor nicht verfügbar';
      toast.error(msg);
    }
  };

  const handleToggleBluetooth = async () => {
    if (bleDeviceName) {
      bleDisconnectRef.current?.();
      bleDisconnectRef.current = null;
      setBleDeviceName(null);
      setLiveBpm(null);
      toast.info('Bluetooth-Pulsmesser getrennt');
      return;
    }

    try {
      const handle = await connectWebBluetoothHeartRate(async (sample) => {
        setLiveBpm(sample.bpm);
        const fresh = buildTodayHealthRecord({
          existingRecord: useStore.getState().healthRecords.find((r) => r.id === todayKey),
          focusSessions: useStore.getState().focusSessions,
          quests: useStore.getState().quests,
          diaryEntries: useStore.getState().diaryEntries,
          extraSources: ['web_bluetooth'],
        });
        await saveHealthRecord(fresh);
      });
      bleDisconnectRef.current = handle.disconnect;
      setBleDeviceName(handle.deviceName);
      toast.success(`Verbunden mit ${handle.deviceName}`);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Bluetooth-Verbindung abgebrochen';
      if (!msg.toLowerCase().includes('cancelled') && !msg.toLowerCase().includes('abgebrochen')) {
        toast.error(msg);
      }
    }
  };

  const processImportedFile = async (file: File) => {
    try {
      const parsedDays = await parseHealthExportFile(file);
      if (parsedDays.length === 0) {
        toast.error('Keine Schlaf- oder Aktivitätsdaten in dieser Datei erkannt.');
        return;
      }

      const recentDays = parsedDays.slice(0, 14);
      for (const day of recentDays) {
        const [y, m, d] = day.dateKey.split('-').map(Number);
        const dayDate = new Date(y, m - 1, d, 12, 0, 0);
        const existing = healthRecords.find((r) => r.id === day.dateKey);
        const dayMood =
          diaryEntries.find((e) => isSameDay(new Date(e.date), dayDate))?.mood ?? null;

        const sleepMin = day.sleepDurationMinutes || existing?.sleepDurationMinutes || 0;
        const activityMin = day.activityDurationMinutes || existing?.activityDurationMinutes || 0;
        const { recoveryScore, recoveryState } = calculateRecoveryMetrics({
          sleepDurationMinutes: sleepMin,
          activityDurationMinutes: activityMin,
          avgHeartRate: existing?.avgHeartRate ?? null,
          todayMood: dayMood,
        });

        await saveHealthRecord({
          id: day.dateKey,
          date: startOfDay(dayDate).getTime(),
          sleepDurationMinutes: sleepMin,
          activityDurationMinutes: activityMin,
          avgHeartRate: existing?.avgHeartRate ?? null,
          sleepDeepMinutes: existing?.sleepDeepMinutes ?? null,
          sleepLightMinutes: existing?.sleepLightMinutes ?? null,
          sleepRemMinutes: existing?.sleepRemMinutes ?? null,
          sleepAwakeMinutes: existing?.sleepAwakeMinutes ?? null,
          steps: existing?.steps ?? null,
          distanceMeters: existing?.distanceMeters ?? null,
          caloriesActive: existing?.caloriesActive ?? null,
          floorsClimbed: existing?.floorsClimbed ?? null,
          heartPoints: existing?.heartPoints ?? null,
          workoutsCount: existing?.workoutsCount ?? null,
          restingHeartRate: existing?.restingHeartRate ?? null,
          hrvMs: existing?.hrvMs ?? null,
          stressLevel: existing?.stressLevel ?? null,
          bodyBattery: existing?.bodyBattery ?? null,
          spo2Percent: existing?.spo2Percent ?? null,
          respirationRate: existing?.respirationRate ?? null,
          vo2Max: existing?.vo2Max ?? null,
          weightKg: existing?.weightKg ?? null,
          bodyFatPercent: existing?.bodyFatPercent ?? null,
          hydrationMl: existing?.hydrationMl ?? null,
          sources: Array.from(
            new Set<HealthDataSource>([...(existing?.sources || []), 'health_export'])
          ).slice(0, 8),
          recoveryScore,
          recoveryState,
          acceptedSuggestionIds: existing?.acceptedSuggestionIds || [],
          dismissedSuggestionIds: existing?.dismissedSuggestionIds || [],
          syncedAt: Date.now(),
        });
      }

      toast.success(
        `${recentDays.length} ${recentDays.length === 1 ? 'Tag' : 'Tage'} aus Health-Export importiert`
      );
    } catch (error) {
      console.error('Import health export failed:', error);
      toast.error('Health-Datei konnte nicht gelesen werden.');
    }
  };

  const handleImportExport = async () => {
    if (capabilities.fileSystemAccess) {
      try {
        const picker = (
          window as unknown as {
            showOpenFilePicker: (opts: unknown) => Promise<{ getFile: () => Promise<File> }[]>;
          }
        ).showOpenFilePicker;
        const [handle] = await picker({
          multiple: false,
          types: [
            {
              description: 'Health Export (Apple XML, Google Fit JSON, CSV)',
              accept: {
                'text/xml': ['.xml'],
                'application/json': ['.json'],
                'text/csv': ['.csv'],
              },
            },
          ],
        });
        if (handle) {
          const file = await handle.getFile();
          await processImportedFile(file);
        }
        return;
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    fileInputRef.current?.click();
  };

  const handleSaveCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    const hrs = Math.max(0, Math.min(24, parseInt(sleepHoursInput, 10) || 0));
    const mins = Math.max(0, Math.min(59, parseInt(sleepMinutesInput, 10) || 0));
    const totalSleep = Math.min(1440, hrs * 60 + mins);
    const totalActivity = Math.max(
      0,
      Math.min(1440, parseInt(activityMinutesInput, 10) || 0)
    );

    const record = buildTodayHealthRecord({
      existingRecord: storedTodayRecord,
      focusSessions,
      quests,
      diaryEntries,
      overrideSleepMinutes: totalSleep,
      overrideActivityMinutes: totalActivity,
      extraSources: ['manual'],
    });
    await saveHealthRecord(record);
    toast.success('Schlaf- & Aktivitätsdauer gespeichert');
  };

  const telemetry = loadBrowserTelemetry();

  return (
    <div className="space-y-5">
      {/* Direct Cloud Health Providers (Garmin Connect & Google Health) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-neutral-200">
            Direkte Cloud-Konten (Garmin Connect &amp; Google Health)
          </span>
          <span className="text-neutral-400">
            Aktive Quellen:{' '}
            {todayRecord.sources
              .filter((s) => s !== 'browser_idle' || todayRecord.sources.length === 1)
              .map((s) => SOURCE_LABELS[s])
              .join(' · ')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Garmin Connect */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Watch className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">Garmin Connect</div>
                  <div className="text-xs text-neutral-400 truncate">
                    {providerStatus?.garmin.connected
                      ? 'Verbunden · Dailies & Schlaf'
                      : providerStatus?.backendAvailable === false
                      ? 'Node-Server erforderlich'
                      : providerStatus?.garmin.configured
                      ? 'OAuth 2.0 PKCE bereit'
                      : 'OAuth-Secrets erforderlich'}
                  </div>
                </div>
              </div>
              {providerStatus?.garmin.connected && (
                <span className="text-[11px] font-bold text-emerald-400 shrink-0">Aktiv</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {providerStatus?.garmin.connected ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSyncProvider('garmin')}
                    disabled={syncingProvider === 'garmin'}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-neutral-950 text-xs font-bold transition-colors disabled:opacity-60 min-h-[38px]"
                  >
                    <RefreshCw
                      className={cn(
                        'w-3.5 h-3.5',
                        syncingProvider === 'garmin' && 'animate-spin'
                      )}
                    />
                    <span>Jetzt abrufen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnectProvider('garmin')}
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
                  onClick={() => handleConnectProvider('garmin')}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-semibold transition-colors min-h-[38px]"
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

          {/* Google Health / Google Fit */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <HeartPulse className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">Google Health</div>
                  <div className="text-xs text-neutral-400 truncate">
                    {providerStatus?.google.connected
                      ? `Verbunden (${
                          providerStatus.google.apiMode === 'google_fit'
                            ? 'Google Fit'
                            : 'Health API v4'
                        })`
                      : providerStatus?.backendAvailable === false
                      ? 'Direkter Google-OAuth bereit'
                      : providerStatus?.google.configured
                      ? 'OAuth 2.0 Direktabruf'
                      : 'OAuth-Secrets erforderlich'}
                  </div>
                </div>
              </div>
              {!providerStatus?.google.connected && (
                <select
                  aria-label="Google Health API-Modus"
                  value={googleApiMode}
                  onChange={(e) => setGoogleApiMode(e.target.value as GoogleHealthApiMode)}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="google_health">Health v4</option>
                  <option value="google_fit">Google Fit</option>
                </select>
              )}
              {providerStatus?.google.connected && (
                <span className="text-[11px] font-bold text-emerald-400 shrink-0">Aktiv</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {providerStatus?.google.connected ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSyncProvider('google')}
                    disabled={syncingProvider === 'google'}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold transition-colors disabled:opacity-60 min-h-[38px]"
                  >
                    <RefreshCw
                      className={cn(
                        'w-3.5 h-3.5',
                        syncingProvider === 'google' && 'animate-spin'
                      )}
                    />
                    <span>Jetzt abrufen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnectProvider('google')}
                    title="Google Health trennen"
                    aria-label="Google Health trennen"
                    className="inline-flex items-center justify-center p-2 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-rose-400 transition-colors min-h-[38px] min-w-[38px]"
                  >
                    <Unlink className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConnectProvider('google')}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-semibold transition-colors min-h-[38px]"
                >
                  <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {providerStatus?.google.configured
                      ? 'Mit Google Health verbinden'
                      : 'Google Health einrichten'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {providerBackendError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 leading-relaxed">
            {providerBackendError}
          </div>
        )}

        {/* Setup instructions if OAuth credentials are not yet configured in Settings > Secrets */}
        {setupGuideProvider && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-amber-300">
                {setupGuideProvider === 'garmin'
                  ? 'Garmin Connect OAuth einrichten'
                  : 'Google Health / Fit OAuth einrichten'}
              </span>
              <button
                type="button"
                onClick={() => setSetupGuideProvider(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              {setupGuideProvider === 'garmin'
                ? 'Hinterlege GARMIN_CLIENT_ID und GARMIN_CLIENT_SECRET in den AI Studio Secrets und trage diese Redirect-URI im Garmin Developer Portal ein:'
                : 'Hinterlege GOOGLE_HEALTH_CLIENT_ID und GOOGLE_HEALTH_CLIENT_SECRET in den AI Studio Secrets und trage diese Redirect-URI in der Google Cloud Console ein:'}
            </p>
            {(() => {
              const activeCallbackUrl =
                setupCallbackUrl ||
                (setupGuideProvider === 'garmin'
                  ? providerStatus?.garmin.callbackUrl
                  : providerStatus?.google.callbackUrl) ||
                `${window.location.origin}/api/health/${setupGuideProvider}/callback`;
              return (
                <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5">
                  <code className="text-xs text-neutral-200 truncate flex-1">
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
              );
            })()}
          </div>
        )}
      </div>

      {/* Browser Sensors & Export Import */}
      <div className="pt-4 border-t border-neutral-800 space-y-3">
        <span className="block text-xs font-semibold text-neutral-300">
          Browser-Sensoren &amp; Datei-Import
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleToggleIdleDetector}
            disabled={!capabilities.idleDetector}
            className={cn(
              'flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl border text-left transition-colors min-h-[48px]',
              !capabilities.idleDetector
                ? 'bg-neutral-950/50 border-neutral-800/60 text-neutral-600 cursor-not-allowed'
                : idleActive
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Moon className="w-4 h-4 shrink-0 text-indigo-400" />
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">IdleDetector API</div>
                <div className="text-[11px] text-neutral-500 truncate">
                  {!capabilities.idleDetector
                    ? 'Passives Ruhefenster aktiv'
                    : idleActive
                    ? 'Verbunden (aktiv)'
                    : 'Ruhe- & Schlafphasen messen'}
                </div>
              </div>
            </div>
            <span className="text-xs font-bold shrink-0">
              {!capabilities.idleDetector ? 'N/V' : idleActive ? 'Stopp' : 'Start'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleMotion}
            disabled={!capabilities.deviceMotion}
            className={cn(
              'flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl border text-left transition-colors min-h-[48px]',
              !capabilities.deviceMotion
                ? 'bg-neutral-950/50 border-neutral-800/60 text-neutral-600 cursor-not-allowed'
                : motionActive
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Smartphone className="w-4 h-4 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">Bewegungssensor</div>
                <div className="text-[11px] text-neutral-500 truncate tabular-nums">
                  {motionActive
                    ? `Live aktiv (${Math.round(telemetry.motionActiveMinutes)} Min)`
                    : 'DeviceMotion Aktivitätszeit'}
                </div>
              </div>
            </div>
            <span className="text-xs font-bold shrink-0">
              {!capabilities.deviceMotion ? 'N/V' : motionActive ? 'Stopp' : 'Start'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleBluetooth}
            disabled={!capabilities.webBluetooth}
            className={cn(
              'flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl border text-left transition-colors min-h-[48px]',
              !capabilities.webBluetooth
                ? 'bg-neutral-950/50 border-neutral-800/60 text-neutral-600 cursor-not-allowed'
                : bleDeviceName
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Bluetooth className="w-4 h-4 shrink-0 text-sky-400" />
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">
                  {bleDeviceName || 'Web Bluetooth Pulsmesser'}
                </div>
                <div className="text-[11px] text-neutral-500 truncate tabular-nums">
                  {bleDeviceName
                    ? liveBpm
                      ? `${liveBpm} BPM · verbunden`
                      : 'Warte auf Messwerte...'
                    : capabilities.webBluetooth
                    ? 'Wearable / Brustgurt koppeln'
                    : 'Vom Browser nicht unterstützt'}
                </div>
              </div>
            </div>
            <span className="text-xs font-bold shrink-0">
              {!capabilities.webBluetooth ? 'N/V' : bleDeviceName ? 'Trennen' : 'Koppeln'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleImportExport}
            className="flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl border bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700 text-left transition-colors min-h-[48px]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FileUp className="w-4 h-4 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">Health-Export importieren</div>
                <div className="text-[11px] text-neutral-500 truncate">
                  Apple Health XML, Google Fit JSON, CSV
                </div>
              </div>
            </div>
            <Watch className="w-4 h-4 text-neutral-500 shrink-0" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.json,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void processImportedFile(file);
                e.target.value = '';
              }
            }}
          />
        </div>
      </div>

      {/* Direct Sleep & Activity Calibration */}
      <form
        onSubmit={handleSaveCalibration}
        className="pt-4 border-t border-neutral-800 flex flex-wrap items-end gap-3"
      >
        <div>
          <label className="block text-xs text-neutral-400 mb-1">Schlaf (Std)</label>
          <input
            type="number"
            min={0}
            max={24}
            value={sleepHoursInput}
            onChange={(e) => setSleepHoursInput(e.target.value)}
            className="w-20 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1">Schlaf (Min)</label>
          <input
            type="number"
            min={0}
            max={59}
            value={sleepMinutesInput}
            onChange={(e) => setSleepMinutesInput(e.target.value)}
            className="w-20 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1">Aktivität (Min)</label>
          <input
            type="number"
            min={0}
            max={1440}
            value={activityMinutesInput}
            onChange={(e) => setActivityMinutesInput(e.target.value)}
            className="w-24 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white tabular-nums focus:outline-none focus:border-amber-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition-colors min-h-[36px] whitespace-nowrap"
        >
          Werte übernehmen
        </button>
      </form>

      {/* Sichtbare Kennzahlen (User Configuration for all 24 metrics) */}
      {(() => {
        const visibleSet = getVisibleHealthMetricsSet(settings.visibleHealthMetrics);
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
                      Wähle aus, welche Messwerte von Google Health &amp; Garmin sichtbar sind
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
                    visibleMetrics={settings.visibleHealthMetrics}
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
                  Synchronisierte Health-Historie (letzte 14 Tage)
                </span>
                <span className="text-neutral-500 tabular-nums">
                  {healthRecords.length} {healthRecords.length === 1 ? 'Tag' : 'Tage'} gespeichert
                </span>
              </div>

              {healthRecords.length === 0 ? (
                <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/60 p-3.5 text-xs text-neutral-400">
                  Noch keine historischen Tagesdaten vorhanden. Verbinde Google Health oder Garmin
                  und klicke auf „Jetzt abrufen“, um die letzten 14 Tage zu importieren.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto pr-1 space-y-1.5">
                  {[...healthRecords]
                    .sort((a, b) => b.date - a.date)
                    .slice(0, 14)
                    .map((rec) => {
                      const dateObj = new Date(rec.date);
                      const label = isToday(dateObj)
                        ? 'Heute'
                        : isYesterday(dateObj)
                        ? 'Gestern'
                        : format(dateObj, 'EEE, dd.MM.', { locale: de });
                      const visibleSources = rec.sources.filter(
                        (s) => s !== 'browser_idle' || rec.sources.length === 1
                      );
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
                                {visibleSources.map((s) => SOURCE_LABELS[s]).join(' · ')}
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
