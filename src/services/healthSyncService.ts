import {
  DiaryEntry,
  EnergyRecoverySuggestion,
  FocusSession,
  GarminWorkoutActivity,
  HealthDailyRecord,
  HealthDataSource,
  HealthMetricKey,
  Quest,
  RecoveryState,
} from '@/types';
import { format, isSameDay, startOfDay } from 'date-fns';

export interface HealthProvidersStatus {
  backendAvailable?: boolean;
  garmin: {
    configured: boolean;
    connected: boolean;
    authMode?: 'api_key' | 'oauth' | null;
    callbackUrl: string;
    connectedAt: number | null;
  };
}

export type HealthMetricCategory = 'recovery_heart' | 'sleep' | 'activity' | 'body';

export interface HealthMetricMeta {
  key: HealthMetricKey;
  label: string;
  shortLabel: string;
  category: HealthMetricCategory;
  unit: string;
  providers: string;
  description: string;
  isPrimary?: boolean;
  defaultVisible: boolean;
}

export const HEALTH_METRICS_CATALOG: HealthMetricMeta[] = [
  {
    key: 'recoveryScore',
    label: 'Recovery-Score',
    shortLabel: 'Recovery',
    category: 'recovery_heart',
    unit: '/100',
    providers: 'Aura (aus Garmin-Messwerten)',
    description: 'Berechnete Tagesbereitschaft aus Schlaf, Belastung und Vitalwerten',
    isPrimary: true,
    defaultVisible: true,
  },
  {
    key: 'sleepDurationMinutes',
    label: 'Schlafdauer',
    shortLabel: 'Schlaf',
    category: 'sleep',
    unit: 'Std/Min',
    providers: 'Garmin Connect',
    description: 'Gesamte effektive Schlafzeit der letzten Nacht',
    isPrimary: true,
    defaultVisible: true,
  },
  {
    key: 'activityDurationMinutes',
    label: 'Aktivitätsdauer',
    shortLabel: 'Aktivität',
    category: 'activity',
    unit: 'Min',
    providers: 'Garmin Connect',
    description: 'Aktive Bewegungs- und Trainingsminuten pro Tag',
    isPrimary: true,
    defaultVisible: true,
  },
  {
    key: 'steps',
    label: 'Schritte',
    shortLabel: 'Schritte',
    category: 'activity',
    unit: 'Schritte',
    providers: 'Garmin Connect',
    description: 'Gezählte Tagesschritte',
    defaultVisible: true,
  },
  {
    key: 'distanceMeters',
    label: 'Distanz',
    shortLabel: 'Distanz',
    category: 'activity',
    unit: 'km',
    providers: 'Garmin Connect',
    description: 'Zurückgelegte Lauf-, Geh- oder Trainingsstrecke',
    defaultVisible: true,
  },
  {
    key: 'caloriesActive',
    label: 'Aktivkalorien',
    shortLabel: 'Kalorien',
    category: 'activity',
    unit: 'kcal',
    providers: 'Garmin Connect',
    description: 'Durch Bewegung und Training verbrannte Energie',
    defaultVisible: true,
  },
  {
    key: 'floorsClimbed',
    label: 'Etagen',
    shortLabel: 'Etagen',
    category: 'activity',
    unit: 'Etagen',
    providers: 'Garmin Connect',
    description: 'Gestiegene Stockwerke bzw. Höhenmeter-Äquivalent',
    defaultVisible: true,
  },
  {
    key: 'heartPoints',
    label: 'Intensitätsminuten',
    shortLabel: 'Intensität',
    category: 'activity',
    unit: 'Min',
    providers: 'Garmin Connect',
    description: 'Garmin Intensitätsminuten aus moderater und intensiver Aktivität',
    defaultVisible: true,
  },
  {
    key: 'workoutsCount',
    label: 'Workouts',
    shortLabel: 'Workouts',
    category: 'activity',
    unit: 'Einheiten',
    providers: 'Garmin Connect',
    description: 'Anzahl erfasster Trainingseinheiten am Tag',
    defaultVisible: true,
  },
  {
    key: 'restingHeartRate',
    label: 'Ruhepuls',
    shortLabel: 'Ruhepuls',
    category: 'recovery_heart',
    unit: 'BPM',
    providers: 'Garmin Connect',
    description: 'Ruheherzfrequenz als wichtiger Erholungsindikator',
    defaultVisible: true,
  },
  {
    key: 'avgHeartRate',
    label: 'Durchschnittspuls',
    shortLabel: 'Ø Puls',
    category: 'recovery_heart',
    unit: 'BPM',
    providers: 'Garmin Connect',
    description: 'Mittlere Herzfrequenz über Tag oder Training',
    defaultVisible: true,
  },
  {
    key: 'hrvMs',
    label: 'HRV (rMSSD)',
    shortLabel: 'HRV',
    category: 'recovery_heart',
    unit: 'ms',
    providers: 'Garmin Connect',
    description: 'Herzfrequenzvariabilität für Stress- & Regenerationsanalyse',
    defaultVisible: true,
  },
  {
    key: 'bodyBattery',
    label: 'Body Battery',
    shortLabel: 'Body Battery',
    category: 'recovery_heart',
    unit: '/100',
    providers: 'Garmin Connect',
    description: 'Körperliche Energiereserve laut Garmin-Modell',
    defaultVisible: true,
  },
  {
    key: 'stressLevel',
    label: 'Stresslevel',
    shortLabel: 'Stress',
    category: 'recovery_heart',
    unit: '/100',
    providers: 'Garmin Connect',
    description: 'Durchschnittliche tägliche Stressbelastung',
    defaultVisible: true,
  },
  {
    key: 'sleepDeepMinutes',
    label: 'Tiefschlaf',
    shortLabel: 'Tief',
    category: 'sleep',
    unit: 'Std/Min',
    providers: 'Garmin Connect',
    description: 'Körperlich regenerierende Tiefschlafphase',
    defaultVisible: true,
  },
  {
    key: 'sleepRemMinutes',
    label: 'REM-Schlaf',
    shortLabel: 'REM',
    category: 'sleep',
    unit: 'Std/Min',
    providers: 'Garmin Connect',
    description: 'Kognitiv & emotional verarbeitender REM-Schlaf',
    defaultVisible: true,
  },
  {
    key: 'sleepLightMinutes',
    label: 'Leichtschlaf',
    shortLabel: 'Leicht',
    category: 'sleep',
    unit: 'Std/Min',
    providers: 'Garmin Connect',
    description: 'Basis-Schlafphase zwischen Wachzustand und Tief-/REM-Schlaf',
    defaultVisible: true,
  },
  {
    key: 'sleepAwakeMinutes',
    label: 'Wachzeit im Schlaf',
    shortLabel: 'Wach',
    category: 'sleep',
    unit: 'Min',
    providers: 'Garmin Connect',
    description: 'Unterbrechungen bzw. Wachphasen während der Nacht',
    defaultVisible: true,
  },
  {
    key: 'spo2Percent',
    label: 'Blutsauerstoff (SpO₂)',
    shortLabel: 'SpO₂',
    category: 'body',
    unit: '%',
    providers: 'Garmin Connect',
    description: 'Sauerstoffsättigung des Blutes',
    defaultVisible: true,
  },
  {
    key: 'respirationRate',
    label: 'Atemfrequenz',
    shortLabel: 'Atmung',
    category: 'body',
    unit: '/Min',
    providers: 'Garmin Connect',
    description: 'Atemzüge pro Minute im Ruhezustand / Schlaf',
    defaultVisible: true,
  },
  {
    key: 'vo2Max',
    label: 'VO₂ max',
    shortLabel: 'VO₂ max',
    category: 'body',
    unit: 'ml/kg/min',
    providers: 'Garmin Connect',
    description: 'Maximale Sauerstoffaufnahme (Ausdauerfitness-Index)',
    defaultVisible: true,
  },
  {
    key: 'weightKg',
    label: 'Körpergewicht',
    shortLabel: 'Gewicht',
    category: 'body',
    unit: 'kg',
    providers: 'Garmin Connect',
    description: 'Erfasstes Körpergewicht',
    defaultVisible: true,
  },
  {
    key: 'bodyFatPercent',
    label: 'Körperfett',
    shortLabel: 'Körperfett',
    category: 'body',
    unit: '%',
    providers: 'Garmin Connect',
    description: 'Körperfettanteil in Prozent',
    defaultVisible: true,
  },
  {
    key: 'hydrationMl',
    label: 'Hydration / Wasser',
    shortLabel: 'Wasser',
    category: 'body',
    unit: 'L',
    providers: 'Garmin Connect',
    description: 'Erfasste Flüssigkeitsaufnahme pro Tag',
    defaultVisible: true,
  },
];

