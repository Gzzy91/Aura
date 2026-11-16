import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Activity,
  BatteryCharging,
  Bluetooth,
  Check,
  ChevronDown,
  FileUp,
  HeartPulse,
  Moon,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Watch,
  X,
} from 'lucide-react';
import { format, isSameDay, startOfDay } from 'date-fns';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { cn, SKILL_COLORS } from '@/lib/utils';
import {
  buildTodayHealthRecord,
  calculateRecoveryMetrics,
  connectBrowserIdleDetector,
  connectWebBluetoothHeartRate,
  detectBrowserHealthCapabilities,
  formatMinutesAsHoursMinutes,
  generateEnergyRecoveryQuests,
  loadBrowserTelemetry,
  parseHealthExportFile,
  startMotionActivityTracker,
} from '@/services/healthSyncService';
import { EnergyRecoverySuggestion, HealthDataSource, RecoveryState } from '@/types';

const SOURCE_LABELS: Record<HealthDataSource, string> = {
  browser_idle: 'Browser-Ruhezeit',
  device_motion: 'Bewegungssensor',
  web_bluetooth: 'Bluetooth-Sensor',
  health_export: 'Health-Export',
  aura_activity: 'Aura Aktivität',
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
}: {
  onNavigateToQuests?: () => void;
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
  const [showSources, setShowSources] = useState(false);

  // Active browser sensor handles
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

  // Compute live preview record combining stored record + today's Aura load + browser telemetry
  const todayRecord = useMemo(() => {
    return buildTodayHealthRecord({
      existingRecord: storedTodayRecord,
      focusSessions,
      quests,
      diaryEntries,
    });
  }, [storedTodayRecord, focusSessions, quests, diaryEntries]);

  // Manual calibration input fields
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

  useEffect(() => {
    return () => {
      idleStopRef.current?.();
      motionStopRef.current?.();
      bleDisconnectRef.current?.();
    };
  }, []);

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
      const freshRecord = buildTodayHealthRecord({
        existingRecord: storedTodayRecord,
        focusSessions,
        quests,
        diaryEntries,
      });
      await saveHealthRecord(freshRecord);
      toast.success(
        `Gesundheitsdaten synchronisiert · Recovery-Score: ${freshRecord.recoveryScore}/100`
      );
    } catch (error) {
      console.error('Health sync error:', error);
      toast.error('Synchronisierung fehlgeschlagen.');
    } finally {
      setIsSyncing(false);
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
      await handleSyncNow();
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
      await handleSyncNow();
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
          sources: Array.from(
            new Set<HealthDataSource>([...(existing?.sources || []), 'health_export'])
          ),
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
        // Fallback to hidden file input if File System Access API is blocked in iframe
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

  const handleAcceptSuggestion = async (suggestion: EnergyRecoverySuggestion) => {
    // Ensure today's record exists in store before marking accepted
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
    <div className="bg-neutral-900 p-5 sm:p-6 rounded-2xl border border-neutral-800 h-full flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-white">
            <HeartPulse className="w-5 h-5 text-amber-500 shrink-0" />
            <span>Energie & Erholung</span>
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Browser-Health-Sync für Schlaf & Aktivitätsdauer · personalisierte Recovery-Quests
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowSources((prev) => !prev)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap min-h-[38px]',
              showSources
                ? 'bg-neutral-800 border-neutral-700 text-white'
                : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:text-white'
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Quellen</span>
            <ChevronDown
              className={cn('w-3.5 h-3.5 transition-transform', showSources && 'rotate-180')}
            />
          </button>

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
            {telemetry.overnightRestGapMinutes > 0
              ? 'Browser-Ruhefenster erkannt'
              : 'Import oder Kalibrierung'}
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
            {liveBpm
              ? `Live: ${liveBpm} BPM`
              : todayRecord.avgHeartRate
              ? `Ø ${todayRecord.avgHeartRate} BPM`
              : `Fokus heute: ${todayFocusMinutes} Min`}
          </div>
        </div>
      </div>

      {/* Connected Sources & Sync Controls Drawer */}
      {showSources && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-neutral-300">
              Browser-Health-APIs & Datenquellen
            </span>
            <span className="text-neutral-500">
              Aktiv: {todayRecord.sources.map((s) => SOURCE_LABELS[s]).join(' · ')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* IdleDetector API */}
            <button
              type="button"
              onClick={handleToggleIdleDetector}
              disabled={!capabilities.idleDetector}
              className={cn(
                'flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors min-h-[44px]',
                !capabilities.idleDetector
                  ? 'bg-neutral-900/50 border-neutral-800/60 text-neutral-600 cursor-not-allowed'
                  : idleActive
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
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
              <span className="text-[11px] font-bold shrink-0">
                {!capabilities.idleDetector ? 'N/V' : idleActive ? 'Stopp' : 'Start'}
              </span>
            </button>

            {/* DeviceMotion / Accelerometer API */}
            <button
              type="button"
              onClick={handleToggleMotion}
              disabled={!capabilities.deviceMotion}
              className={cn(
                'flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors min-h-[44px]',
                !capabilities.deviceMotion
                  ? 'bg-neutral-900/50 border-neutral-800/60 text-neutral-600 cursor-not-allowed'
                  : motionActive
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
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
              <span className="text-[11px] font-bold shrink-0">
                {!capabilities.deviceMotion ? 'N/V' : motionActive ? 'Stopp' : 'Start'}
              </span>
            </button>

            {/* Web Bluetooth Heart Rate / Fitness */}
            <button
              type="button"
              onClick={handleToggleBluetooth}
              disabled={!capabilities.webBluetooth}
              className={cn(
                'flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors min-h-[44px]',
                !capabilities.webBluetooth
                  ? 'bg-neutral-900/50 border-neutral-800/60 text-neutral-600 cursor-not-allowed'
                  : bleDeviceName
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
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
              <span className="text-[11px] font-bold shrink-0">
                {!capabilities.webBluetooth ? 'N/V' : bleDeviceName ? 'Trennen' : 'Koppeln'}
              </span>
            </button>

            {/* File System Access / Health Export */}
            <button
              type="button"
              onClick={handleImportExport}
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700 text-left transition-colors min-h-[44px]"
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
                  processImportedFile(file);
                  e.target.value = '';
                }
              }}
            />
          </div>

          {/* Direct Sleep & Activity Calibration */}
          <form
            onSubmit={handleSaveCalibration}
            className="pt-3 border-t border-neutral-800/80 flex flex-wrap items-end gap-2.5"
          >
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">Schlaf (Std)</label>
              <input
                type="number"
                min={0}
                max={24}
                value={sleepHoursInput}
                onChange={(e) => setSleepHoursInput(e.target.value)}
                className="w-16 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">Schlaf (Min)</label>
              <input
                type="number"
                min={0}
                max={59}
                value={sleepMinutesInput}
                onChange={(e) => setSleepMinutesInput(e.target.value)}
                className="w-16 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">Aktivität (Min)</label>
              <input
                type="number"
                min={0}
                max={1440}
                value={activityMinutesInput}
                onChange={(e) => setActivityMinutesInput(e.target.value)}
                className="w-20 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white tabular-nums focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold transition-colors min-h-[34px] whitespace-nowrap"
            >
              Werte übernehmen
            </button>
          </form>
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
