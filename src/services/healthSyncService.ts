import {
  DiaryEntry,
  EnergyRecoverySuggestion,
  FocusSession,
  HealthDailyRecord,
  HealthDataSource,
  HealthMetricKey,
  Quest,
  RecoveryState,
} from '@/types';
import { format, isSameDay, startOfDay } from 'date-fns';
import {
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/firebase';

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
  backendAvailable?: boolean;
  garmin: {
    configured: boolean;
    connected: boolean;
    authMode?: 'api_key' | 'oauth' | null;
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
    providers: 'Aura (aus Schlaf, Aktivität, HRV, Puls)',
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
    providers: 'Google Health · Garmin',
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
    providers: 'Google Health · Garmin · Aura',
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
    providers: 'Google Health · Garmin',
    description: 'Gezählte Tagesschritte',
    defaultVisible: true,
  },
  {
    key: 'distanceMeters',
    label: 'Distanz',
    shortLabel: 'Distanz',
    category: 'activity',
    unit: 'km',
    providers: 'Google Health · Garmin',
    description: 'Zurückgelegte Lauf-, Geh- oder Trainingsstrecke',
    defaultVisible: true,
  },
  {
    key: 'caloriesActive',
    label: 'Aktivkalorien',
    shortLabel: 'Kalorien',
    category: 'activity',
    unit: 'kcal',
    providers: 'Google Health · Garmin',
    description: 'Durch Bewegung und Training verbrannte Energie',
    defaultVisible: true,
  },
  {
    key: 'floorsClimbed',
    label: 'Etagen',
    shortLabel: 'Etagen',
    category: 'activity',
    unit: 'Etagen',
    providers: 'Google Health v4 · Garmin',
    description: 'Gestiegene Stockwerke bzw. Höhenmeter-Äquivalent',
    defaultVisible: true,
  },
  {
    key: 'heartPoints',
    label: 'Kardiopunkte',
    shortLabel: 'Kardio-Pkt',
    category: 'activity',
    unit: 'Pkt',
    providers: 'Google Fit · Garmin Intensität',
    description: 'Google Fit Kardiopunkte bzw. Garmin Intensitätsminuten',
    defaultVisible: true,
  },
  {
    key: 'workoutsCount',
    label: 'Workouts',
    shortLabel: 'Workouts',
    category: 'activity',
    unit: 'Einheiten',
    providers: 'Google Health · Garmin',
    description: 'Anzahl erfasster Trainingseinheiten am Tag',
    defaultVisible: true,
  },
  {
    key: 'restingHeartRate',
    label: 'Ruhepuls',
    shortLabel: 'Ruhepuls',
    category: 'recovery_heart',
    unit: 'BPM',
    providers: 'Google Health · Garmin',
    description: 'Ruheherzfrequenz als wichtiger Erholungsindikator',
    defaultVisible: true,
  },
  {
    key: 'avgHeartRate',
    label: 'Durchschnittspuls',
    shortLabel: 'Ø Puls',
    category: 'recovery_heart',
    unit: 'BPM',
    providers: 'Google Health · Garmin · Bluetooth',
    description: 'Mittlere Herzfrequenz über Tag oder Training',
    defaultVisible: true,
  },
  {
    key: 'hrvMs',
    label: 'HRV (rMSSD)',
    shortLabel: 'HRV',
    category: 'recovery_heart',
    unit: 'ms',
    providers: 'Google Health v4 · Garmin',
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
    providers: 'Google Health · Garmin',
    description: 'Körperlich regenerierende Tiefschlafphase',
    defaultVisible: true,
  },
  {
    key: 'sleepRemMinutes',
    label: 'REM-Schlaf',
    shortLabel: 'REM',
    category: 'sleep',
    unit: 'Std/Min',
    providers: 'Google Health · Garmin',
    description: 'Kognitiv & emotional verarbeitender REM-Schlaf',
    defaultVisible: true,
  },
  {
    key: 'sleepLightMinutes',
    label: 'Leichtschlaf',
    shortLabel: 'Leicht',
    category: 'sleep',
    unit: 'Std/Min',
    providers: 'Google Health · Garmin',
    description: 'Basis-Schlafphase zwischen Wachzustand und Tief-/REM-Schlaf',
    defaultVisible: true,
  },
  {
    key: 'sleepAwakeMinutes',
    label: 'Wachzeit im Schlaf',
    shortLabel: 'Wach',
    category: 'sleep',
    unit: 'Min',
    providers: 'Google Health · Garmin',
    description: 'Unterbrechungen bzw. Wachphasen während der Nacht',
    defaultVisible: true,
  },
  {
    key: 'spo2Percent',
    label: 'Blutsauerstoff (SpO₂)',
    shortLabel: 'SpO₂',
    category: 'body',
    unit: '%',
    providers: 'Google Health · Garmin',
    description: 'Sauerstoffsättigung des Blutes',
    defaultVisible: true,
  },
  {
    key: 'respirationRate',
    label: 'Atemfrequenz',
    shortLabel: 'Atmung',
    category: 'body',
    unit: '/Min',
    providers: 'Google Health v4 · Garmin',
    description: 'Atemzüge pro Minute im Ruhezustand / Schlaf',
    defaultVisible: true,
  },
  {
    key: 'vo2Max',
    label: 'VO₂ max',
    shortLabel: 'VO₂ max',
    category: 'body',
    unit: 'ml/kg/min',
    providers: 'Google Health v4 · Garmin',
    description: 'Maximale Sauerstoffaufnahme (Ausdauerfitness-Index)',
    defaultVisible: true,
  },
  {
    key: 'weightKg',
    label: 'Körpergewicht',
    shortLabel: 'Gewicht',
    category: 'body',
    unit: 'kg',
    providers: 'Google Health · Garmin',
    description: 'Erfasstes Körpergewicht',
    defaultVisible: true,
  },
  {
    key: 'bodyFatPercent',
    label: 'Körperfett',
    shortLabel: 'Körperfett',
    category: 'body',
    unit: '%',
    providers: 'Google Health · Garmin',
    description: 'Körperfettanteil in Prozent',
    defaultVisible: true,
  },
  {
    key: 'hydrationMl',
    label: 'Hydration / Wasser',
    shortLabel: 'Wasser',
    category: 'body',
    unit: 'L',
    providers: 'Google Health',
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
  provider: 'garmin_connect' | 'google_health';
  apiMode?: GoogleHealthApiMode;
  days: RemoteHealthDayMetric[];
  syncedAt: number;
}

// Strict in-memory token cache (never stored in localStorage/sessionStorage)
const inMemoryHealthSessions = new Map<'garmin' | 'google', string>();

const CLIENT_GOOGLE_SESSION_MARKER = '__firebase_client_oauth__';

interface ClientGoogleOAuthSession {
  accessToken: string;
  apiMode: GoogleHealthApiMode;
  connectedAt: number;
  expiresAt: number;
}

let clientGoogleOAuthSession: ClientGoogleOAuthSession | null = null;
let cachedBackendAvailable: boolean | null = null;

function hasValidClientGoogleSession(): boolean {
  return Boolean(clientGoogleOAuthSession && Date.now() < clientGoogleOAuthSession.expiresAt);
}

export function setHealthSessionToken(provider: 'garmin' | 'google', token: string): void {
  inMemoryHealthSessions.set(provider, token);
}

export function getHealthSessionToken(provider: 'garmin' | 'google'): string | null {
  if (provider === 'google' && hasValidClientGoogleSession()) {
    return CLIENT_GOOGLE_SESSION_MARKER;
  }
  return inMemoryHealthSessions.get(provider) || null;
}

export function clearHealthSessionToken(provider: 'garmin' | 'google'): void {
  inMemoryHealthSessions.delete(provider);
  if (provider === 'google') {
    clientGoogleOAuthSession = null;
  }
}

function buildStaticLiveStatus(): HealthProvidersStatus {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const validClientSession = hasValidClientGoogleSession() ? clientGoogleOAuthSession : null;
  return {
    backendAvailable: false,
    garmin: {
      configured: false,
      connected: false,
      authMode: null,
      callbackUrl: `${origin}/api/health/garmin/callback`,
      connectedAt: null,
    },
    google: {
      configured: true,
      connected: Boolean(validClientSession),
      apiMode: validClientSession?.apiMode || null,
      callbackUrl: `${origin}/api/health/google/callback`,
      connectedAt: validClientSession?.connectedAt || null,
    },
  };
}

export async function fetchHealthProvidersStatus(): Promise<HealthProvidersStatus> {
  try {
    const res = await fetch('/api/health/providers/status', {
      credentials: 'include',
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.status === 404 || !contentType.includes('application/json')) {
      cachedBackendAvailable = false;
      return buildStaticLiveStatus();
    }
    if (!res.ok) {
      throw new Error(`Status der Health-Provider konnte nicht geladen werden (HTTP ${res.status}).`);
    }
    cachedBackendAvailable = true;
    const json = (await res.json()) as HealthProvidersStatus;
    return {
      ...json,
      backendAvailable: true,
    };
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      cachedBackendAvailable = false;
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

async function connectGoogleHealthViaFirebasePopup(
  googleApiMode: GoogleHealthApiMode
): Promise<void> {
  const provider = new GoogleAuthProvider();
  const scopes =
    googleApiMode === 'google_fit'
      ? [
          'https://www.googleapis.com/auth/fitness.activity.read',
          'https://www.googleapis.com/auth/fitness.sleep.read',
          'https://www.googleapis.com/auth/fitness.heart_rate.read',
          'https://www.googleapis.com/auth/fitness.body.read',
          'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
          'https://www.googleapis.com/auth/fitness.nutrition.read',
        ]
      : [
          'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
          'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
          'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
        ];

  for (const scope of scopes) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
  });

  try {
    const currentUser = auth.currentUser;
    let result;
    if (currentUser) {
      const hasGoogleProvider = currentUser.providerData.some(
        (p) => p.providerId === 'google.com'
      );
      result = hasGoogleProvider
        ? await reauthenticateWithPopup(currentUser, provider)
        : await linkWithPopup(currentUser, provider);
    } else {
      result = await signInWithPopup(auth, provider);
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    if (!accessToken) {
      throw new Error(
        'Google hat kein Access-Token zurückgegeben. Bitte erteile im Anmeldefenster alle Gesundheits-Berechtigungen.'
      );
    }

    const connectedAt = Date.now();
    clientGoogleOAuthSession = {
      accessToken,
      apiMode: googleApiMode,
      connectedAt,
      expiresAt: connectedAt + 50 * 60 * 1000,
    };
    setHealthSessionToken('google', CLIENT_GOOGLE_SESSION_MARKER);

    window.postMessage(
      {
        type: 'HEALTH_OAUTH_SUCCESS',
        provider: 'google',
        apiMode: googleApiMode,
        sessionToken: CLIENT_GOOGLE_SESSION_MARKER,
        connectedAt,
      },
      window.location.origin
    );
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Das Anmelde-Fenster wurde blockiert. Bitte erlaube Popups für diese Seite.'
      );
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google Health-Anmeldung wurde abgebrochen.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'Diese Live-Domain ist in Firebase Authentication noch nicht unter Autorisierte Domains freigegeben.'
      );
    }
    if (code === 'auth/user-mismatch') {
      throw new Error(
        'Bitte wähle im Google-Fenster dasselbe Google-Konto aus, mit dem du in Aura angemeldet bist.'
      );
    }
    if (code === 'auth/credential-already-in-use') {
      throw new Error(
        'Dieses Google-Konto ist bereits mit einem anderen Aura-Konto verknüpft. Bitte melde dich mit deinem Google-Konto an.'
      );
    }
    throw error instanceof Error
      ? error
      : new Error('Google Health-Anmeldung fehlgeschlagen.');
  }
}