export const ALL_HEALTH_METRIC_KEYS: HealthMetricKey[] = HEALTH_METRICS_CATALOG.map((m) => m.key);

export const DEFAULT_VISIBLE_HEALTH_METRICS: HealthMetricKey[] = HEALTH_METRICS_CATALOG.filter(
  (m) => m.defaultVisible
).map((m) => m.key);

export const HEALTH_METRIC_CATEGORY_LABELS: Record<HealthMetricCategory, string> = {
  recovery_heart: 'Erholung & Herz',
  sleep: 'Schlaf & Phasen',
  activity: 'Aktivität & Training',
  body: 'Körper & Atmung',
};

export function getVisibleHealthMetricsSet(configured?: HealthMetricKey[]): Set<HealthMetricKey> {
  if (Array.isArray(configured)) {
    return new Set<HealthMetricKey>(configured);
  }
  return new Set<HealthMetricKey>(DEFAULT_VISIBLE_HEALTH_METRICS);
}

export function hasHealthMetricValue(
  key: HealthMetricKey,
  record: Partial<HealthDailyRecord> | null | undefined
): boolean {
  if (!record) return false;
  switch (key) {
    case 'recoveryScore':
      return typeof record.recoveryScore === 'number';
    case 'sleepDurationMinutes':
      return typeof record.sleepDurationMinutes === 'number' && record.sleepDurationMinutes > 0;
    case 'activityDurationMinutes':
      return typeof record.activityDurationMinutes === 'number' && record.activityDurationMinutes > 0;
    case 'stressLevel':
      return typeof record.stressLevel === 'number' && record.stressLevel >= 0;
    case 'bodyBattery':
      return typeof record.bodyBattery === 'number' && record.bodyBattery >= 0;
    default: {
      const val = record[key as keyof HealthDailyRecord];
      return typeof val === 'number' && Number.isFinite(val) && val > 0;
    }
  }
}

