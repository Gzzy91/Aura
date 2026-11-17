import {
  DiaryEntry,
  EnergyRecoverySuggestion,
  FocusSession,
  HealthDailyRecord,
  HealthDataSource,
  Quest,
  RecoveryState,
} from '@/types';
import { format, isSameDay, startOfDay } from 'date-fns';

const TELEMETRY_STORAGE_KEY = 'aura_health_telemetry_v1';

export interface BrowserHealthCapabilities {
  idleDetector: boolean;
  deviceMotion: boolean;
  requiresMotionPermission: boolean;
  webBluetooth: boolean;
  fileSystemAccess: boolean;
}

export interface BrowserTelemetryState {
  todayKey: string;
  lastActiveAt: number;
  firstActiveTodayAt: number;
  todayActiveBrowserMinutes: number;
  overnightRestGapMinutes: number;
  motionActiveMinutes: number;
  bleWorkoutMinutes: number;
  bleAvgHeartRate: number | null;
  bleLastDeviceName: string | null;
}

export interface ParsedHealthImportDay {
  dateKey: string; // YYYY-MM-DD
  sleepDurationMinutes: number;
  activityDurationMinutes: number;
}

export type GoogleHealthApiMode = 'google_health' | 'google_fit';

export interface HealthProvidersStatus {
  garmin: {
    configured: boolean;
    connected: boolean;
    callbackUrl: string;
    connectedAt: number | null;
  };
  google: {
    configured: boolean;
    connected: boolean;
    apiMode: GoogleHealthApiMode | null;
    callbackUrl: string;
    connectedAt: number | null;
  };
}

export interface RemoteHealthDayMetric {
  dateKey: string;
  sleepDurationMinutes: number;
  activityDurationMinutes: number;
  avgHeartRate: number | null;
}

export interface RemoteHealthSyncResult {
  provider: 'garmin_connect' | 'google_health';
  apiMode?: GoogleHealthApiMode;
  days: RemoteHealthDayMetric[];
  syncedAt: number;
}

// Strict in-memory token cache (never stored in localStorage/sessionStorage)
const inMemoryHealthSessions = new Map<'garmin' | 'google', string>();

export function setHealthSessionToken(provider: 'garmin' | 'google', token: string): void {
  inMemoryHealthSessions.set(provider, token);
}

export function getHealthSessionToken(provider: 'garmin' | 'google'): string | null {
  return inMemoryHealthSessions.get(provider) || null;
}

export function clearHealthSessionToken(provider: 'garmin' | 'google'): void {
  inMemoryHealthSessions.delete(provider);
}

export async function fetchHealthProvidersStatus(): Promise<HealthProvidersStatus> {
  const res = await fetch('/api/health/providers/status', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('Status der Health-Provider konnte nicht geladen werden.');
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Health-Backend unter dieser URL nicht erreichbar (kein JSON).');
  }
  return (await res.json()) as HealthProvidersStatus;
}

export class ProviderNotConfiguredError extends Error {
  callbackUrl: string;
  constructor(message: string, callbackUrl: string) {
    super(message);
    this.name = 'ProviderNotConfiguredError';
    this.callbackUrl = callbackUrl;
  }
}

export async function openHealthProviderOAuthPopup(
  provider: 'garmin' | 'google',
  googleApiMode: GoogleHealthApiMode = 'google_health'
): Promise<void> {
  const endpoint =
    provider === 'garmin'
      ? '/api/health/garmin/auth-url'
      : `/api/health/google/auth-url?api=${encodeURIComponent(googleApiMode)}`;

  const res = await fetch(endpoint, {
    credentials: 'include',
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();
  let data: {
    url?: string;
    error?: string;
    configured?: boolean;
    callbackUrl?: string;
  } = {};

  if (rawText.trim().startsWith('{')) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = {};
    }
  } else if (contentType.includes('text/html') || rawText.trim().startsWith('<')) {
    throw new Error(
      `OAuth-Endpunkt hat HTML statt JSON geliefert (HTTP ${res.status}). Bitte App neu laden oder die geteilte App neu veröffentlichen.`
    );
  }

  if (data.configured === false) {
    const fallbackCallback =
      data.callbackUrl || `${window.location.origin}/api/health/${provider}/callback`;
    throw new ProviderNotConfiguredError(
      data.error || 'OAuth-Zugangsdaten fehlen in den Server-Secrets.',
      fallbackCallback
    );
  }

  if (!res.ok || !data.url) {
    throw new Error(
      data.error ||
        `OAuth-Autorisierungs-URL konnte nicht erzeugt werden (HTTP ${res.status}).`
    );
  }

  const popup = window.open(
    data.url,
    `aura_${provider}_oauth`,
    'width=600,height=720,scrollbars=yes,resizable=yes'
  );

  if (!popup) {
    throw new Error(
      'Das Anmelde-Fenster wurde blockiert. Bitte erlaube Popups für diese Seite.'
    );
  }
}