export async function openHealthProviderOAuthPopup(
  provider: 'garmin' | 'google',
  googleApiMode: GoogleHealthApiMode = 'google_health'
): Promise<void> {
  if (provider === 'google' && cachedBackendAvailable === false) {
    await connectGoogleHealthViaFirebasePopup(googleApiMode);
    return;
  }

  const endpoint =
    provider === 'garmin'
      ? '/api/health/garmin/auth-url'
      : `/api/health/google/auth-url?api=${encodeURIComponent(googleApiMode)}`;

  let res: globalThis.Response;
  try {
    res = await fetch(endpoint, {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    if (provider === 'google') {
      cachedBackendAvailable = false;
      await connectGoogleHealthViaFirebasePopup(googleApiMode);
      return;
    }
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
    provider === 'google' &&
    (res.status === 404 || contentType.includes('text/html') || rawText.trim().startsWith('<'))
  ) {
    cachedBackendAvailable = false;
    await connectGoogleHealthViaFirebasePopup(googleApiMode);
    return;
  } else if (contentType.includes('text/html') || rawText.trim().startsWith('<')) {
    throw new Error(
      `OAuth-Endpunkt hat HTML statt JSON geliefert (HTTP ${res.status}). Bitte App neu laden oder als Node-Server veröffentlichen.`
    );
  }

  if (provider === 'google' && res.status === 404 && !data.url && data.configured !== false) {
    cachedBackendAvailable = false;
    await connectGoogleHealthViaFirebasePopup(googleApiMode);
    return;
  }

  if (data.configured === false) {
    const fallbackCallback =
      data.callbackUrl || `${window.location.origin}/api/health/${provider}/callback`;
    throw new ProviderNotConfiguredError(
      data.error || 'Zugangsdaten fehlen in den Server-Secrets.',
      fallbackCallback
    );
  }

  if (provider === 'garmin' && data.mode === 'api_key' && data.connected) {
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

interface ClientTimeInterval {
  start: number;
  end: number;
}

function mergeClientTimeIntervals(intervals: ClientTimeInterval[]): ClientTimeInterval[] {
  const valid = intervals
    .filter((iv) => Number.isFinite(iv.start) && Number.isFinite(iv.end) && iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
  if (valid.length === 0) return [];
  const merged: ClientTimeInterval[] = [{ ...valid[0] }];
  for (let i = 1; i < valid.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = valid[i];
    if (cur.start <= prev.end) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function subtractClientTimeIntervals(
  base: ClientTimeInterval[],
  subtract: ClientTimeInterval[]
): ClientTimeInterval[] {
  if (base.length === 0 || subtract.length === 0) return base;
  let current = base;
  for (const sub of subtract) {
    const next: ClientTimeInterval[] = [];
    for (const b of current) {
      if (sub.end <= b.start || sub.start >= b.end) {
        next.push(b);
      } else {
        if (sub.start > b.start) next.push({ start: b.start, end: sub.start });
        if (sub.end < b.end) next.push({ start: sub.end, end: b.end });
      }
    }
    current = next;
  }
  return current;
}

function getLocalDayAlignedStartMs(endMs: number, daysCount: number): number {
  const d = new Date(endMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime() - Math.max(0, daysCount - 1) * 86_400_000;
}

function toClientDateKey(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface ClientDayAccumulator {
  sleepMinutes: number;
  activityMinutes: number;
  hrValues: number[];
  sleepDeepMinutes: number | null;
  sleepLightMinutes: number | null;
  sleepRemMinutes: number | null;
  sleepAwakeMinutes: number | null;
  steps: number | null;
  distanceMeters: number | null;
  caloriesActive: number | null;
  floorsClimbed: number | null;
  heartPoints: number | null;
  workoutsCount: number | null;
  restingHrValues: number[];
  hrvValues: number[];
  stressValues: number[];
  bodyBatteryValues: number[];
  spo2Values: number[];
  respirationValues: number[];
  vo2MaxValues: number[];
  weightKg: number | null;
  bodyFatPercent: number | null;
  hydrationMl: number | null;
}

interface ClientDayMetricPartial {
  sleepMinutes?: number;
  activityMinutes?: number;
  avgHeartRate?: number | null;
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

function createClientAccumulator(): ClientDayAccumulator {
  return {
    sleepMinutes: 0,
    activityMinutes: 0,
    hrValues: [],
    sleepDeepMinutes: null,
    sleepLightMinutes: null,
    sleepRemMinutes: null,
    sleepAwakeMinutes: null,
    steps: null,
    distanceMeters: null,
    caloriesActive: null,
    floorsClimbed: null,
    heartPoints: null,
    workoutsCount: null,
    restingHrValues: [],
    hrvValues: [],
    stressValues: [],
    bodyBatteryValues: [],
    spo2Values: [],
    respirationValues: [],
    vo2MaxValues: [],
    weightKg: null,
    bodyFatPercent: null,
    hydrationMl: null,
  };
}

function mergeClientDayMetric(
  map: Map<string, ClientDayAccumulator>,
  dateKey: string,
  partial: ClientDayMetricPartial
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
  const entry = map.get(dateKey) || createClientAccumulator();
  const maxInt = (
    cur: number | null,
    next: number | null | undefined,
    min: number,
    max: number
  ): number | null => {
    if (typeof next !== 'number' || !Number.isFinite(next)) return cur;
    const clamped = Math.max(min, Math.min(max, Math.round(next)));
    return cur === null ? clamped : Math.max(cur, clamped);
  };

  if (typeof partial.sleepMinutes === 'number' && Number.isFinite(partial.sleepMinutes)) {
    entry.sleepMinutes = Math.min(
      1440,
      Math.max(entry.sleepMinutes, Math.round(partial.sleepMinutes))
    );
  }
  if (typeof partial.activityMinutes === 'number' && Number.isFinite(partial.activityMinutes)) {
    entry.activityMinutes = Math.min(
      1440,
      Math.max(entry.activityMinutes, Math.round(partial.activityMinutes))
    );
  }
  if (
    typeof partial.avgHeartRate === 'number' &&
    Number.isFinite(partial.avgHeartRate) &&
    partial.avgHeartRate >= 25 &&
    partial.avgHeartRate <= 240
  ) {
    entry.hrValues.push(partial.avgHeartRate);
  }

  entry.sleepDeepMinutes = maxInt(entry.sleepDeepMinutes, partial.sleepDeepMinutes, 0, 1440);
  entry.sleepLightMinutes = maxInt(entry.sleepLightMinutes, partial.sleepLightMinutes, 0, 1440);
  entry.sleepRemMinutes = maxInt(entry.sleepRemMinutes, partial.sleepRemMinutes, 0, 1440);
  entry.sleepAwakeMinutes = maxInt(entry.sleepAwakeMinutes, partial.sleepAwakeMinutes, 0, 1440);
  entry.steps = maxInt(entry.steps, partial.steps, 0, 500000);
  entry.distanceMeters = maxInt(entry.distanceMeters, partial.distanceMeters, 0, 1000000);
  entry.caloriesActive = maxInt(entry.caloriesActive, partial.caloriesActive, 0, 50000);
  entry.floorsClimbed = maxInt(entry.floorsClimbed, partial.floorsClimbed, 0, 10000);
  entry.heartPoints = maxInt(entry.heartPoints, partial.heartPoints, 0, 5000);
  entry.workoutsCount = maxInt(entry.workoutsCount, partial.workoutsCount, 0, 100);
  entry.hydrationMl = maxInt(entry.hydrationMl, partial.hydrationMl, 0, 30000);

  if (
    typeof partial.restingHeartRate === 'number' &&
    Number.isFinite(partial.restingHeartRate) &&
    partial.restingHeartRate >= 25 &&
    partial.restingHeartRate <= 220
  ) {
    entry.restingHrValues.push(partial.restingHeartRate);
  }
  if (
    typeof partial.hrvMs === 'number' &&
    Number.isFinite(partial.hrvMs) &&
    partial.hrvMs > 0 &&
    partial.hrvMs <= 500
  ) {
    entry.hrvValues.push(partial.hrvMs);
  }
  if (
    typeof partial.stressLevel === 'number' &&
    Number.isFinite(partial.stressLevel) &&
    partial.stressLevel >= 0 &&
    partial.stressLevel <= 100
  ) {
    entry.stressValues.push(partial.stressLevel);
  }
  if (
    typeof partial.bodyBattery === 'number' &&
    Number.isFinite(partial.bodyBattery) &&
    partial.bodyBattery >= 0 &&
    partial.bodyBattery <= 100
  ) {
    entry.bodyBatteryValues.push(partial.bodyBattery);
  }
  if (
    typeof partial.spo2Percent === 'number' &&
    Number.isFinite(partial.spo2Percent) &&
    partial.spo2Percent >= 50 &&
    partial.spo2Percent <= 100
  ) {
    entry.spo2Values.push(partial.spo2Percent);
  }
  if (
    typeof partial.respirationRate === 'number' &&
    Number.isFinite(partial.respirationRate) &&
    partial.respirationRate >= 4 &&
    partial.respirationRate <= 80
  ) {
    entry.respirationValues.push(partial.respirationRate);
  }
  if (
    typeof partial.vo2Max === 'number' &&
    Number.isFinite(partial.vo2Max) &&
    partial.vo2Max >= 10 &&
    partial.vo2Max <= 110
  ) {
    entry.vo2MaxValues.push(partial.vo2Max);
  }
  if (
    typeof partial.weightKg === 'number' &&
    Number.isFinite(partial.weightKg) &&
    partial.weightKg >= 20 &&
    partial.weightKg <= 400
  ) {
    entry.weightKg = Math.round(partial.weightKg * 10) / 10;
  }
  if (
    typeof partial.bodyFatPercent === 'number' &&
    Number.isFinite(partial.bodyFatPercent) &&
    partial.bodyFatPercent >= 1 &&
    partial.bodyFatPercent <= 75
  ) {
    entry.bodyFatPercent = Math.round(partial.bodyFatPercent * 10) / 10;
  }

  map.set(dateKey, entry);
}

function finalizeClientDayMap(map: Map<string, ClientDayAccumulator>): RemoteHealthDayMetric[] {
  const avgRound = (arr: number[], decimals = 0): number | null => {
    if (arr.length === 0) return null;
    const mean = arr.reduce((s, n) => s + n, 0) / arr.length;
    const factor = 10 ** decimals;
    return Math.round(mean * factor) / factor;
  };
  return Array.from(map.entries())
    .map(([dateKey, v]) => ({
      dateKey,
      sleepDurationMinutes: Math.max(0, Math.min(1440, Math.round(v.sleepMinutes))),
      activityDurationMinutes: Math.max(0, Math.min(1440, Math.round(v.activityMinutes))),
      avgHeartRate: avgRound(v.hrValues, 0),
      sleepDeepMinutes: v.sleepDeepMinutes,
      sleepLightMinutes: v.sleepLightMinutes,
      sleepRemMinutes: v.sleepRemMinutes,
      sleepAwakeMinutes: v.sleepAwakeMinutes,
      steps: v.steps,
      distanceMeters: v.distanceMeters,
      caloriesActive: v.caloriesActive,
      floorsClimbed: v.floorsClimbed,
      heartPoints: v.heartPoints,
      workoutsCount: v.workoutsCount,
      restingHeartRate: avgRound(v.restingHrValues, 0),
      hrvMs: avgRound(v.hrvValues, 1),
      stressLevel: avgRound(v.stressValues, 0),
      bodyBattery: avgRound(v.bodyBatteryValues, 0),
      spo2Percent: avgRound(v.spo2Values, 1),
      respirationRate: avgRound(v.respirationValues, 1),
      vo2Max: avgRound(v.vo2MaxValues, 1),
      weightKg: v.weightKg,
      bodyFatPercent: v.bodyFatPercent,
      hydrationMl: v.hydrationMl,
    }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

async function parseClientGoogleApiError(
  resp: globalThis.Response,
  apiLabel: string
): Promise<string> {
  const raw = await resp.text().catch(() => '');
  let message = '';
  let reason = '';
  let activationUrl = '';

  try {
    const json = JSON.parse(raw) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string }>;
        details?: Array<{ metadata?: { activationUrl?: string }; reason?: string }>;
      };
    };
    message = json?.error?.message || '';
    reason =
      json?.error?.errors?.[0]?.reason ||
      json?.error?.details?.find((d) => d.reason)?.reason ||
      json?.error?.status ||
      '';
    activationUrl =
      json?.error?.details?.find((d) => d.metadata?.activationUrl)?.metadata?.activationUrl || '';
  } catch {
    message = raw.slice(0, 200);
  }

  const lower = `${message} ${reason}`.toLowerCase();
  if (
    lower.includes('servicedisabled') ||
    lower.includes('service_disabled') ||
    lower.includes('accessnotconfigured') ||
    lower.includes('has not been used in project') ||
    lower.includes('it is disabled')
  ) {
    const linkHint = activationUrl ? ` (${activationUrl})` : '';
    return `${apiLabel} ist in deinem Google Cloud Projekt nicht aktiviert. Bitte aktiviere die API in Google Cloud${linkHint}.`;
  }
  if (
    lower.includes('insufficient') ||
    lower.includes('scope') ||
    lower.includes('insufficientpermissions')
  ) {
    return `Fehlende Google-Berechtigungen (HTTP ${resp.status}). Bitte trenne Google Health kurz und setze beim erneuten Verbinden alle Häkchen.`;
  }
  return `${apiLabel} Zugriff verweigert (HTTP ${resp.status})${
    message ? `: ${message}` : '. Bitte API-Aktivierung in Google Cloud prüfen.'
  }`;
}

async function fetchGoogleHealthV4PagedClient(
  baseUrl: string,
  headers: Record<string, string>
): Promise<{
  ok: boolean;
  status: number;
  resp?: globalThis.Response;
  dataPoints: Array<Record<string, any>>;
}> {
  const dataPoints: Array<Record<string, any>> = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${sep}pageSize=100${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    }`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      if (page === 0) return { ok: false, status: resp.status, resp, dataPoints };
      break;
    }
    const json = (await resp.json()) as {
      dataPoints?: Array<Record<string, any>>;
      nextPageToken?: string;
    };
    if (Array.isArray(json.dataPoints)) {
      dataPoints.push(...json.dataPoints);
    }
    if (!json.nextPageToken) {
      return { ok: true, status: resp.status, dataPoints };
    }
    pageToken = json.nextPageToken;
  }
  return { ok: true, status: 200, dataPoints };
}

async function fetchGoogleHealthV4MetricsClient(
  accessToken: string,
  startMs: number,
  endMs: number
): Promise<RemoteHealthDayMetric[]> {
  const sleepQueryStartMs = startMs - 18 * 3600 * 1000;
  const startIso = new Date(sleepQueryStartMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
  const dayMap = new Map<string, ClientDayAccumulator>();
  const authErrors: string[] = [];
  let succeededCount = 0;

  let sleepDataPoints: Array<Record<string, any>> = [];
  const sleepReconcileUrl = `https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints:reconcile?filter=${encodeURIComponent(
    `sleep.interval.end_time>="${startIso}" AND sleep.interval.end_time<="${endIso}"`
  )}`;
  const sleepRes = await fetchGoogleHealthV4PagedClient(sleepReconcileUrl, headers);
  if (sleepRes.ok) {
    succeededCount += 1;
    sleepDataPoints = sleepRes.dataPoints;
  } else {
    const rawSleepRes = await fetchGoogleHealthV4PagedClient(
      'https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints',
      headers
    );
    if (rawSleepRes.ok) {
      succeededCount += 1;
      sleepDataPoints = rawSleepRes.dataPoints;
    } else if (rawSleepRes.resp && (rawSleepRes.status === 401 || rawSleepRes.status === 403)) {
      authErrors.push(await parseClientGoogleApiError(rawSleepRes.resp, 'Google Health API v4'));
    }
  }

  const sleepSessions: Array<{
    start: number;
    end: number;
    mins: number;
    deep: number;
    light: number;
    rem: number;
    awake: number;
    dateKey: string;
  }> = [];
  for (const dp of sleepDataPoints) {
    const sleep = dp.sleep || dp;
    const endTime = sleep?.interval?.endTime || sleep?.interval?.end_time;
    const startTime = sleep?.interval?.startTime || sleep?.interval?.start_time;
    const endParsed = endTime ? Date.parse(endTime) : NaN;
    const startParsed = startTime ? Date.parse(startTime) : endParsed;
    if (Number.isNaN(endParsed) || endParsed < startMs || endParsed > endMs) continue;
    const dateKey = toClientDateKey(endParsed);

    let deepMs = 0;
    let lightMs = 0;
    let remMs = 0;
    let awakeMs = 0;
    let asleepStageMs = 0;

    if (Array.isArray(sleep?.stages)) {
      for (const stage of sleep.stages) {
        const type = String(stage.type || stage.stageType || '').toLowerCase();
        const s = Date.parse(stage.interval?.startTime || stage.startTime || '');
        const e = Date.parse(stage.interval?.endTime || stage.endTime || '');
        if (Number.isNaN(s) || Number.isNaN(e) || e <= s) continue;
        const dur = e - s;
        if (type.includes('awake') || type.includes('out_of_bed')) {
          awakeMs += dur;
        } else {
          asleepStageMs += dur;
          if (type.includes('deep')) deepMs += dur;
          else if (type.includes('rem')) remMs += dur;
          else if (type.includes('light')) lightMs += dur;
        }
      }
    }

    let mins = Number(sleep?.summary?.minutesAsleep ?? sleep?.summary?.minutes_asleep ?? 0);
    if (!mins && asleepStageMs > 0) {
      mins = Math.round(asleepStageMs / 60_000);
    }
    if (!mins && !Number.isNaN(startParsed) && endParsed > startParsed) {
      mins = Math.round((endParsed - startParsed) / 60_000);
    }
    if (mins <= 0) continue;

    const deep = Math.round(deepMs / 60_000);
    const light = Math.round(lightMs / 60_000);
    const rem = Math.round(remMs / 60_000);
    const awake = Math.round(awakeMs / 60_000);

    const sMs = !Number.isNaN(startParsed) ? startParsed : endParsed - mins * 60_000;
    const overlapIdx = sleepSessions.findIndex((existing) => {
      const ov = Math.min(existing.end, endParsed) - Math.max(existing.start, sMs);
      const minLen = Math.min(existing.end - existing.start, endParsed - sMs);
      return minLen > 0 && ov / minLen >= 0.45;
    });
    if (overlapIdx >= 0) {
      const prev = sleepSessions[overlapIdx];
      const hasStages = deep + light + rem > 0;
      const prevHasStages = prev.deep + prev.light + prev.rem > 0;
      if ((hasStages && !prevHasStages) || mins > prev.mins) {
        sleepSessions[overlapIdx] = {
          start: sMs,
          end: endParsed,
          mins,
          deep,
          light,
          rem,
          awake,
          dateKey,
        };
      }
    } else {
      sleepSessions.push({ start: sMs, end: endParsed, mins, deep, light, rem, awake, dateKey });
    }
  }

  const sleepByDay = new Map<
    string,
    { mins: number; deep: number; light: number; rem: number; awake: number }
  >();
  for (const sess of sleepSessions) {
    const prev = sleepByDay.get(sess.dateKey) || { mins: 0, deep: 0, light: 0, rem: 0, awake: 0 };
    sleepByDay.set(sess.dateKey, {
      mins: prev.mins + sess.mins,
      deep: prev.deep + sess.deep,
      light: prev.light + sess.light,
      rem: prev.rem + sess.rem,
      awake: prev.awake + sess.awake,
    });
  }
  for (const [dateKey, v] of sleepByDay.entries()) {
    mergeClientDayMetric(dayMap, dateKey, {
      sleepMinutes: v.mins,
      sleepDeepMinutes: v.deep > 0 ? v.deep : null,
      sleepLightMinutes: v.light > 0 ? v.light : null,
      sleepRemMinutes: v.rem > 0 ? v.rem : null,
      sleepAwakeMinutes: v.awake > 0 ? v.awake : null,
    });
  }

  const [
    activeRes,
    exerciseRes,
    hrRes,
    stepsRes,
    distRes,
    calRes,
    floorsRes,
    rhrRes,
    hrvRes,
    spo2Res,
    respRes,
    vo2Res,
    weightRes,
    bodyFatRes,
    hydrationRes,
  ] = await Promise.all([
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/active-minutes/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/heart-rate/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/distance/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/active-calories-burned/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/floors-climbed/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/resting-heart-rate/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/heart-rate-variability/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/oxygen-saturation/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/respiratory-rate/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/vo2-max/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/weight/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/body-fat/dataPoints', headers),
    fetchGoogleHealthV4PagedClient('https://health.googleapis.com/v4/users/me/dataTypes/hydration/dataPoints', headers),
  ]);

  const sumByDay = async (
    res: { ok: boolean; status: number; resp?: globalThis.Response; dataPoints: Array<Record<string, any>> },
    extractor: (dp: Record<string, any>) => { ts: number; val: number } | null,
    assign: (dk: string, sum: number) => void,
    isCritical = false
  ) => {
    if (!res.ok) {
      if (isCritical && res.resp && (res.status === 401 || res.status === 403)) {
        authErrors.push(await parseClientGoogleApiError(res.resp, 'Google Health API v4'));
      }
      return;
    }
    succeededCount += 1;
    const totals = new Map<string, number>();
    for (const dp of res.dataPoints) {
      const parsed = extractor(dp);
      if (!parsed || Number.isNaN(parsed.ts) || parsed.ts < startMs || parsed.ts > endMs || parsed.val <= 0) {
        continue;
      }
      const dk = toClientDateKey(parsed.ts);
      totals.set(dk, (totals.get(dk) || 0) + parsed.val);
    }
    for (const [dk, sum] of totals.entries()) {
      assign(dk, sum);
    }
  };

  await sumByDay(
    activeRes,
    (dp) => {
      const am = dp.activeMinutes || dp.active_minutes || dp;
      const ts = Date.parse(am?.interval?.endTime || am?.interval?.end_time || dp.endTime || '');
      const val = Number(am?.minutes ?? am?.activeMinutes ?? am?.value ?? 0);
      return { ts, val };
    },
    (dk, sum) => mergeClientDayMetric(dayMap, dk, { activityMinutes: sum }),
    true
  );

  if (exerciseRes.ok) {
    succeededCount += 1;
    const exByDay = new Map<string, { mins: number; count: number }>();
    for (const dp of exerciseRes.dataPoints) {
      const ex = dp.exercise || dp;
      const s = Date.parse(ex?.interval?.startTime || ex?.interval?.start_time || '');
      const e = Date.parse(ex?.interval?.endTime || ex?.interval?.end_time || '');
      if (Number.isNaN(s) || Number.isNaN(e) || e < startMs || e > endMs || e <= s) continue;
      const dk = toClientDateKey(e);
      const prev = exByDay.get(dk) || { mins: 0, count: 0 };
      exByDay.set(dk, { mins: prev.mins + Math.round((e - s) / 60_000), count: prev.count + 1 });
    }
    for (const [dk, v] of exByDay.entries()) {
      mergeClientDayMetric(dayMap, dk, { activityMinutes: v.mins, workoutsCount: v.count });
    }
  } else if (exerciseRes.resp && (exerciseRes.status === 401 || exerciseRes.status === 403)) {
    authErrors.push(await parseClientGoogleApiError(exerciseRes.resp, 'Google Health API v4'));
  }

  if (hrRes.ok) {
    succeededCount += 1;
    for (const dp of hrRes.dataPoints) {
      const hr = dp.heartRate || dp.heart_rate || dp;
      const parsed = Date.parse(hr?.sampleTime || hr?.interval?.endTime || hr?.time || '');
      const bpm = Number(hr?.beatsPerMinute ?? hr?.bpm ?? 0);
      if (!Number.isNaN(parsed) && parsed >= startMs && parsed <= endMs && bpm > 0) {
        mergeClientDayMetric(dayMap, toClientDateKey(parsed), { avgHeartRate: bpm });
      }
    }
  } else if (hrRes.resp && (hrRes.status === 401 || hrRes.status === 403)) {
    authErrors.push(await parseClientGoogleApiError(hrRes.resp, 'Google Health API v4'));
  }

  await sumByDay(
    stepsRes,
    (dp) => {
      const obj = dp.steps || dp;
      const ts = Date.parse(obj?.interval?.endTime || obj?.interval?.end_time || '');
      const val = Number(obj?.count ?? obj?.steps ?? 0);
      return { ts, val };
    },
    (dk, sum) => mergeClientDayMetric(dayMap, dk, { steps: Math.round(sum) })
  );

  await sumByDay(
    distRes,
    (dp) => {
      const obj = dp.distance || dp;
      const ts = Date.parse(obj?.interval?.endTime || obj?.interval?.end_time || '');
      const val = Number(obj?.meters ?? obj?.inMeters ?? obj?.distanceMeters ?? 0);
      return { ts, val };
    },
    (dk, sum) => mergeClientDayMetric(dayMap, dk, { distanceMeters: Math.round(sum) })
  );

  await sumByDay(
    calRes,
    (dp) => {
      const obj = dp.activeCaloriesBurned || dp.active_calories_burned || dp;
      const ts = Date.parse(obj?.interval?.endTime || obj?.interval?.end_time || '');
      const val = Number(obj?.kcal ?? obj?.kilocalories ?? obj?.calories ?? 0);
      return { ts, val };
    },
    (dk, sum) => mergeClientDayMetric(dayMap, dk, { caloriesActive: Math.round(sum) })
  );

  await sumByDay(
    floorsRes,
    (dp) => {
      const obj = dp.floorsClimbed || dp.floors_climbed || dp;
      const ts = Date.parse(obj?.interval?.endTime || obj?.interval?.end_time || '');
      const val = Number(obj?.floors ?? obj?.count ?? 0);
      return { ts, val };
    },
    (dk, sum) => mergeClientDayMetric(dayMap, dk, { floorsClimbed: Math.round(sum) })
  );

  await sumByDay(
    hydrationRes,
    (dp) => {
      const obj = dp.hydration || dp;
      const ts = Date.parse(obj?.interval?.endTime || obj?.interval?.end_time || '');
      const ml =
        Number(obj?.milliliters ?? obj?.volumeMl ?? 0) ||
        Number(obj?.liters ?? obj?.volumeLiters ?? 0) * 1000;
      return { ts, val: ml };
    },
    (dk, sum) => mergeClientDayMetric(dayMap, dk, { hydrationMl: Math.round(sum) })
  );

  const samplePoints = (
    res: { ok: boolean; dataPoints: Array<Record<string, any>> },
    extractor: (dp: Record<string, any>) => { ts: number; partial: ClientDayMetricPartial } | null
  ) => {
    if (!res.ok) return;
    succeededCount += 1;
    for (const dp of res.dataPoints) {
      const item = extractor(dp);
      if (!item || Number.isNaN(item.ts) || item.ts < startMs || item.ts > endMs) continue;
      mergeClientDayMetric(dayMap, toClientDateKey(item.ts), item.partial);
    }
  };

  samplePoints(rhrRes, (dp) => {
    const obj = dp.restingHeartRate || dp.resting_heart_rate || dp;
    const ts = Date.parse(obj?.sampleTime || obj?.interval?.endTime || '');
    const bpm = Number(obj?.beatsPerMinute ?? obj?.bpm ?? 0);
    return bpm > 0 ? { ts, partial: { restingHeartRate: bpm } } : null;
  });

  samplePoints(hrvRes, (dp) => {
    const obj = dp.heartRateVariability || dp.heart_rate_variability || dp;
    const ts = Date.parse(obj?.sampleTime || obj?.interval?.endTime || '');
    const rmssd = Number(obj?.heartRateVariabilityMillis ?? obj?.rmssdMillis ?? obj?.rmssd ?? 0);
    return rmssd > 0 ? { ts, partial: { hrvMs: rmssd } } : null;
  });

  samplePoints(spo2Res, (dp) => {
    const obj = dp.oxygenSaturation || dp.oxygen_saturation || dp;
    const ts = Date.parse(obj?.sampleTime || obj?.interval?.endTime || '');
    const pct = Number(obj?.percentage ?? obj?.spo2Percentage ?? 0);
    return pct > 0 ? { ts, partial: { spo2Percent: pct } } : null;
  });

  samplePoints(respRes, (dp) => {
    const obj = dp.respiratoryRate || dp.respiratory_rate || dp;
    const ts = Date.parse(obj?.sampleTime || obj?.interval?.endTime || '');
    const rate = Number(obj?.rate ?? obj?.breathsPerMinute ?? 0);
    return rate > 0 ? { ts, partial: { respirationRate: rate } } : null;
  });

  samplePoints(vo2Res, (dp) => {
    const obj = dp.vo2Max || dp.vo2_max || dp;
    const ts = Date.parse(obj?.sampleTime || obj?.interval?.endTime || '');
    const val = Number(obj?.vo2MaxMillilitersPerMinutePerKilogram ?? obj?.vo2Max ?? 0);
    return val > 0 ? { ts, partial: { vo2Max: val } } : null;
  });

  samplePoints(weightRes, (dp) => {
    const obj = dp.weight || dp;
    const ts = Date.parse(obj?.sampleTime || obj?.interval?.endTime || '');
    const kg =
      Number(obj?.kilograms ?? obj?.weightKg ?? 0) ||
      Number(obj?.grams ?? 0) / 1000;
    return kg > 0 ? { ts, partial: { weightKg: kg } } : null;
  });

  samplePoints(bodyFatRes, (dp) => {
    const obj = dp.bodyFat || dp.body_fat || dp;
    const ts = Date.parse(obj?.sampleTime || obj?.interval?.endTime || '');
    const pct = Number(obj?.percentage ?? obj?.bodyFatPercentage ?? 0);
    return pct > 0 ? { ts, partial: { bodyFatPercent: pct } } : null;
  });

  if (succeededCount === 0) {
    if (authErrors.length > 0) {
      throw new Error(authErrors[0]);
    }
    throw new Error(
      'Google Health API v4 ist für dieses Projekt nicht erreichbar. Bitte trenne Google Health und verbinde es erneut im Modus „Google Fit“.'
    );
  }
  return finalizeClientDayMap(dayMap);
}

async function fetchGoogleFitMetricsClient(
  accessToken: string,
  startMs: number,
  endMs: number
): Promise<RemoteHealthDayMetric[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const dayMap = new Map<string, ClientDayAccumulator>();
  const authErrors: string[] = [];
  let succeededCount = 0;

  // Query sleep 18h before local-day startMs so overnight sleep starting previous evening is fully captured
  const sleepQueryStartMs = startMs - 18 * 3600 * 1000;
  const [sleepResp, sessResp] = await Promise.all([
    fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: 'com.google.sleep.segment' }],
        startTimeMillis: sleepQueryStartMs,
        endTimeMillis: endMs,
      }),
    }),
    fetch(
      `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${encodeURIComponent(
        new Date(sleepQueryStartMs).toISOString()
      )}&endTime=${encodeURIComponent(new Date(endMs).toISOString())}&activityType=72`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
  ]);

  const lightIntervals: ClientTimeInterval[] = [];
  const deepIntervals: ClientTimeInterval[] = [];
  const remIntervals: ClientTimeInterval[] = [];
  const genericAsleep: ClientTimeInterval[] = [];
  const awakeIntervals: ClientTimeInterval[] = [];

  if (sleepResp.ok) {
    succeededCount += 1;
    const data = (await sleepResp.json()) as {
      bucket?: Array<{
        dataset?: Array<{
          point?: Array<{
            startTimeNanos?: string;
            endTimeNanos?: string;
            value?: Array<{ intVal?: number }>;
          }>;
        }>;
      }>;
    };
    for (const b of data.bucket || []) {
      for (const ds of b.dataset || []) {
        for (const p of ds.point || []) {
          const stage = p.value?.[0]?.intVal ?? 2;
          const sMs = Number(p.startTimeNanos || 0) / 1_000_000;
          const eMs = Number(p.endTimeNanos || 0) / 1_000_000;
          if (!Number.isFinite(sMs) || !Number.isFinite(eMs) || eMs <= sMs) continue;
          if (stage === 1 || stage === 3) {
            awakeIntervals.push({ start: sMs, end: eMs });
          } else if (stage === 4) {
            lightIntervals.push({ start: sMs, end: eMs });
          } else if (stage === 5) {
            deepIntervals.push({ start: sMs, end: eMs });
          } else if (stage === 6) {
            remIntervals.push({ start: sMs, end: eMs });
          } else {
            genericAsleep.push({ start: sMs, end: eMs });
          }
        }
      }
    }
  } else if (sleepResp.status === 401 || sleepResp.status === 403) {
    authErrors.push(await parseClientGoogleApiError(sleepResp, 'Google Fit API'));
  }

  const sleepSessions: ClientTimeInterval[] = [];
  if (sessResp.ok) {
    succeededCount += 1;
    const sessJson = (await sessResp.json()) as {
      session?: Array<{ startTimeMillis?: string; endTimeMillis?: string }>;
    };
    for (const s of sessJson.session || []) {
      const sMs = Number(s.startTimeMillis || 0);
      const eMs = Number(s.endTimeMillis || 0);
      if (Number.isFinite(sMs) && Number.isFinite(eMs) && eMs > sMs) {
        sleepSessions.push({ start: sMs, end: eMs });
      }
    }
  } else if (sessResp.status === 401 || sessResp.status === 403) {
    authErrors.push(await parseClientGoogleApiError(sessResp, 'Google Fit API'));
  }

  const mergedDeep = mergeClientTimeIntervals(deepIntervals);
  const mergedRem = mergeClientTimeIntervals(remIntervals);
  const mergedLight = subtractClientTimeIntervals(mergeClientTimeIntervals(lightIntervals), [
    ...mergedDeep,
    ...mergedRem,
  ]);
  const mergedDetailed = mergeClientTimeIntervals([...mergedDeep, ...mergedRem, ...mergedLight]);
  const mergedAwake = mergeClientTimeIntervals(awakeIntervals);
  const cleanGeneric = subtractClientTimeIntervals(
    subtractClientTimeIntervals(mergeClientTimeIntervals(genericAsleep), mergedDetailed),
    mergedAwake
  );
  const asleepIntervals = mergeClientTimeIntervals([...mergedDetailed, ...cleanGeneric]);

  const sleepStatsByDay = new Map<
    string,
    { mins: number; deep: number; light: number; rem: number; awake: number }
  >();
  if (asleepIntervals.length > 0) {
    const episodes: ClientTimeInterval[][] = [[asleepIntervals[0]]];
    for (let i = 1; i < asleepIntervals.length; i++) {
      const cur = asleepIntervals[i];
      const prevEpisode = episodes[episodes.length - 1];
      const prevLast = prevEpisode[prevEpisode.length - 1];
      const sameSession = sleepSessions.some(
        (sess) =>
          prevLast.start >= sess.start - 5 * 60_000 && cur.end <= sess.end + 5 * 60_000
      );
      if (sameSession || cur.start - prevLast.end <= 90 * 60_000) {
        prevEpisode.push(cur);
      } else {
        episodes.push([cur]);
      }
    }

    const sumOverlapMinutes = (ivs: ClientTimeInterval[], wStart: number, wEnd: number): number => {
      let ms = 0;
      for (const iv of ivs) {
        const ov = Math.min(iv.end, wEnd) - Math.max(iv.start, wStart);
        if (ov > 0) ms += ov;
      }
      return Math.round(ms / 60_000);
    };

    for (const ep of episodes) {
      const epStart = ep[0].start;
      const epEnd = ep[ep.length - 1].end;
      if (epEnd < startMs || epEnd > endMs) continue;
      const asleepMs = ep.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
      const mins = Math.round(asleepMs / 60_000);
      if (mins > 0) {
        const dk = toClientDateKey(epEnd);
        const deep = sumOverlapMinutes(mergedDeep, epStart, epEnd);
        const light = sumOverlapMinutes(mergedLight, epStart, epEnd);
        const rem = sumOverlapMinutes(mergedRem, epStart, epEnd);
        const awake = sumOverlapMinutes(mergedAwake, epStart, epEnd);

        const prev = sleepStatsByDay.get(dk) || { mins: 0, deep: 0, light: 0, rem: 0, awake: 0 };
        sleepStatsByDay.set(dk, {
          mins: Math.min(1440, prev.mins + mins),
          deep: prev.deep + deep,
          light: prev.light + light,
          rem: prev.rem + rem,
          awake: prev.awake + awake,
        });
      }
    }
  }

  for (const sess of mergeClientTimeIntervals(sleepSessions)) {
    if (sess.end < startMs || sess.end > endMs) continue;
    const dk = toClientDateKey(sess.end);
    if ((sleepStatsByDay.get(dk)?.mins || 0) === 0) {
      const mins = Math.round((sess.end - sess.start) / 60_000);
      if (mins > 0) {
        sleepStatsByDay.set(dk, { mins: Math.min(1440, mins), deep: 0, light: 0, rem: 0, awake: 0 });
      }
    }
  }

  for (const [dateKey, st] of sleepStatsByDay.entries()) {
    mergeClientDayMetric(dayMap, dateKey, {
      sleepMinutes: st.mins,
      sleepDeepMinutes: st.deep > 0 ? st.deep : null,
      sleepLightMinutes: st.light > 0 ? st.light : null,
      sleepRemMinutes: st.rem > 0 ? st.rem : null,
      sleepAwakeMinutes: st.awake > 0 ? st.awake : null,
    });
  }

  const queryFitBucket = async (
    dataTypeName: string,
    isCritical = false
  ): Promise<
    Array<{
      dateKey: string;
      points: Array<{ value?: Array<{ intVal?: number; fpVal?: number }> }>;
    }>
  > => {
    const resp = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: startMs,
        endTimeMillis: endMs,
      }),
    });
    if (!resp.ok) {
      if (isCritical && (resp.status === 401 || resp.status === 403)) {
        authErrors.push(await parseClientGoogleApiError(resp, 'Google Fit API'));
      }
      return [];
    }
    succeededCount += 1;
    const json = (await resp.json()) as {
      bucket?: Array<{
        startTimeMillis?: string;
        endTimeMillis?: string;
        dataset?: Array<{
          point?: Array<{ value?: Array<{ intVal?: number; fpVal?: number }> }>;
        }>;
      }>;
    };
    const out: Array<{
      dateKey: string;
      points: Array<{ value?: Array<{ intVal?: number; fpVal?: number }> }>;
    }> = [];
    for (const b of json.bucket || []) {
      const midMs = (Number(b.startTimeMillis || 0) + Number(b.endTimeMillis || 0)) / 2 || Date.now();
      const dateKey = toClientDateKey(midMs);
      const pts: Array<{ value?: Array<{ intVal?: number; fpVal?: number }> }> = [];
      for (const ds of b.dataset || []) {
        for (const p of ds.point || []) pts.push(p);
      }
      out.push({ dateKey, points: pts });
    }
    return out;
  };

  const [
    actBuckets,
    stepsBuckets,
    distBuckets,
    calBuckets,
    heartMinBuckets,
    hrBuckets,
    weightBuckets,
    fatBuckets,
    spo2Buckets,
    hydrationBuckets,
    allSessionsRes,
  ] = await Promise.all([
    queryFitBucket('com.google.active_minutes', true),
    queryFitBucket('com.google.step_count.delta'),
    queryFitBucket('com.google.distance.delta'),
    queryFitBucket('com.google.calories.expended'),
    queryFitBucket('com.google.heart_minutes'),
    queryFitBucket('com.google.heart_rate.bpm', true),
    queryFitBucket('com.google.weight'),
    queryFitBucket('com.google.body.fat.percentage'),
    queryFitBucket('com.google.oxygen_saturation'),
    queryFitBucket('com.google.hydration'),
    fetch(
      `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${encodeURIComponent(
        new Date(startMs).toISOString()
      )}&endTime=${encodeURIComponent(new Date(endMs).toISOString())}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).catch(() => null),
  ]);

  for (const b of actBuckets) {
    for (const p of b.points) {
      const mins = p.value?.[0]?.intVal ?? Math.round(p.value?.[0]?.fpVal || 0);
      if (mins > 0) mergeClientDayMetric(dayMap, b.dateKey, { activityMinutes: mins });
    }
  }
  for (const b of stepsBuckets) {
    for (const p of b.points) {
      const steps = p.value?.[0]?.intVal ?? Math.round(p.value?.[0]?.fpVal || 0);
      if (steps > 0) mergeClientDayMetric(dayMap, b.dateKey, { steps });
    }
  }
  for (const b of distBuckets) {
    for (const p of b.points) {
      const m = Math.round(p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0);
      if (m > 0) mergeClientDayMetric(dayMap, b.dateKey, { distanceMeters: m });
    }
  }
  for (const b of calBuckets) {
    for (const p of b.points) {
      const kcal = Math.round(p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0);
      if (kcal > 0) mergeClientDayMetric(dayMap, b.dateKey, { caloriesActive: kcal });
    }
  }
  for (const b of heartMinBuckets) {
    for (const p of b.points) {
      const pts = Math.round(p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0);
      if (pts > 0) mergeClientDayMetric(dayMap, b.dateKey, { heartPoints: pts });
    }
  }
  for (const b of hrBuckets) {
    for (const p of b.points) {
      const avg = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      const minHr = p.value?.[2]?.fpVal ?? p.value?.[2]?.intVal ?? 0;
      if (avg > 0) mergeClientDayMetric(dayMap, b.dateKey, { avgHeartRate: avg });
      if (minHr >= 30 && minHr <= 120) mergeClientDayMetric(dayMap, b.dateKey, { restingHeartRate: minHr });
    }
  }
  for (const b of weightBuckets) {
    for (const p of b.points) {
      const kg = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      if (kg >= 20 && kg <= 400) mergeClientDayMetric(dayMap, b.dateKey, { weightKg: kg });
    }
  }
  for (const b of fatBuckets) {
    for (const p of b.points) {
      const pct = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      if (pct >= 1 && pct <= 75) mergeClientDayMetric(dayMap, b.dateKey, { bodyFatPercent: pct });
    }
  }
  for (const b of spo2Buckets) {
    for (const p of b.points) {
      const pct = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      if (pct >= 50 && pct <= 100) mergeClientDayMetric(dayMap, b.dateKey, { spo2Percent: pct });
    }
  }
  for (const b of hydrationBuckets) {
    let litersSum = 0;
    for (const p of b.points) {
      const l = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      if (l > 0) litersSum += l;
    }
    if (litersSum > 0) {
      mergeClientDayMetric(dayMap, b.dateKey, { hydrationMl: Math.round(litersSum * 1000) });
    }
  }

  if (allSessionsRes && allSessionsRes.ok) {
    const sessJson = (await allSessionsRes.json()) as {
      session?: Array<{
        activityType?: number;
        startTimeMillis?: string;
        endTimeMillis?: string;
      }>;
    };
    const workoutByDay = new Map<string, number>();
    for (const s of sessJson.session || []) {
      if (s.activityType === 72 || s.activityType === 3) continue;
      const eMs = Number(s.endTimeMillis || 0);
      const sMs = Number(s.startTimeMillis || 0);
      if (!Number.isFinite(eMs) || eMs <= sMs || eMs < startMs || eMs > endMs) continue;
      const dk = toClientDateKey(eMs);
      workoutByDay.set(dk, (workoutByDay.get(dk) || 0) + 1);
    }
    for (const [dk, count] of workoutByDay.entries()) {
      mergeClientDayMetric(dayMap, dk, { workoutsCount: count });
    }
  }

  if (succeededCount === 0 && authErrors.length > 0) {
    throw new Error(authErrors[0]);
  }
  return finalizeClientDayMap(dayMap);
}

export async function syncHealthProvider(
  provider: 'garmin' | 'google'
): Promise<RemoteHealthSyncResult> {
  if (provider === 'google' && clientGoogleOAuthSession) {
    if (!hasValidClientGoogleSession()) {
      clearHealthSessionToken('google');
      throw new Error('Google Health-Sitzung abgelaufen. Bitte erneut verbinden.');
    }
    const { accessToken, apiMode } = clientGoogleOAuthSession;
    const endMs = Date.now();
    const startMs = getLocalDayAlignedStartMs(endMs, 14);
    const days =
      apiMode === 'google_fit'
        ? await fetchGoogleFitMetricsClient(accessToken, startMs, endMs)
        : await fetchGoogleHealthV4MetricsClient(accessToken, startMs, endMs);

    return {
      provider: 'google_health',
      apiMode,
      days,
      syncedAt: Date.now(),
    };
  }

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
  const clientTokenToRevoke =
    provider === 'google' ? clientGoogleOAuthSession?.accessToken : undefined;
  clearHealthSessionToken(provider);

  if (clientTokenToRevoke) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(clientTokenToRevoke)}`,
        { method: 'POST' }
      );
    } catch {
      // Ignore revocation failures on disconnect
    }
  }

  if (token === CLIENT_GOOGLE_SESSION_MARKER || cachedBackendAvailable === false) {
    return;
  }

  try {
    await fetch(`/api/health/${provider}/disconnect`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { 'x-health-session': token } : undefined,
    });
  } catch {
    // Ignore disconnect network errors
  }
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

  const hasAuthoritativeSleepSource = Boolean(
    params.existingRecord?.sources?.some(
      (s) =>
        s === 'google_health' ||
        s === 'garmin_connect' ||
        s === 'manual' ||
        s === 'health_export'
    )
  );
  const willHaveAuthoritativeSource =
    hasAuthoritativeSleepSource ||
    Boolean(
      params.extraSources?.some(
        (s) =>
          s === 'google_health' ||
          s === 'garmin_connect' ||
          s === 'manual' ||
          s === 'health_export'
      )
    );

  const sleepDurationMinutes =
    typeof params.overrideSleepMinutes === 'number'
      ? Math.max(0, Math.min(1440, Math.round(params.overrideSleepMinutes)))
      : hasAuthoritativeSleepSource
      ? Math.max(0, Math.min(1440, Math.round(params.existingRecord?.sleepDurationMinutes ?? 0)))
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

  const sourcesSet = new Set<HealthDataSource>(
    (params.existingRecord?.sources || []).filter((s) =>
      willHaveAuthoritativeSource ? s !== 'browser_idle' : true
    )
  );
  if (!willHaveAuthoritativeSource && telemetry.overnightRestGapMinutes > 0) {
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
      : telemetry.bleAvgHeartRate ??
        params.overrideMetrics?.avgHeartRate ??
        params.existingRecord?.avgHeartRate ??
        null;

  const pickOpt = (
    overrideVal: number | null | undefined,
    existingVal: number | null | undefined
  ): number | null => {
    if (typeof overrideVal === 'number' && Number.isFinite(overrideVal)) return overrideVal;
    if (typeof existingVal === 'number' && Number.isFinite(existingVal)) return existingVal;
    return null;
  };
  const pickMaxInt = (
    overrideVal: number | null | undefined,
    existingVal: number | null | undefined
  ): number | null => {
    const o = typeof overrideVal === 'number' && Number.isFinite(overrideVal) ? overrideVal : null;
    const e = typeof existingVal === 'number' && Number.isFinite(existingVal) ? existingVal : null;
    if (o !== null && e !== null) return Math.max(o, e);
    return o ?? e;
  };

  const om = params.overrideMetrics;
  const ex = params.existingRecord;

  const sleepDeepMinutes = pickOpt(om?.sleepDeepMinutes, ex?.sleepDeepMinutes);
  const sleepLightMinutes = pickOpt(om?.sleepLightMinutes, ex?.sleepLightMinutes);
  const sleepRemMinutes = pickOpt(om?.sleepRemMinutes, ex?.sleepRemMinutes);
  const sleepAwakeMinutes = pickOpt(om?.sleepAwakeMinutes, ex?.sleepAwakeMinutes);
  const steps = pickMaxInt(om?.steps, ex?.steps);
  const distanceMeters = pickMaxInt(om?.distanceMeters, ex?.distanceMeters);
  const caloriesActive = pickMaxInt(om?.caloriesActive, ex?.caloriesActive);
  const floorsClimbed = pickMaxInt(om?.floorsClimbed, ex?.floorsClimbed);
  const heartPoints = pickMaxInt(om?.heartPoints, ex?.heartPoints);
  const workoutsCount = pickMaxInt(om?.workoutsCount, ex?.workoutsCount);
  const restingHeartRate = pickOpt(om?.restingHeartRate, ex?.restingHeartRate);
  const hrvMs = pickOpt(om?.hrvMs, ex?.hrvMs);
  const stressLevel = pickOpt(om?.stressLevel, ex?.stressLevel);
  const bodyBattery = pickOpt(om?.bodyBattery, ex?.bodyBattery);
  const spo2Percent = pickOpt(om?.spo2Percent, ex?.spo2Percent);
  const respirationRate = pickOpt(om?.respirationRate, ex?.respirationRate);
  const vo2Max = pickOpt(om?.vo2Max, ex?.vo2Max);
  const weightKg = pickOpt(om?.weightKg, ex?.weightKg);
  const bodyFatPercent = pickOpt(om?.bodyFatPercent, ex?.bodyFatPercent);
  const hydrationMl = pickMaxInt(om?.hydrationMl, ex?.hydrationMl);

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