export function formatHealthMetricValue(
  key: HealthMetricKey,
  record: Partial<HealthDailyRecord> | null | undefined
): string | null {
  if (!record) return null;
  switch (key) {
    case 'recoveryScore':
      return typeof record.recoveryScore === 'number' ? `${record.recoveryScore}/100` : null;
    case 'sleepDurationMinutes':
      return typeof record.sleepDurationMinutes === 'number' && record.sleepDurationMinutes > 0
        ? formatMinutesAsHoursMinutes(record.sleepDurationMinutes)
        : null;
    case 'sleepDeepMinutes':
      return typeof record.sleepDeepMinutes === 'number' && record.sleepDeepMinutes > 0
        ? formatMinutesAsHoursMinutes(record.sleepDeepMinutes)
        : null;
    case 'sleepLightMinutes':
      return typeof record.sleepLightMinutes === 'number' && record.sleepLightMinutes > 0
        ? formatMinutesAsHoursMinutes(record.sleepLightMinutes)
        : null;
    case 'sleepRemMinutes':
      return typeof record.sleepRemMinutes === 'number' && record.sleepRemMinutes > 0
        ? formatMinutesAsHoursMinutes(record.sleepRemMinutes)
        : null;
    case 'sleepAwakeMinutes':
      return typeof record.sleepAwakeMinutes === 'number' && record.sleepAwakeMinutes > 0
        ? `${record.sleepAwakeMinutes} Min`
        : null;
    case 'activityDurationMinutes':
      return typeof record.activityDurationMinutes === 'number' && record.activityDurationMinutes > 0
        ? `${record.activityDurationMinutes} Min`
        : null;
    case 'steps':
      return typeof record.steps === 'number' && record.steps > 0
        ? record.steps.toLocaleString('de-DE')
        : null;
    case 'distanceMeters':
      return typeof record.distanceMeters === 'number' && record.distanceMeters > 0
        ? record.distanceMeters >= 1000
          ? `${(record.distanceMeters / 1000).toFixed(2).replace('.', ',')} km`
          : `${record.distanceMeters} m`
        : null;
    case 'caloriesActive':
      return typeof record.caloriesActive === 'number' && record.caloriesActive > 0
        ? `${record.caloriesActive.toLocaleString('de-DE')} kcal`
        : null;
    case 'floorsClimbed':
      return typeof record.floorsClimbed === 'number' && record.floorsClimbed > 0
        ? `${record.floorsClimbed}`
        : null;
    case 'heartPoints':
      return typeof record.heartPoints === 'number' && record.heartPoints > 0
        ? `${record.heartPoints} Pkt`
        : null;
    case 'workoutsCount':
      return typeof record.workoutsCount === 'number' && record.workoutsCount > 0
        ? `${record.workoutsCount}`
        : null;
    case 'avgHeartRate':
      return typeof record.avgHeartRate === 'number' && record.avgHeartRate > 0
        ? `${record.avgHeartRate} BPM`
        : null;
    case 'restingHeartRate':
      return typeof record.restingHeartRate === 'number' && record.restingHeartRate > 0
        ? `${record.restingHeartRate} BPM`
        : null;
    case 'hrvMs':
      return typeof record.hrvMs === 'number' && record.hrvMs > 0
        ? `${Number(record.hrvMs.toFixed(1))} ms`
        : null;
    case 'stressLevel':
      return typeof record.stressLevel === 'number' && record.stressLevel >= 0
        ? `${record.stressLevel}/100`
        : null;
    case 'bodyBattery':
      return typeof record.bodyBattery === 'number' && record.bodyBattery >= 0
        ? `${record.bodyBattery}/100`
        : null;
    case 'spo2Percent':
      return typeof record.spo2Percent === 'number' && record.spo2Percent > 0
        ? `${Number(record.spo2Percent.toFixed(1))}%`
        : null;
    case 'respirationRate':
      return typeof record.respirationRate === 'number' && record.respirationRate > 0
        ? `${Number(record.respirationRate.toFixed(1))}/Min`
        : null;
    case 'vo2Max':
      return typeof record.vo2Max === 'number' && record.vo2Max > 0
        ? `${Number(record.vo2Max.toFixed(1))}`
        : null;
    case 'weightKg':
      return typeof record.weightKg === 'number' && record.weightKg > 0
        ? `${record.weightKg.toFixed(1).replace('.', ',')} kg`
        : null;
    case 'bodyFatPercent':
      return typeof record.bodyFatPercent === 'number' && record.bodyFatPercent > 0
        ? `${record.bodyFatPercent.toFixed(1).replace('.', ',')}%`
        : null;
    case 'hydrationMl':
      return typeof record.hydrationMl === 'number' && record.hydrationMl > 0
        ? record.hydrationMl >= 1000
          ? `${(record.hydrationMl / 1000).toFixed(2).replace('.', ',')} L`
          : `${record.hydrationMl} ml`
        : null;
  }
}