export async function syncHealthProvider(
  provider: 'garmin' | 'google'
): Promise<RemoteHealthSyncResult> {
  const token = getHealthSessionToken(provider);
  const res = await fetch(`/api/health/${provider}/sync`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: token ? { 'x-health-session': token } : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();
  let data: Partial<RemoteHealthSyncResult> & { error?: string } = {};

  if (rawText.trim().startsWith('{')) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = {};
    }
  } else if (contentType.includes('text/html') || rawText.trim().startsWith('<')) {
    throw new Error(
      `Health-Sync hat HTML statt JSON geliefert (HTTP ${res.status}). Bitte App neu laden oder die geteilte App neu veröffentlichen.`
    );
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearHealthSessionToken(provider);
    }
    throw new Error(
      data.error ||
        `${provider === 'garmin' ? 'Garmin Connect' : 'Google Health'}-Sync fehlgeschlagen (HTTP ${res.status}).`
    );
  }

  if (!Array.isArray(data.days)) {
    throw new Error(
      data.error ||
        `${provider === 'garmin' ? 'Garmin Connect' : 'Google Health'}-Sync lieferte keine gültigen Tagesdaten.`
    );
  }

  return {
    provider: data.provider || (provider === 'garmin' ? 'garmin_connect' : 'google_health'),
    apiMode: data.apiMode,
    days: data.days,
    syncedAt: typeof data.syncedAt === 'number' ? data.syncedAt : Date.now(),
  };
}

export async function disconnectHealthProvider(provider: 'garmin' | 'google'): Promise<void> {
  const token = getHealthSessionToken(provider);
  clearHealthSessionToken(provider);
  await fetch(`/api/health/${provider}/disconnect`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { 'x-health-session': token } : undefined,
  });
}

export function detectBrowserHealthCapabilities(): BrowserHealthCapabilities {
  if (typeof window === 'undefined') {
    return {
      idleDetector: false,
      deviceMotion: false,
      requiresMotionPermission: false,
      webBluetooth: false,
      fileSystemAccess: false,
    };
  }

  const win = window as unknown as Record<string, unknown>;
  const nav = navigator as unknown as Record<string, unknown>;
  const dme = win.DeviceMotionEvent as { requestPermission?: () => Promise<string> } | undefined;

  return {
    idleDetector: 'IdleDetector' in window,
    deviceMotion: 'DeviceMotionEvent' in window || 'Accelerometer' in window,
    requiresMotionPermission: typeof dme?.requestPermission === 'function',
    webBluetooth: typeof navigator !== 'undefined' && 'bluetooth' in nav,
    fileSystemAccess: 'showOpenFilePicker' in window,
  };
}

function getDefaultTelemetry(todayKey: string, now: number): BrowserTelemetryState {
  return {
    todayKey,
    lastActiveAt: now,
    firstActiveTodayAt: now,
    todayActiveBrowserMinutes: 0,
    overnightRestGapMinutes: 0,
    motionActiveMinutes: 0,
    bleWorkoutMinutes: 0,
    bleAvgHeartRate: null,
    bleLastDeviceName: null,
  };
}

export function loadBrowserTelemetry(now: number = Date.now()): BrowserTelemetryState {
  const todayKey = format(now, 'yyyy-MM-dd');
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (!raw) {
      const initial = getDefaultTelemetry(todayKey, now);
      localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    const parsed = JSON.parse(raw) as Partial<BrowserTelemetryState>;
    if (parsed.todayKey !== todayKey) {
      // Day rollover: measure genuine overnight inactive gap between last session & now (3h - 14h)
      const prevLastActive = typeof parsed.lastActiveAt === 'number' ? parsed.lastActiveAt : now;
      const gapMinutes = Math.round((now - prevLastActive) / 60000);
      const overnightRestGapMinutes =
        gapMinutes >= 180 && gapMinutes <= 840 ? gapMinutes : 0;

      const rolled: BrowserTelemetryState = {
        ...getDefaultTelemetry(todayKey, now),
        overnightRestGapMinutes,
        bleLastDeviceName: parsed.bleLastDeviceName ?? null,
      };
      localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(rolled));
      return rolled;
    }

    return {
      todayKey,
      lastActiveAt: typeof parsed.lastActiveAt === 'number' ? parsed.lastActiveAt : now,
      firstActiveTodayAt:
        typeof parsed.firstActiveTodayAt === 'number' ? parsed.firstActiveTodayAt : now,
      todayActiveBrowserMinutes:
        typeof parsed.todayActiveBrowserMinutes === 'number' ? parsed.todayActiveBrowserMinutes : 0,
      overnightRestGapMinutes:
        typeof parsed.overnightRestGapMinutes === 'number' ? parsed.overnightRestGapMinutes : 0,
      motionActiveMinutes:
        typeof parsed.motionActiveMinutes === 'number' ? parsed.motionActiveMinutes : 0,
      bleWorkoutMinutes:
        typeof parsed.bleWorkoutMinutes === 'number' ? parsed.bleWorkoutMinutes : 0,
      bleAvgHeartRate: typeof parsed.bleAvgHeartRate === 'number' ? parsed.bleAvgHeartRate : null,
      bleLastDeviceName: parsed.bleLastDeviceName ?? null,
    };
  } catch {
    return getDefaultTelemetry(todayKey, now);
  }
}