export interface RemoteHealthDayMetric {
  dateKey: string;
  sleepDurationMinutes: number;
  activityDurationMinutes: number;
  avgHeartRate: number | null;
  sleepDeepMinutes?: number | null;
  sleepLightMinutes?: number | null;
  sleepRemMinutes?: number | null;
  sleepAwakeMinutes?: number | null;
  steps?: number | null;
  distanceMeters?: number | null;
  caloriesActive?: number | null;
  floorsClimbed?: number | null;
  heartPoints?: number | null;
  workoutsCount?: number | null;
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  stressLevel?: number | null;
  bodyBattery?: number | null;
  spo2Percent?: number | null;
  respirationRate?: number | null;
  vo2Max?: number | null;
  weightKg?: number | null;
  bodyFatPercent?: number | null;
  hydrationMl?: number | null;
}

export interface RemoteHealthSyncResult {
  provider: 'garmin_connect';
  days: RemoteHealthDayMetric[];
  activities?: GarminWorkoutActivity[];
  garminLastSyncAt?: number | null;
  syncedAt: number;
}

// Strict in-memory token cache (never stored in localStorage/sessionStorage)
const inMemoryHealthSessions = new Map<'garmin', string>();

export function setHealthSessionToken(provider: 'garmin', token: string): void {
  inMemoryHealthSessions.set(provider, token);
}