export function saveBrowserTelemetry(next: BrowserTelemetryState): void {
  try {
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

/**
 * Records a real user-activity heartbeat (only counts short active gaps <= 5 min
 * so idle time is never counted as active browser duration).
 */
export function recordBrowserActivityHeartbeat(now: number = Date.now()): BrowserTelemetryState {
  const current = loadBrowserTelemetry(now);
  const deltaMs = now - current.lastActiveAt;
  const addedMinutes =
    deltaMs >= 30_000 && deltaMs <= 300_000 ? deltaMs / 60_000 : 0;

  const updated: BrowserTelemetryState = {
    ...current,
    lastActiveAt: now,
    todayActiveBrowserMinutes: Math.min(
      1440,
      Math.round((current.todayActiveBrowserMinutes + addedMinutes) * 10) / 10
    ),
  };
  saveBrowserTelemetry(updated);
  return updated;
}

/**
 * Connects to the Chromium IdleDetector API (when supported & granted)
 * to track real screen-lock / idle sleep-rest windows and active periods.
 */
export async function connectBrowserIdleDetector(
  onTransition: (info: { userState: string; screenState: string; telemetry: BrowserTelemetryState }) => void
): Promise<{ stop: () => void }> {
  const win = window as unknown as {
    IdleDetector?: {
      requestPermission: () => Promise<'granted' | 'denied'>;
      new (): {
        userState: string;
        screenState: string;
        addEventListener: (event: string, cb: () => void) => void;
        start: (opts: { threshold: number; signal?: AbortSignal }) => Promise<void>;
      };
    };
  };

  if (!win.IdleDetector) {
    throw new Error('Die Browser IdleDetector API wird von diesem Browser nicht unterstützt.');
  }

  const permission = await win.IdleDetector.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Berechtigung für IdleDetector wurde verweigert.');
  }

  const controller = new AbortController();
  const detector = new win.IdleDetector();
  let idleStartedAt: number | null = null;

  detector.addEventListener('change', () => {
    const now = Date.now();
    let telemetry = loadBrowserTelemetry(now);

    if (detector.userState === 'idle' || detector.screenState === 'locked') {
      if (idleStartedAt === null) {
        idleStartedAt = now;
      }
    } else if (detector.userState === 'active' && idleStartedAt !== null) {
      const restMinutes = Math.round((now - idleStartedAt) / 60_000);
      idleStartedAt = null;
      // Only treat extended idle/locked blocks (>= 180 min) as sleep/rest recovery window
      if (restMinutes >= 180 && restMinutes <= 840) {
        telemetry = {
          ...telemetry,
          overnightRestGapMinutes: Math.max(telemetry.overnightRestGapMinutes, restMinutes),
          lastActiveAt: now,
        };
        saveBrowserTelemetry(telemetry);
      }
    }

    onTransition({
      userState: detector.userState || 'active',
      screenState: detector.screenState || 'unlocked',
      telemetry,
    });
  });

  await detector.start({ threshold: 300_000, signal: controller.signal });
  return {
    stop: () => controller.abort(),
  };
}

/**
 * Starts real DeviceMotion / Accelerometer movement duration tracking.
 * Counts seconds where net acceleration delta exceeds walking/movement threshold.
 */
export async function startMotionActivityTracker(
  onProgress: (motionMinutes: number) => void
): Promise<{ stop: () => void }> {
  const win = window as unknown as {
    DeviceMotionEvent?: {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
  };

  if (!win.DeviceMotionEvent) {
    throw new Error('Bewegungssensoren (DeviceMotion) werden von diesem Gerät nicht unterstützt.');
  }

  if (typeof win.DeviceMotionEvent.requestPermission === 'function') {
    const perm = await win.DeviceMotionEvent.requestPermission();
    if (perm !== 'granted') {
      throw new Error('Bewegungssensor-Berechtigung wurde abgelehnt.');
    }
  }

  let lastMagnitude = 9.81;
  let lastMovementSecond = 0;
  let activeSecondsBuffer = 0;

  const handleMotion = (event: DeviceMotionEvent) => {
    const acc = event.acceleration || event.accelerationIncludingGravity;
    if (!acc) return;
    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;
    const mag = Math.sqrt(x * x + y * y + z * z);
    const delta = event.acceleration ? mag : Math.abs(mag - lastMagnitude);
    lastMagnitude = mag;

    if (delta > 1.35) {
      const currentSec = Math.floor(Date.now() / 1000);
      if (currentSec !== lastMovementSecond) {
        lastMovementSecond = currentSec;
        activeSecondsBuffer += 1;
        if (activeSecondsBuffer >= 15) {
          const telemetry = loadBrowserTelemetry();
          const addedMinutes = activeSecondsBuffer / 60;
          activeSecondsBuffer = 0;
          const nextMinutes = Math.min(
            1440,
            Math.round((telemetry.motionActiveMinutes + addedMinutes) * 10) / 10
          );
          saveBrowserTelemetry({
            ...telemetry,
            motionActiveMinutes: nextMinutes,
          });
          onProgress(Math.round(nextMinutes));
        }
      }
    }
  };

  window.addEventListener('devicemotion', handleMotion);

  return {
    stop: () => {
      window.removeEventListener('devicemotion', handleMotion);
      if (activeSecondsBuffer > 0) {
        const telemetry = loadBrowserTelemetry();
        const nextMinutes = Math.min(
          1440,
          Math.round((telemetry.motionActiveMinutes + activeSecondsBuffer / 60) * 10) / 10
        );
        saveBrowserTelemetry({
          ...telemetry,
          motionActiveMinutes: nextMinutes,
        });
        activeSecondsBuffer = 0;
      }
    },
  };
}

/**
 * Connects to a Web Bluetooth Heart Rate / Fitness tracker via navigator.bluetooth
 * and streams live heart-rate & active workout duration into today's telemetry.
 */
export async function connectWebBluetoothHeartRate(
  onSample: (sample: { bpm: number; avgBpm: number; durationMinutes: number; deviceName: string }) => void
): Promise<{ deviceName: string; disconnect: () => void }> {
  const nav = navigator as unknown as {
    bluetooth?: {
      requestDevice: (options: {
        filters: { services: string[] }[];
        optionalServices?: string[];
      }) => Promise<{
        name?: string;
        gatt?: {
          connected: boolean;
          connect: () => Promise<{
            getPrimaryService: (service: string) => Promise<{
              getCharacteristic: (char: string) => Promise<{
                startNotifications: () => Promise<void>;
                addEventListener: (ev: string, cb: (e: Event) => void) => void;
              }>;
            }>;
          }>;
          disconnect: () => void;
        };
      }>;
    };
  };

  if (!nav.bluetooth) {
    throw new Error('Web Bluetooth ist in diesem Browser nicht verfügbar.');
  }

  const device = await nav.bluetooth.requestDevice({
    filters: [{ services: ['heart_rate'] }, { services: ['fitness_machine'] }],
    optionalServices: ['heart_rate', 'fitness_machine'],
  });

  if (!device.gatt) {
    throw new Error('GATT-Server auf dem Bluetooth-Gerät nicht verfügbar.');
  }

  const deviceName = device.name || 'Bluetooth Fitness-Sensor';
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('heart_rate');
  const characteristic = await service.getCharacteristic('heart_rate_measurement');

  const sessionStartMs = Date.now();
  const samples: number[] = [];

  const handleValueChanged = (event: Event) => {
    const target = event.target as unknown as { value?: DataView };
    const data = target?.value;
    if (!data || data.byteLength < 2) return;

    const flags = data.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    const bpm = is16Bit && data.byteLength >= 3 ? data.getUint16(1, true) : data.getUint8(1);
    if (bpm < 25 || bpm > 240) return;

    samples.push(bpm);
    const avgBpm = Math.round(samples.reduce((sum, s) => sum + s, 0) / samples.length);
    const elapsedMin = Math.max(1, Math.round((Date.now() - sessionStartMs) / 60_000));

    const telemetry = loadBrowserTelemetry();
    saveBrowserTelemetry({
      ...telemetry,
      bleWorkoutMinutes: Math.max(telemetry.bleWorkoutMinutes, elapsedMin),
      bleAvgHeartRate: avgBpm,
      bleLastDeviceName: deviceName,
    });

    onSample({
      bpm,
      avgBpm,
      durationMinutes: elapsedMin,
      deviceName,
    });
  };

  await characteristic.startNotifications();
  characteristic.addEventListener('characteristicvaluechanged', handleValueChanged);

  return {
    deviceName,
    disconnect: () => {
      try {
        if (device.gatt?.connected) {
          device.gatt.disconnect();
        }
      } catch {
        // Ignore disconnect errors
      }
    },
  };
}

/**
 * Parses Apple Health XML, Google Fit / Health Connect JSON, or CSV health exports
 * selected via browser File Picker / File API.
 */
export async function parseHealthExportFile(file: File): Promise<ParsedHealthImportDay[]> {
  const text = await file.text();
  const nameLower = file.name.toLowerCase();
  const dayMap = new Map<string, { sleep: number; activity: number }>();

  const addDayMetric = (dateKey: string, sleepMin: number, activityMin: number) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    const prev = dayMap.get(dateKey) || { sleep: 0, activity: 0 };
    dayMap.set(dateKey, {
      sleep: Math.min(1440, Math.round(prev.sleep + Math.max(0, sleepMin))),
      activity: Math.min(1440, Math.round(prev.activity + Math.max(0, activityMin))),
    });
  };

  if (nameLower.endsWith('.xml') || text.trim().startsWith('<?xml') || text.includes('<HealthData')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');

    const records = Array.from(doc.querySelectorAll('Record'));
    for (const rec of records) {
      const type = rec.getAttribute('type') || '';
      const startDateStr = rec.getAttribute('startDate') || '';
      const endDateStr = rec.getAttribute('endDate') || '';
      const valNum = parseFloat(rec.getAttribute('value') || '0');

      const startMs = Date.parse(startDateStr);
      const endMs = Date.parse(endDateStr);
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;

      const dateKey = format(endMs, 'yyyy-MM-dd');

      if (type.includes('SleepAnalysis')) {
        const valueAttr = rec.getAttribute('value') || '';
        const isAsleep =
          valueAttr.includes('Asleep') ||
          valueAttr === 'HKCategoryValueSleepAnalysisAsleep' ||
          valueAttr === '1';
        if (isAsleep) {
          const mins = Math.max(0, (endMs - startMs) / 60_000);
          addDayMetric(dateKey, mins, 0);
        }
      } else if (type.includes('AppleExerciseTime') && !Number.isNaN(valNum)) {
        addDayMetric(dateKey, 0, valNum);
      }
    }

    const workouts = Array.from(doc.querySelectorAll('Workout'));
    for (const workout of workouts) {
      const duration = parseFloat(workout.getAttribute('duration') || '0');
      const endDateStr = workout.getAttribute('endDate') || workout.getAttribute('startDate') || '';
      const endMs = Date.parse(endDateStr);
      if (!Number.isNaN(endMs) && !Number.isNaN(duration) && duration > 0) {
        addDayMetric(format(endMs, 'yyyy-MM-dd'), 0, duration);
      }
    }
  } else if (nameLower.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    const parsed = JSON.parse(text);
    const items: Record<string, unknown>[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.records)
      ? parsed.records
      : Array.isArray(parsed.days)
      ? parsed.days
      : Array.isArray(parsed.bucket)
      ? parsed.bucket
      : [parsed];

    for (const item of items) {
      const rawDate =
        (item.date as string | number | undefined) ||
        (item.day as string | undefined) ||
        (item.startTimeMillis as number | undefined);
      let dateKey = format(new Date(), 'yyyy-MM-dd');
      if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        dateKey = rawDate.slice(0, 10);
      } else if (typeof rawDate === 'number' && !Number.isNaN(rawDate)) {
        dateKey = format(rawDate, 'yyyy-MM-dd');
      } else if (typeof item.startTimeMillis === 'string') {
        const ms = Number(item.startTimeMillis);
        if (!Number.isNaN(ms)) dateKey = format(ms, 'yyyy-MM-dd');
      }

      const sleepMin = Number(
        item.sleepDurationMinutes ??
          item.sleepMinutes ??
          item.sleep_minutes ??
          (typeof item.sleepHours === 'number' ? item.sleepHours * 60 : 0)
      );
      const activityMin = Number(
        item.activityDurationMinutes ??
          item.activeMinutes ??
          item.activity_minutes ??
          item.moveMinutes ??
          0
      );

      if (!Number.isNaN(sleepMin) || !Number.isNaN(activityMin)) {
        addDayMetric(
          dateKey,
          Number.isNaN(sleepMin) ? 0 : sleepMin,
          Number.isNaN(activityMin) ? 0 : activityMin
        );
      }
    }
  } else {
    // CSV parser: expects header or columns with date, sleep_minutes/sleep_hours, activity_minutes
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length > 0) {
      const headers = lines[0].toLowerCase().split(/[,;]/).map((h) => h.trim());
      const hasHeader = headers.some(
        (h) => h.includes('date') || h.includes('sleep') || h.includes('schlaf') || h.includes('aktiv')
      );
      const startIndex = hasHeader ? 1 : 0;

      const dateIdx = hasHeader
        ? headers.findIndex((h) => h.includes('date') || h.includes('datum'))
        : 0;
      const sleepMinIdx = hasHeader
        ? headers.findIndex((h) => (h.includes('sleep') || h.includes('schlaf')) && !h.includes('hour') && !h.includes('std'))
        : 1;
      const sleepHoursIdx = hasHeader
        ? headers.findIndex((h) => (h.includes('sleep') || h.includes('schlaf')) && (h.includes('hour') || h.includes('std')))
        : -1;
      const activityIdx = hasHeader
        ? headers.findIndex((h) => h.includes('activ') || h.includes('aktiv') || h.includes('move'))
        : 2;

      for (let i = startIndex; i < lines.length; i++) {
        const cols = lines[i].split(/[,;]/).map((c) => c.trim());
        const rawDate = cols[dateIdx >= 0 ? dateIdx : 0] || '';
        const dateKey = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
          ? rawDate.slice(0, 10)
          : format(new Date(), 'yyyy-MM-dd');

        const sleepMin =
          sleepMinIdx >= 0
            ? parseFloat(cols[sleepMinIdx] || '0')
            : sleepHoursIdx >= 0
            ? parseFloat(cols[sleepHoursIdx] || '0') * 60
            : 0;
        const activityMin = activityIdx >= 0 ? parseFloat(cols[activityIdx] || '0') : 0;

        addDayMetric(
          dateKey,
          Number.isNaN(sleepMin) ? 0 : sleepMin,
          Number.isNaN(activityMin) ? 0 : activityMin
        );
      }
    }
  }

  return Array.from(dayMap.entries())
    .map(([dateKey, vals]) => ({
      dateKey,
      sleepDurationMinutes: vals.sleep,
      activityDurationMinutes: vals.activity,
    }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export function calculateRecoveryMetrics(params: {
  sleepDurationMinutes: number;
  activityDurationMinutes: number;
  avgHeartRate?: number | null;
  todayMood?: number | null;
}): { recoveryScore: number; recoveryState: RecoveryState } {
  const sleep = Math.max(0, Math.min(1440, params.sleepDurationMinutes));
  const activity = Math.max(0, Math.min(1440, params.activityDurationMinutes));

  // 1. Sleep Recovery Component (0 - 65 pts, optimal 450 min = 7.5h)
  let sleepPoints = 0;
  if (sleep >= 450 && sleep <= 540) {
    sleepPoints = 65;
  } else if (sleep > 540) {
    sleepPoints = Math.max(52, 65 - Math.round((sleep - 540) / 20));
  } else if (sleep >= 360) {
    sleepPoints = 38 + Math.round(((sleep - 360) / 90) * 27);
  } else {
    sleepPoints = Math.round((sleep / 360) * 38);
  }

  // 2. Activity Load & Strain Balance (0 - 35 pts)
  let activityPoints = 0;
  if (activity >= 25 && activity <= 75) {
    activityPoints = 33;
  } else if (activity < 25) {
    // Low activity indicates unused activation potential
    activityPoints = 18 + Math.round((activity / 25) * 12);
  } else {
    // High load: check if sleep supports recovery
    const overLoad = activity - 75;
    const sleepBuffer = sleep >= 450 ? 0.12 : 0.25;
    activityPoints = Math.max(8, Math.round(33 - overLoad * sleepBuffer));
  }

  // 3. Optional Heart Rate & Mood Modifier
  let modifier = 0;
  if (typeof params.avgHeartRate === 'number' && params.avgHeartRate >= 145 && sleep < 420) {
    modifier -= 6;
  }
  if (typeof params.todayMood === 'number') {
    if (params.todayMood <= 2) modifier -= 6;
    else if (params.todayMood >= 4) modifier += 4;
  }

  const recoveryScore = Math.max(0, Math.min(100, Math.round(sleepPoints + activityPoints + modifier)));

  let recoveryState: RecoveryState = 'balanced';
  if (recoveryScore < 40) recoveryState = 'depleted';
  else if (recoveryScore < 65) recoveryState = 'strained';
  else if (recoveryScore < 85) recoveryState = 'balanced';
  else recoveryState = 'charged';

  return { recoveryScore, recoveryState };
}

export function formatMinutesAsHoursMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m} Min`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function buildTodayHealthRecord(params: {
  existingRecord?: HealthDailyRecord | null;
  focusSessions: FocusSession[];
  quests: Quest[];
  diaryEntries: DiaryEntry[];
  overrideSleepMinutes?: number;
  overrideActivityMinutes?: number;
  overrideAvgHeartRate?: number | null;
  extraSources?: HealthDataSource[];
  referenceDate?: Date;
}): HealthDailyRecord {
  const nowDate = params.referenceDate ?? new Date();
  const todayKey = format(nowDate, 'yyyy-MM-dd');
  const todayStartMs = startOfDay(nowDate).getTime();

  const telemetry = recordBrowserActivityHeartbeat(nowDate.getTime());

  // Sum real Aura activity today (Focus minutes + completed Fitness quests/habits)
  const focusMinutesToday = params.focusSessions
    .filter((f) => isSameDay(new Date(f.completedAt), nowDate))
    .reduce((sum, f) => sum + (f.durationMinutes || 0), 0);

  const fitnessEventsToday = params.quests.reduce((count, q) => {
    if (q.skill !== 'Fitness') return count;
    if (q.type === 'habit') {
      const posToday = (q.completions || []).filter(
        (c) => c.direction === 'positive' && isSameDay(new Date(c.date), nowDate)
      ).length;
      return count + posToday;
    }
    if (q.completed && !q.failed && q.completedAt && isSameDay(new Date(q.completedAt), nowDate)) {
      return count + 1;
    }
    return count;
  }, 0);

  const auraActivityMinutes = Math.round(focusMinutesToday * 0.5 + fitnessEventsToday * 20);
  const browserMotionAndBle = Math.round(
    telemetry.motionActiveMinutes + telemetry.bleWorkoutMinutes
  );

  const sleepDurationMinutes =
    typeof params.overrideSleepMinutes === 'number'
      ? Math.max(0, Math.min(1440, Math.round(params.overrideSleepMinutes)))
      : Math.max(
          params.existingRecord?.sleepDurationMinutes ?? 0,
          telemetry.overnightRestGapMinutes
        );

  const activityDurationMinutes =
    typeof params.overrideActivityMinutes === 'number'
      ? Math.max(0, Math.min(1440, Math.round(params.overrideActivityMinutes)))
      : Math.max(
          params.existingRecord?.activityDurationMinutes ?? 0,
          auraActivityMinutes + browserMotionAndBle
        );

  const sourcesSet = new Set<HealthDataSource>(params.existingRecord?.sources || []);
  if (telemetry.overnightRestGapMinutes > 0 || telemetry.todayActiveBrowserMinutes > 0) {
    sourcesSet.add('browser_idle');
  }
  if (telemetry.motionActiveMinutes > 0) {
    sourcesSet.add('device_motion');
  }
  if (telemetry.bleWorkoutMinutes > 0 || telemetry.bleAvgHeartRate) {
    sourcesSet.add('web_bluetooth');
  }
  if (auraActivityMinutes > 0) {
    sourcesSet.add('aura_activity');
  }
  for (const s of params.extraSources || []) {
    sourcesSet.add(s);
  }
  if (sourcesSet.size === 0) {
    sourcesSet.add('aura_activity');
  }

  const todayMood =
    params.diaryEntries.find((e) => isSameDay(new Date(e.date), nowDate))?.mood ?? null;
  const avgHeartRate =
    typeof params.overrideAvgHeartRate === 'number'
      ? Math.round(params.overrideAvgHeartRate)
      : telemetry.bleAvgHeartRate ?? params.existingRecord?.avgHeartRate ?? null;

  const { recoveryScore, recoveryState } = calculateRecoveryMetrics({
    sleepDurationMinutes,
    activityDurationMinutes,
    avgHeartRate,
    todayMood,
  });

  return {
    id: todayKey,
    date: todayStartMs,
    sleepDurationMinutes,
    activityDurationMinutes,
    avgHeartRate,
    sources: Array.from(sourcesSet).slice(0, 8),
    recoveryScore,
    recoveryState,
    acceptedSuggestionIds: params.existingRecord?.acceptedSuggestionIds || [],
    dismissedSuggestionIds: params.existingRecord?.dismissedSuggestionIds || [],
    syncedAt: Date.now(),
  };
}

export function generateEnergyRecoveryQuests(params: {
  record: HealthDailyRecord;
  todayMood: number | null;
  todayFocusMinutes: number;
  existingQuests: Quest[];
}): EnergyRecoverySuggestion[] {
  const { record, todayMood, todayFocusMinutes, existingQuests } = params;
  const sleepMin = record.sleepDurationMinutes;
  const activityMin = record.activityDurationMinutes;
  const sleepLabel = formatMinutesAsHoursMinutes(sleepMin);
  const candidates: EnergyRecoverySuggestion[] = [];

  // 1. Sleep deficit recovery
  if (sleepMin > 0 && sleepMin < 400) {
    candidates.push({
      id: 'recovery-nsdr-sleep-debt',
      title: '20 Min NSDR / Power-Nap Regeneration',
      description:
        'Geführte Tiefenentspannung ohne Reize, um fehlenden Nachtschlaf gezielt auszugleichen und Fokus zurückzuholen.',
      skill: 'Fokus',
      xpReward: 20,
      recommendedDurationMinutes: 20,
      category: 'sleep_recovery',
      priority: 'high',
      reason: `Nur ${sleepLabel} Schlaf erfasst – kurzfristiger Erholungs-Reset empfohlen.`,
      tags: ['Energy-Recovery', 'Schlaf'],
    });

    candidates.push({
      id: 'recovery-early-winddown',
      title: 'Digital Sunset 45 Min vor dem Schlafen',
      description:
        'Bildschirme dimmen oder ausschalten, Licht reduzieren und den Abend ruhig abschließen für tiefere REM-Phasen.',
      skill: 'Disziplin',
      xpReward: 20,
      recommendedDurationMinutes: 45,
      category: 'sleep_recovery',
      priority: 'high',
      reason: `Schlafdefizit (${sleepLabel}) erfordert heute eine geschützte Abendroutine.`,
      tags: ['Energy-Recovery', 'Abendroutine'],
    });
  } else if (sleepMin === 0) {
    candidates.push({
      id: 'recovery-sleep-checkin',
      title: 'Regenerations-Pause & Atem-Reset',
      description:
        '10 Minuten ruhige Box-Atmung (4-4-4-4) zur Stabilisierung des Nervensystems und bewussten Energie-Einschätzung.',
      skill: 'Fokus',
      xpReward: 10,
      recommendedDurationMinutes: 10,
      category: 'mindful_reset',
      priority: 'medium',
      reason: 'Noch keine Schlafdauer synchronisiert – kurzer Energie-Check empfehlenswert.',
      tags: ['Energy-Recovery', 'Achtsamkeit'],
    });
  }

  // 2. High physical / cardiovascular strain
  if (activityMin >= 75 || (typeof record.avgHeartRate === 'number' && record.avgHeartRate >= 135)) {
    const hrNote = record.avgHeartRate ? ` (Ø ${record.avgHeartRate} BPM)` : '';
    candidates.push({
      id: 'recovery-mobility-stretch',
      title: '15 Min Aktive Regeneration: Mobility & Dehnen',
      description:
        'Sanfte Hüft-, Rücken- und Schultermobilisation zur Senkung von Muskelspannung und schnellerer Erholung.',
      skill: 'Fitness',
      xpReward: 20,
      recommendedDurationMinutes: 15,
      category: 'active_rest',
      priority: sleepMin > 0 && sleepMin < 420 ? 'high' : 'medium',
      reason: `Hohe Aktivitätsdauer (${activityMin} Min${hrNote}) – aktive Entlastung beugt Überlastung vor.`,
      tags: ['Energy-Recovery', 'Mobility'],
    });

    candidates.push({
      id: 'recovery-hydration-electrolytes',
      title: 'Hydration & Mineralstoff-Refuel (750 ml)',
      description:
        'Ausreichend Wasser mit Elektrolyten oder mineralreicher Mahlzeit auffüllen, um Trainings- und Alltagsbelastung auszugleichen.',
      skill: 'Fitness',
      xpReward: 10,
      recommendedDurationMinutes: 10,
      category: 'hydration_nutrition',
      priority: 'medium',
      reason: `${activityMin} Min Aktivität erhöhen deinen Flüssigkeits- und Erholungsbedarf.`,
      tags: ['Energy-Recovery', 'Hydration'],
    });
  }

  // 3. Low movement / sluggish recovery
  if (activityMin < 25) {
    candidates.push({
      id: 'recovery-daylight-walk',
      title: '20 Min Tageslicht-Spaziergang ohne Handy',
      description:
        'Natürliches Tageslicht und lockeres Gehen stabilisieren den zirkadianen Rhythmus und lösen mentale Müdigkeit.',
      skill: 'Fitness',
      xpReward: 20,
      recommendedDurationMinutes: 20,
      category: 'movement_boost',
      priority: sleepMin > 540 ? 'high' : 'medium',
      reason: `Bisher ${activityMin} Min Aktivität – sanfte Bewegung aktiviert Kreislauf & Schlafdruck.`,
      tags: ['Energy-Recovery', 'Tageslicht'],
    });
  }

  // 4. Cognitive / emotional fatigue
  if (todayFocusMinutes >= 90 || (todayMood !== null && todayMood <= 2)) {
    candidates.push({
      id: 'recovery-sensory-offload',
      title: '15 Min Reizpause & Gedanken-Offload',
      description:
        'Kurz offline gehen, Augen entspannen (Blick in die Ferne) und offene Gedanken aufschreiben, um mentalen Akku zu laden.',
      skill: 'Fokus',
      xpReward: 20,
      recommendedDurationMinutes: 15,
      category: 'mindful_reset',
      priority: 'high',
      reason:
        todayMood !== null && todayMood <= 2
          ? `Niedrige Tagesstimmung (${todayMood}/5 ★) deutet auf erhöhten mentalen Erholungsbedarf hin.`
          : `${todayFocusMinutes} Min Fokuszeit heute – bewusste Pause verhindert kognitive Erschöpfung.`,
      tags: ['Energy-Recovery', 'Mental'],
    });
  }

  // 5. Well-recovered / maintenance anchor
  if (record.recoveryState === 'charged' || record.recoveryState === 'balanced') {
    candidates.push({
      id: 'recovery-micro-balance',
      title: '10 Min Haltungs- & Atem-Check am Nachmittag',
      description:
        'Kurzer Check-in zwischen Aufgabenblöcken, um dein hohes Energielevel bis zum Abend stabil zu halten.',
      skill: 'Disziplin',
      xpReward: 10,
      recommendedDurationMinutes: 10,
      category: 'active_rest',
      priority: 'low',
      reason: `Recovery-Score bei ${record.recoveryScore}/100 – ideal zum Erhalt deiner Energie-Balance.`,
      tags: ['Energy-Recovery', 'Balance'],
    });
  }

  const todayOpenTitles = new Set(
    existingQuests
      .filter((q) => q.type !== 'habit' && !q.completed)
      .map((q) => q.title.toLowerCase())
  );
  const dismissedSet = new Set(record.dismissedSuggestionIds || []);

  // Deduplicate, exclude dismissed, sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const unique: EnergyRecoverySuggestion[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    if (seen.has(c.id)) continue;
    if (dismissedSet.has(c.id)) continue;
    if (todayOpenTitles.has(c.title.toLowerCase())) continue;
    seen.add(c.id);
    unique.push(c);
  }

  return unique.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 4);
}