export function getHealthSessionToken(provider: 'garmin'): string | null {
  return inMemoryHealthSessions.get(provider) || null;
}

export function clearHealthSessionToken(provider: 'garmin'): void {
  inMemoryHealthSessions.delete(provider);
}

function buildStaticLiveStatus(): HealthProvidersStatus {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    backendAvailable: false,
    garmin: {
      configured: false,
      connected: false,
      authMode: null,
      callbackUrl: `${origin}/api/health/garmin/callback`,
      connectedAt: null,
    },
  };
}

export async function fetchHealthProvidersStatus(): Promise<HealthProvidersStatus> {
  try {
    const res = await fetch('/api/health/providers/status', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') || '';
    if (
      res.status === 404 ||
      res.url.includes('__cookie_check') ||
      !contentType.includes('application/json')
    ) {
      return buildStaticLiveStatus();
    }
    if (!res.ok) {
      throw new Error(`Status der Health-Provider konnte nicht geladen werden (HTTP ${res.status}).`);
    }
    const json = (await res.json()) as HealthProvidersStatus;
    return {
      ...json,
      backendAvailable: true,
    };
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return buildStaticLiveStatus();
    }
    throw error;
  }
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
  provider: 'garmin' = 'garmin'
): Promise<void> {
  let res: globalThis.Response;
  try {
    res = await fetch('/api/health/garmin/auth-url', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Verbindung zum Health-Backend fehlgeschlagen.');
  }

  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();
  let data: {
    mode?: 'api_key' | 'oauth';
    connected?: boolean;
    sessionToken?: string;
    connectedAt?: number;
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
  } else if (
    res.url.includes('__cookie_check') ||
    rawText.includes('__cookie_check') ||
    rawText.includes('_aistudio-iframe')
  ) {
    throw new Error(
      'Die AI-Studio-Vorschau-Sitzung ist noch nicht aktiv oder abgelaufen. Bitte öffne die App über die Vorschau in Google AI Studio und lade die Seite neu.'
    );
  } else if (contentType.includes('text/html') || rawText.trim().startsWith('<')) {
    throw new Error(
      `OAuth-Endpunkt hat HTML statt JSON geliefert (HTTP ${res.status}). Bitte App neu laden oder als Node-Server veröffentlichen.`
    );
  }

  if (data.configured === false) {
    const fallbackCallback =
      data.callbackUrl || `${window.location.origin}/api/health/${provider}/callback`;
    throw new ProviderNotConfiguredError(
      data.error || 'Zugangsdaten fehlen in den Server-Secrets.',
      fallbackCallback
    );
  }

  if (data.mode === 'api_key' && data.connected) {
    const token = data.sessionToken || '__garmin_personal_api_key__';
    setHealthSessionToken('garmin', token);
    window.postMessage(
      {
        type: 'HEALTH_OAUTH_SUCCESS',
        provider: 'garmin',
        sessionToken: token,
        connectedAt: data.connectedAt || Date.now(),
      },
      window.location.origin
    );
    return;
  }

  if (!res.ok || !data.url) {
    if (res.status === 404 && !data.error) {
      throw new Error(
        'Garmin Connect benötigt einen laufenden Node-Backend-Server (/api/health/garmin/*), der in dieser statischen Live-Umgebung nicht aktiv ist.'
      );
    }
    throw new Error(
      data.error ||
        `Autorisierung konnte nicht gestartet werden (HTTP ${res.status}).`
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
  provider: 'garmin' = 'garmin',
  options?: { startDate?: string; endDate?: string }
): Promise<RemoteHealthSyncResult> {
  const token = getHealthSessionToken(provider);
  const localDate = format(new Date(), 'yyyy-MM-dd');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['x-health-session'] = token;
  }

  const res = await fetch('/api/health/garmin/sync', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
    body: JSON.stringify({
      localDate,
      ...(options?.startDate ? { startDate: options.startDate } : {}),
      ...(options?.endDate ? { endDate: options.endDate } : {}),
    }),
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
  } else if (
    res.url.includes('__cookie_check') ||
    rawText.includes('__cookie_check') ||
    rawText.includes('_aistudio-iframe')
  ) {
    throw new Error(
      'Die AI-Studio-Vorschau-Sitzung ist noch nicht aktiv oder abgelaufen. Bitte öffne die App über die Vorschau in Google AI Studio und lade die Seite neu.'
    );
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
      data.error || `Garmin Connect-Sync fehlgeschlagen (HTTP ${res.status}).`
    );
  }

  if (!Array.isArray(data.days)) {
    throw new Error(
      data.error || 'Garmin Connect-Sync lieferte keine gültigen Tagesdaten.'
    );
  }

  return {
    provider: data.provider || 'garmin_connect',
    days: data.days,
    activities: Array.isArray(data.activities) ? data.activities : [],
    garminLastSyncAt: typeof data.garminLastSyncAt === 'number' ? data.garminLastSyncAt : null,
    syncedAt: typeof data.syncedAt === 'number' ? data.syncedAt : Date.now(),
  };
}

export async function disconnectHealthProvider(provider: 'garmin' = 'garmin'): Promise<void> {
  const token = getHealthSessionToken(provider);
  clearHealthSessionToken(provider);

  try {
    await fetch('/api/health/garmin/disconnect', {
      method: 'POST',
      credentials: 'same-origin',
      headers: token ? { 'x-health-session': token } : undefined,
    });
  } catch {
    // Ignore disconnect network errors
  }
}

export function calculateRecoveryMetrics(params: {
  sleepDurationMinutes: number;
  activityDurationMinutes: number;
  avgHeartRate?: number | null;
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  stressLevel?: number | null;
  bodyBattery?: number | null;
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
    activityPoints = 18 + Math.round((activity / 25) * 12);
  } else {
    const overLoad = activity - 75;
    const sleepBuffer = sleep >= 450 ? 0.12 : 0.25;
    activityPoints = Math.max(8, Math.round(33 - overLoad * sleepBuffer));
  }

  // 3. Optional Vital, Biometric & Mood Modifiers (subtle, bounded so absent fields don't distort)
  let modifier = 0;
  if (typeof params.avgHeartRate === 'number' && params.avgHeartRate >= 145 && sleep < 420) {
    modifier -= 6;
  }
  if (typeof params.restingHeartRate === 'number' && params.restingHeartRate > 0) {
    if (params.restingHeartRate <= 55) modifier += 3;
    else if (params.restingHeartRate >= 75) modifier -= 4;
  }
  if (typeof params.hrvMs === 'number' && params.hrvMs > 0) {
    if (params.hrvMs >= 65) modifier += 4;
    else if (params.hrvMs <= 28) modifier -= 5;
  }
  if (typeof params.stressLevel === 'number' && params.stressLevel >= 0) {
    if (params.stressLevel >= 65) modifier -= 5;
    else if (params.stressLevel <= 25) modifier += 2;
  }
  if (typeof params.bodyBattery === 'number' && params.bodyBattery >= 0) {
    if (params.bodyBattery >= 75) modifier += 4;
    else if (params.bodyBattery <= 25) modifier -= 5;
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
  overrideMetrics?: Partial<HealthDailyRecord>;
  extraSources?: HealthDataSource[];
  referenceDate?: Date;
}): HealthDailyRecord {
  const nowDate = params.referenceDate ?? new Date();
  const todayKey = format(nowDate, 'yyyy-MM-dd');
  const todayStartMs = startOfDay(nowDate).getTime();

  const sleepDurationMinutes =
    typeof params.overrideSleepMinutes === 'number'
      ? Math.max(0, Math.min(1440, Math.round(params.overrideSleepMinutes)))
      : Math.max(0, Math.min(1440, Math.round(params.existingRecord?.sleepDurationMinutes ?? 0)));

  const activityDurationMinutes =
    typeof params.overrideActivityMinutes === 'number'
      ? Math.max(0, Math.min(1440, Math.round(params.overrideActivityMinutes)))
      : Math.max(0, Math.min(1440, Math.round(params.existingRecord?.activityDurationMinutes ?? 0)));

  const sourcesSet = new Set<HealthDataSource>(
    (params.existingRecord?.sources || []).filter((s) => s === 'garmin_connect')
  );
  for (const s of params.extraSources || []) {
    sourcesSet.add(s);
  }
  if (sourcesSet.size === 0 && params.existingRecord) {
    sourcesSet.add('garmin_connect');
  }

  const todayMood =
    params.diaryEntries.find((e) => isSameDay(new Date(e.date), nowDate))?.mood ?? null;
  const avgHeartRate =
    typeof params.overrideAvgHeartRate === 'number'
      ? Math.round(params.overrideAvgHeartRate)
      : params.overrideMetrics?.avgHeartRate ?? params.existingRecord?.avgHeartRate ?? null;

  const pickOpt = (
    overrideVal: number | null | undefined,
    existingVal: number | null | undefined
  ): number | null => {
    if (typeof overrideVal === 'number' && Number.isFinite(overrideVal)) return overrideVal;
    if (typeof existingVal === 'number' && Number.isFinite(existingVal)) return existingVal;
    return null;
  };
  const om = params.overrideMetrics;
  const ex = params.existingRecord;

  const sleepDeepMinutes = pickOpt(om?.sleepDeepMinutes, ex?.sleepDeepMinutes);
  const sleepLightMinutes = pickOpt(om?.sleepLightMinutes, ex?.sleepLightMinutes);
  const sleepRemMinutes = pickOpt(om?.sleepRemMinutes, ex?.sleepRemMinutes);
  const sleepAwakeMinutes = pickOpt(om?.sleepAwakeMinutes, ex?.sleepAwakeMinutes);
  const steps = pickOpt(om?.steps, ex?.steps);
  const distanceMeters = pickOpt(om?.distanceMeters, ex?.distanceMeters);
  const caloriesActive = pickOpt(om?.caloriesActive, ex?.caloriesActive);
  const floorsClimbed = pickOpt(om?.floorsClimbed, ex?.floorsClimbed);
  const heartPoints = pickOpt(om?.heartPoints, ex?.heartPoints);
  const workoutsCount = pickOpt(om?.workoutsCount, ex?.workoutsCount);
  const restingHeartRate = pickOpt(om?.restingHeartRate, ex?.restingHeartRate);
  const hrvMs = pickOpt(om?.hrvMs, ex?.hrvMs);
  const stressLevel = pickOpt(om?.stressLevel, ex?.stressLevel);
  const bodyBattery = pickOpt(om?.bodyBattery, ex?.bodyBattery);
  const spo2Percent = pickOpt(om?.spo2Percent, ex?.spo2Percent);
  const respirationRate = pickOpt(om?.respirationRate, ex?.respirationRate);
  const vo2Max = pickOpt(om?.vo2Max, ex?.vo2Max);
  const weightKg = pickOpt(om?.weightKg, ex?.weightKg);
  const bodyFatPercent = pickOpt(om?.bodyFatPercent, ex?.bodyFatPercent);
  const hydrationMl = pickOpt(om?.hydrationMl, ex?.hydrationMl);

  const { recoveryScore, recoveryState } = calculateRecoveryMetrics({
    sleepDurationMinutes,
    activityDurationMinutes,
    avgHeartRate,
    restingHeartRate,
    hrvMs,
    stressLevel,
    bodyBattery,
    todayMood,
  });

  return {
    id: todayKey,
    date: todayStartMs,
    sleepDurationMinutes,
    activityDurationMinutes,
    avgHeartRate,
    sleepDeepMinutes,
    sleepLightMinutes,
    sleepRemMinutes,
    sleepAwakeMinutes,
    steps,
    distanceMeters,
    caloriesActive,
    floorsClimbed,
    heartPoints,
    workoutsCount,
    restingHeartRate,
    hrvMs,
    stressLevel,
    bodyBattery,
    spo2Percent,
    respirationRate,
    vo2Max,
    weightKg,
    bodyFatPercent,
    hydrationMl,
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
