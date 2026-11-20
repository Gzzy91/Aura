import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

type ProviderId = 'garmin';

interface PendingOAuthState {
  provider: ProviderId;
  codeVerifier?: string;
  createdAt: number;
}

interface HealthOAuthSession {
  provider: ProviderId;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  garminUserId?: string;
  connectedAt: number;
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

export interface RemoteGarminWorkoutActivity {
  id: string;
  dateKey: string;
  name: string;
  sportType: string;
  startTimeLocal: string | null;
  durationMinutes: number;
  distanceMeters: number | null;
  calories: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

interface GarminDailyItem {
  userId?: string;
  calendarDate?: string;
  startTimeInSeconds?: number;
  activeTimeInSeconds?: number;
  moderateIntensityDurationInSeconds?: number;
  vigorousIntensityDurationInSeconds?: number;
  averageHeartRateInBeatsPerMinute?: number;
  restingHeartRateInBeatsPerMinute?: number;
  steps?: number;
  distanceInMeters?: number;
  activeKilocalories?: number;
  floorsClimbed?: number;
  averageStressLevel?: number;
  bodyBatteryHighestValue?: number;
  bodyBatteryMostRecentValue?: number;
  bodyBatteryChargedValue?: number;
  averageSpo2Value?: number;
  avgWakingRespirationValue?: number;
}

interface GarminSleepItem {
  userId?: string;
  summaryId?: string;
  calendarDate?: string;
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  deepSleepDurationInSeconds?: number;
  lightSleepDurationInSeconds?: number;
  remSleepInSeconds?: number;
  awakeDurationInSeconds?: number;
  avgSleepRespirationValue?: number;
  averageSpo2Value?: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map<string, PendingOAuthState>();
const sessions = new Map<string, HealthOAuthSession>();
const garminWebhookCache = new Map<
  string,
  { dailies: GarminDailyItem[]; sleeps: GarminSleepItem[] }
>();

function pruneExpiredStates() {
  const now = Date.now();
  for (const [key, val] of pendingStates.entries()) {
    if (now - val.createdAt > STATE_TTL_MS) {
      pendingStates.delete(key);
    }
  }
}

function getAppBaseUrl(req?: Request): string {
  const envUrl = process.env.APP_URL;
  if (envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrl)) {
    return envUrl.replace(/\/+$/, '');
  }
  if (req) {
    const forwardedHost = (req.get('x-forwarded-host') || req.get('host') || '')
      .split(',')[0]
      .trim();
    if (
      forwardedHost &&
      !forwardedHost.startsWith('localhost') &&
      !forwardedHost.startsWith('127.0.0.1') &&
      !forwardedHost.startsWith('0.0.0.0')
    ) {
      const forwardedProto = (req.get('x-forwarded-proto') || req.protocol || 'https')
        .split(',')[0]
        .trim();
      const proto = forwardedProto === 'http' ? 'http' : 'https';
      return `${proto}://${forwardedHost}`.replace(/\/+$/, '');
    }
  }
  return 'http://localhost:3000';
}

const SERVER_STARTED_AT = Date.now();
const GARMIN_API_KEY_OFF_COOKIE = 'aura_health_garmin_api_key_off';

function getGarminConfig(req?: Request) {
  const personalApiKey = (process.env.GARMIN_PERSONAL_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  const personalApiBaseUrl = (
    process.env.GARMIN_PERSONAL_API_BASE_URL || 'https://personal.connectapi.garmin.com'
  )
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/+$/, '');
  const clientId = (process.env.GARMIN_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
  const clientSecret = (process.env.GARMIN_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '');
  const callbackUrl = `${getAppBaseUrl(req)}/api/health/garmin/callback`;
  const hasPersonalKey =
    Boolean(personalApiKey) && personalApiKey !== 'MY_GARMIN_PERSONAL_API_KEY';
  const hasOAuth = Boolean(clientId && clientSecret);
  const authMode: 'api_key' | 'oauth' | null = hasPersonalKey
    ? 'api_key'
    : hasOAuth
    ? 'oauth'
    : null;
  return {
    personalApiKey: hasPersonalKey ? personalApiKey : '',
    personalApiBaseUrl: personalApiBaseUrl || 'https://personal.connectapi.garmin.com',
    clientId,
    clientSecret,
    callbackUrl,
    authMode,
    configured: Boolean(authMode),
  };
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(val);
    } catch {
      out[key] = val;
    }
  }
  return out;
}

function getSessionForProvider(
  req: Request,
  provider: ProviderId
): { sessionToken: string; session: HealthOAuthSession } | null {
  const headerToken = req.header('x-health-session')?.trim();
  const cookies = parseCookies(req);
  const cookieToken = cookies[`aura_health_${provider}`];
  const candidate = headerToken || cookieToken;
  if (!candidate) return null;
  const session = sessions.get(candidate);
  if (!session || session.provider !== provider) return null;
  return { sessionToken: candidate, session };
}

function setHealthSessionCookie(res: Response, provider: ProviderId, sessionToken: string) {
  res.cookie(`aura_health_${provider}`, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearHealthSessionCookie(res: Response, provider: ProviderId) {
  res.clearCookie(`aura_health_${provider}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
}

function isGarminApiKeyManuallyDisconnected(req: Request): boolean {
  const cookies = parseCookies(req);
  return cookies[GARMIN_API_KEY_OFF_COOKIE] === '1';
}

function setGarminApiKeyOffCookie(res: Response, off: boolean) {
  if (off) {
    res.cookie(GARMIN_API_KEY_OFF_COOKIE, '1', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  } else {
    res.clearCookie(GARMIN_API_KEY_OFF_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
  }
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function renderPopupResultHtml(payload: Record<string, unknown>, message: string): string {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const safeMsg = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Aura Health Connect</title>
    <style>
      body { background:#0a0a0a; color:#f5f5f5; font-family:system-ui,-apple-system,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; text-align:center; }
      .card { max-width:380px; background:#171717; border:1px solid #262626; border-radius:16px; padding:24px; }
      h1 { font-size:16px; margin:0 0 8px; }
      p { font-size:13px; color:#a3a3a3; margin:0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Aura Health Sync</h1>
      <p>${safeMsg}</p>
    </div>
    <script>
      (function () {
        var data = ${safeJson};
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(data, '*');
            setTimeout(function () { window.close(); }, 350);
          } else {
            window.location.href = '/';
          }
        } catch (e) {
          // Ignore cross-window errors
        }
      })();
    </script>
  </body>
</html>`;
}

function toDateKey(tsMs: number): string {
  const d = new Date(tsMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface DayAccumulator {
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
  weightValues: number[];
  bodyFatValues: number[];
  hydrationMl: number | null;
}

interface DayMetricPartial {
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

function createEmptyAccumulator(): DayAccumulator {
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
    weightValues: [],
    bodyFatValues: [],
    hydrationMl: null,
  };
}

function mergeDayMetric(
  map: Map<string, DayAccumulator>,
  dateKey: string,
  partial: DayMetricPartial
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
  const entry = map.get(dateKey) || createEmptyAccumulator();

  const mergeMaxInt = (
    cur: number | null,
    val: number | null | undefined,
    min: number,
    max: number
  ): number | null => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return cur;
    const rounded = Math.round(val);
    if (rounded < min || rounded > max) return cur;
    return cur === null ? rounded : Math.max(cur, rounded);
  };

  const pushSample = (
    arr: number[],
    val: number | null | undefined,
    min: number,
    max: number
  ) => {
    if (typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max) {
      arr.push(val);
    }
  };

  if (typeof partial.sleepMinutes === 'number' && Number.isFinite(partial.sleepMinutes)) {
    entry.sleepMinutes = Math.min(1440, Math.max(entry.sleepMinutes, Math.round(partial.sleepMinutes)));
  }
  if (typeof partial.activityMinutes === 'number' && Number.isFinite(partial.activityMinutes)) {
    entry.activityMinutes = Math.min(
      1440,
      Math.max(entry.activityMinutes, Math.round(partial.activityMinutes))
    );
  }
  pushSample(entry.hrValues, partial.avgHeartRate, 25, 240);

  entry.sleepDeepMinutes = mergeMaxInt(entry.sleepDeepMinutes, partial.sleepDeepMinutes, 0, 1440);
  entry.sleepLightMinutes = mergeMaxInt(entry.sleepLightMinutes, partial.sleepLightMinutes, 0, 1440);
  entry.sleepRemMinutes = mergeMaxInt(entry.sleepRemMinutes, partial.sleepRemMinutes, 0, 1440);
  entry.sleepAwakeMinutes = mergeMaxInt(entry.sleepAwakeMinutes, partial.sleepAwakeMinutes, 0, 1440);
  entry.steps = mergeMaxInt(entry.steps, partial.steps, 0, 500000);
  entry.distanceMeters = mergeMaxInt(entry.distanceMeters, partial.distanceMeters, 0, 1000000);
  entry.caloriesActive = mergeMaxInt(entry.caloriesActive, partial.caloriesActive, 0, 50000);
  entry.floorsClimbed = mergeMaxInt(entry.floorsClimbed, partial.floorsClimbed, 0, 10000);
  entry.heartPoints = mergeMaxInt(entry.heartPoints, partial.heartPoints, 0, 5000);
  entry.workoutsCount = mergeMaxInt(entry.workoutsCount, partial.workoutsCount, 0, 100);
  entry.hydrationMl = mergeMaxInt(entry.hydrationMl, partial.hydrationMl, 0, 30000);

  pushSample(entry.restingHrValues, partial.restingHeartRate, 25, 220);
  pushSample(entry.hrvValues, partial.hrvMs, 0, 500);
  pushSample(entry.stressValues, partial.stressLevel, 0, 100);
  pushSample(entry.bodyBatteryValues, partial.bodyBattery, 0, 100);
  pushSample(entry.spo2Values, partial.spo2Percent, 50, 100);
  pushSample(entry.respirationValues, partial.respirationRate, 4, 80);
  pushSample(entry.vo2MaxValues, partial.vo2Max, 10, 110);
  pushSample(entry.weightValues, partial.weightKg, 20, 400);
  pushSample(entry.bodyFatValues, partial.bodyFatPercent, 1, 75);

  map.set(dateKey, entry);
}

function finalizeDayMap(map: Map<string, DayAccumulator>): RemoteHealthDayMetric[] {
  const avgInt = (arr: number[]): number | null =>
    arr.length > 0 ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : null;
  const avgFloat = (arr: number[], decimals = 1): number | null => {
    if (arr.length === 0) return null;
    const f = 10 ** decimals;
    return Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * f) / f;
  };
  const maxInt = (arr: number[]): number | null =>
    arr.length > 0 ? Math.round(Math.max(...arr)) : null;

  return Array.from(map.entries())
    .map(([dateKey, v]) => ({
      dateKey,
      sleepDurationMinutes: Math.max(0, Math.min(1440, Math.round(v.sleepMinutes))),
      activityDurationMinutes: Math.max(0, Math.min(1440, Math.round(v.activityMinutes))),
      avgHeartRate: avgInt(v.hrValues),
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
      restingHeartRate: avgInt(v.restingHrValues),
      hrvMs: avgFloat(v.hrvValues, 1),
      stressLevel: avgInt(v.stressValues),
      bodyBattery: maxInt(v.bodyBatteryValues),
      spo2Percent: avgFloat(v.spo2Values, 1),
      respirationRate: avgFloat(v.respirationValues, 1),
      vo2Max: avgFloat(v.vo2MaxValues, 1),
      weightKg: avgFloat(v.weightValues, 1),
      bodyFatPercent: avgFloat(v.bodyFatValues, 1),
      hydrationMl: v.hydrationMl,
    }))
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

async function ensureValidGarminToken(session: HealthOAuthSession): Promise<string> {
  if (Date.now() < session.expiresAt - 60_000) {
    return session.accessToken;
  }
  if (!session.refreshToken) {
    throw new Error('Garmin-Sitzung abgelaufen. Bitte verbinde Garmin Connect erneut.');
  }

  const cfg = getGarminConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: session.refreshToken,
  });

  const resp = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    throw new Error('Garmin-Token konnte nicht aktualisiert werden. Bitte erneut verbinden.');
  }
  const tokenData = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokenData.access_token) {
    throw new Error('Ungültige Token-Antwort von Garmin Connect.');
  }
  session.accessToken = tokenData.access_token;
  if (tokenData.refresh_token) session.refreshToken = tokenData.refresh_token;
  session.expiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000;
  return session.accessToken;
}

async function fetchGarminHealthMetrics(session: HealthOAuthSession): Promise<RemoteHealthDayMetric[]> {
  const accessToken = await ensureValidGarminToken(session);

  if (!session.garminUserId) {
    try {
      const idRes = await fetch('https://apis.garmin.com/wellness-api/rest/user/id', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (idRes.ok) {
        const idJson = (await idRes.json()) as { userId?: string };
        if (idJson.userId) session.garminUserId = idJson.userId;
      }
    } catch {
      // Optional user ID lookup
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const windows = [
    { start: nowSec - 24 * 3600, end: nowSec },
    { start: nowSec - 48 * 3600, end: nowSec - 24 * 3600 },
    { start: nowSec - 72 * 3600, end: nowSec - 48 * 3600 },
  ];

  const dailies: GarminDailyItem[] = [];
  const sleeps: GarminSleepItem[] = [];
  const hrvItems: Array<Record<string, any>> = [];
  const pulseOxItems: Array<Record<string, any>> = [];
  const respirationItems: Array<Record<string, any>> = [];
  const stressItems: Array<Record<string, any>> = [];
  const bodyCompItems: Array<Record<string, any>> = [];
  const userMetricItems: Array<Record<string, any>> = [];
  const activityItems: Array<Record<string, any>> = [];

  let hadHttpError = false;
  let lastErrorStatus = 0;

  const pullGarmin = async <T>(
    endpoint: string,
    start: number,
    end: number,
    target: T[],
    critical = false
  ) => {
    try {
      const r = await fetch(
        `https://apis.garmin.com/wellness-api/rest/${endpoint}?uploadStartTimeInSeconds=${start}&uploadEndTimeInSeconds=${end}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (r.ok) {
        const arr = (await r.json()) as T[];
        if (Array.isArray(arr)) target.push(...arr);
      } else if (critical && (r.status === 401 || r.status === 403)) {
        hadHttpError = true;
        lastErrorStatus = r.status;
      }
    } catch {
      // Optional endpoint failures shouldn't abort overall sync
    }
  };

  await Promise.all(
    windows.flatMap(({ start, end }) => [
      pullGarmin('dailies', start, end, dailies, true),
      pullGarmin('sleeps', start, end, sleeps, true),
      pullGarmin('hrv', start, end, hrvItems),
      pullGarmin('pulseOx', start, end, pulseOxItems),
      pullGarmin('respiration', start, end, respirationItems),
      pullGarmin('stressDetails', start, end, stressItems),
      pullGarmin('bodyComps', start, end, bodyCompItems),
      pullGarmin('userMetrics', start, end, userMetricItems),
      pullGarmin('activities', start, end, activityItems),
    ])
  );

  if (session.garminUserId && garminWebhookCache.has(session.garminUserId)) {
    const cached = garminWebhookCache.get(session.garminUserId)!;
    dailies.push(...cached.dailies);
    sleeps.push(...cached.sleeps);
  }

  if (hadHttpError && dailies.length === 0 && sleeps.length === 0) {
    throw new Error(
      `Garmin Connect API hat den Zugriff verweigert (HTTP ${lastErrorStatus}). Bitte Verbindung prüfen oder erneut autorisieren.`
    );
  }

  const dayMap = new Map<string, DayAccumulator>();

  for (const d of dailies) {
    const dateKey =
      d.calendarDate ||
      (typeof d.startTimeInSeconds === 'number' ? toDateKey(d.startTimeInSeconds * 1000) : '');
    if (!dateKey) continue;

    const modMin = Math.round((d.moderateIntensityDurationInSeconds || 0) / 60);
    const vigMin = Math.round((d.vigorousIntensityDurationInSeconds || 0) / 60);
    const intensityMin = modMin + vigMin;
    const activeMin = intensityMin > 0 ? intensityMin : Math.round((d.activeTimeInSeconds || 0) / 60);
    const heartPts = intensityMin > 0 ? modMin + vigMin * 2 : null;

    const hr =
      typeof d.averageHeartRateInBeatsPerMinute === 'number'
        ? d.averageHeartRateInBeatsPerMinute
        : typeof d.restingHeartRateInBeatsPerMinute === 'number'
        ? d.restingHeartRateInBeatsPerMinute
        : null;

    mergeDayMetric(dayMap, dateKey, {
      activityMinutes: activeMin,
      avgHeartRate: hr,
      restingHeartRate: d.restingHeartRateInBeatsPerMinute ?? null,
      steps: d.steps ?? null,
      distanceMeters: d.distanceInMeters ?? null,
      caloriesActive: d.activeKilocalories ?? null,
      floorsClimbed: d.floorsClimbed ?? null,
      heartPoints: heartPts,
      stressLevel:
        typeof d.averageStressLevel === 'number' && d.averageStressLevel >= 0
          ? d.averageStressLevel
          : null,
      bodyBattery:
        typeof d.bodyBatteryMostRecentValue === 'number'
          ? d.bodyBatteryMostRecentValue
          : typeof d.bodyBatteryHighestValue === 'number'
          ? d.bodyBatteryHighestValue
          : null,
      spo2Percent: d.averageSpo2Value ?? null,
      respirationRate: d.avgWakingRespirationValue ?? null,
    });
  }

  const sleepBySummaryId = new Map<
    string,
    { dateKey: string; mins: number; deep: number; light: number; rem: number; awake: number }
  >();
  for (const s of sleeps) {
    const dateKey =
      s.calendarDate ||
      (typeof s.startTimeInSeconds === 'number' ? toDateKey(s.startTimeInSeconds * 1000) : '');
    if (!dateKey) continue;
    const deep = Math.round((s.deepSleepDurationInSeconds || 0) / 60);
    const light = Math.round((s.lightSleepDurationInSeconds || 0) / 60);
    const rem = Math.round((s.remSleepInSeconds || 0) / 60);
    const awake = Math.round((s.awakeDurationInSeconds || 0) / 60);
    const totalSec =
      typeof s.durationInSeconds === 'number' && s.durationInSeconds > 0
        ? s.durationInSeconds
        : (s.deepSleepDurationInSeconds || 0) +
          (s.lightSleepDurationInSeconds || 0) +
          (s.remSleepInSeconds || 0);
    const mins = Math.round(totalSec / 60);
    const key = s.summaryId || `${dateKey}-${s.startTimeInSeconds || mins}`;
    sleepBySummaryId.set(key, { dateKey, mins, deep, light, rem, awake });

    if (typeof s.avgSleepRespirationValue === 'number' || typeof s.averageSpo2Value === 'number') {
      mergeDayMetric(dayMap, dateKey, {
        respirationRate: s.avgSleepRespirationValue ?? null,
        spo2Percent: s.averageSpo2Value ?? null,
      });
    }
  }

  const sleepTotalPerDay = new Map<
    string,
    { mins: number; deep: number; light: number; rem: number; awake: number }
  >();
  for (const item of sleepBySummaryId.values()) {
    const prev = sleepTotalPerDay.get(item.dateKey) || {
      mins: 0,
      deep: 0,
      light: 0,
      rem: 0,
      awake: 0,
    };
    sleepTotalPerDay.set(item.dateKey, {
      mins: prev.mins + item.mins,
      deep: prev.deep + item.deep,
      light: prev.light + item.light,
      rem: prev.rem + item.rem,
      awake: prev.awake + item.awake,
    });
  }
  for (const [dateKey, v] of sleepTotalPerDay.entries()) {
    mergeDayMetric(dayMap, dateKey, {
      sleepMinutes: v.mins,
      sleepDeepMinutes: v.deep > 0 ? v.deep : null,
      sleepLightMinutes: v.light > 0 ? v.light : null,
      sleepRemMinutes: v.rem > 0 ? v.rem : null,
      sleepAwakeMinutes: v.awake > 0 ? v.awake : null,
    });
  }

  for (const h of hrvItems) {
    const dk =
      h.calendarDate ||
      (typeof h.startTimeInSeconds === 'number' ? toDateKey(h.startTimeInSeconds * 1000) : '');
    const val = Number(h.lastNightAvg ?? h.weeklyAvg ?? 0);
    if (dk && val > 0) mergeDayMetric(dayMap, dk, { hrvMs: val });
  }

  for (const p of pulseOxItems) {
    const dk =
      p.calendarDate ||
      (typeof p.startTimeInSeconds === 'number' ? toDateKey(p.startTimeInSeconds * 1000) : '');
    const avg =
      typeof p.avgSpo2 === 'number'
        ? p.avgSpo2
        : p.timeOffsetSpo2Values && typeof p.timeOffsetSpo2Values === 'object'
        ? (() => {
            const vals = Object.values(p.timeOffsetSpo2Values).filter(
              (n): n is number => typeof n === 'number' && n >= 50 && n <= 100
            );
            return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          })()
        : null;
    if (dk && avg) mergeDayMetric(dayMap, dk, { spo2Percent: avg });
  }

  for (const r of respirationItems) {
    const dk =
      r.calendarDate ||
      (typeof r.startTimeInSeconds === 'number' ? toDateKey(r.startTimeInSeconds * 1000) : '');
    const vals =
      r.timeOffsetEpochToBreaths && typeof r.timeOffsetEpochToBreaths === 'object'
        ? Object.values(r.timeOffsetEpochToBreaths).filter(
            (n): n is number => typeof n === 'number' && n >= 4 && n <= 80
          )
        : [];
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    if (dk && avg) mergeDayMetric(dayMap, dk, { respirationRate: avg });
  }

  for (const st of stressItems) {
    const dk =
      st.calendarDate ||
      (typeof st.startTimeInSeconds === 'number' ? toDateKey(st.startTimeInSeconds * 1000) : '');
    const bb =
      typeof st.bodyBatteryChargedValue === 'number' ? st.bodyBatteryChargedValue : null;
    const maxSt =
      typeof st.avgStressLevel === 'number' && st.avgStressLevel >= 0 ? st.avgStressLevel : null;
    if (dk && (bb !== null || maxSt !== null)) {
      mergeDayMetric(dayMap, dk, { bodyBattery: bb, stressLevel: maxSt });
    }
  }

  for (const bc of bodyCompItems) {
    const dk =
      bc.calendarDate ||
      (typeof bc.measurementTimeInSeconds === 'number'
        ? toDateKey(bc.measurementTimeInSeconds * 1000)
        : '');
    if (!dk) continue;
    const weightKg = typeof bc.weightInGrams === 'number' ? bc.weightInGrams / 1000 : null;
    const bodyFatPercent =
      typeof bc.bodyFatPercentage === 'number' ? bc.bodyFatPercentage : null;
    mergeDayMetric(dayMap, dk, { weightKg, bodyFatPercent });
  }

  for (const um of userMetricItems) {
    const dk =
      um.calendarDate ||
      (typeof um.startTimeInSeconds === 'number' ? toDateKey(um.startTimeInSeconds * 1000) : '');
    const vo2 = Number(um.vo2Max ?? um.vo2MaxCycling ?? 0);
    if (dk && vo2 > 0) mergeDayMetric(dayMap, dk, { vo2Max: vo2 });
  }

  const workoutsByDay = new Map<string, number>();
  for (const act of activityItems) {
    const dk =
      typeof act.startTimeInSeconds === 'number' ? toDateKey(act.startTimeInSeconds * 1000) : '';
    if (!dk) continue;
    workoutsByDay.set(dk, (workoutsByDay.get(dk) || 0) + 1);
  }
  for (const [dk, count] of workoutsByDay.entries()) {
    mergeDayMetric(dayMap, dk, { workoutsCount: count });
  }

  return finalizeDayMap(dayMap);
}

class GarminApiAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'GarminApiAuthError';
    this.status = status;
  }
}

interface CachedGarminPersonalToken {
  apiKeyHash: string;
  baseUrl: string;
  accessToken: string;
  expiresAt: number;
}

let cachedGarminPersonalToken: CachedGarminPersonalToken | null = null;

function extractJwtExpiryMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { exp?: number };
    if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

async function getGarminPersonalBearerToken(
  apiKey: string,
  baseUrl: string,
  forceRefresh = false
): Promise<string> {
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  if (
    !forceRefresh &&
    cachedGarminPersonalToken &&
    cachedGarminPersonalToken.apiKeyHash === apiKeyHash &&
    cachedGarminPersonalToken.baseUrl === baseUrl &&
    Date.now() < cachedGarminPersonalToken.expiresAt - 60_000
  ) {
    return cachedGarminPersonalToken.accessToken;
  }

  const tokenUrl = `${baseUrl}/personalapitoken-service/personal-api/personal-api-key/token`;
  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `ApiKey ${apiKey}`,
      Accept: '*/*',
    },
  });

  const rawText = await resp.text().catch(() => '');
  const trimmedBody = rawText.trim();
  let parsed: { access_token?: string; token?: string; expires_in?: number; message?: string } = {};
  if (trimmedBody.startsWith('{')) {
    try {
      parsed = JSON.parse(trimmedBody);
    } catch {
      parsed = {};
    }
  } else if (trimmedBody && !trimmedBody.startsWith('<')) {
    const unquoted = trimmedBody.replace(/^["']|["']$/g, '').trim();
    if (unquoted.split('.').length === 3 || unquoted.length > 20) {
      parsed = { access_token: unquoted };
    }
  }

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      cachedGarminPersonalToken = null;
      throw new GarminApiAuthError(
        `Garmin Personal API Key ungültig oder abgelaufen (HTTP ${resp.status}). Bitte prüfe GARMIN_PERSONAL_API_KEY in Settings > Secrets.`,
        resp.status
      );
    }
    throw new Error(
      parsed.message ||
        `Garmin Personal API Token-Austausch fehlgeschlagen (HTTP ${resp.status}).`
    );
  }

  const accessToken = parsed.access_token || parsed.token || '';
  if (!accessToken) {
    throw new Error('Ungültige Token-Antwort von der Garmin Personal API erhalten.');
  }

  const jwtExpMs = extractJwtExpiryMs(accessToken);
  const expiresAt =
    typeof parsed.expires_in === 'number' && parsed.expires_in > 0
      ? Date.now() + parsed.expires_in * 1000
      : jwtExpMs || Date.now() + 20 * 3600 * 1000;

  cachedGarminPersonalToken = {
    apiKeyHash,
    baseUrl,
    accessToken,
    expiresAt,
  };

  return accessToken;
}

function normalizeGarminDateKey(val: unknown): string {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    const ms = val > 10_000_000_000 ? val : val * 1000;
    return toDateKey(ms);
  }
  return '';
}

function unwrapGarminList(json: unknown, preferredKeys: string[] = []): Array<Record<string, any>> {
  if (Array.isArray(json)) {
    return json.filter((x): x is Record<string, any> => Boolean(x && typeof x === 'object'));
  }
  if (json && typeof json === 'object') {
    const obj = json as Record<string, any>;
    for (const k of [...preferredKeys, 'data', 'items', 'summaries', 'results']) {
      if (Array.isArray(obj[k])) {
        return obj[k].filter((x: unknown): x is Record<string, any> => Boolean(x && typeof x === 'object'));
      }
    }
    return [obj];
  }
  return [];
}

async function fetchGarminPersonalEndpoint(
  apiKey: string,
  baseUrl: string,
  path: string,
  tokenRef: { token: string }
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const doGet = async (bearer: string) =>
    fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: 'application/json, text/plain, */*',
        'Cache-Control': 'no-cache, no-store',
        Pragma: 'no-cache',
      },
    });

  try {
    let resp = await doGet(tokenRef.token);
    if (resp.status === 401) {
      tokenRef.token = await getGarminPersonalBearerToken(apiKey, baseUrl, true);
      resp = await doGet(tokenRef.token);
    }
    if (!resp.ok || resp.status === 204) {
      return { ok: resp.status === 204, status: resp.status, json: null };
    }
    const text = await resp.text().catch(() => '');
    if (!text.trim()) return { ok: true, status: resp.status, json: null };
    try {
      return { ok: true, status: resp.status, json: JSON.parse(text) };
    } catch {
      return { ok: true, status: resp.status, json: null };
    }
  } catch (err) {
    if (err instanceof GarminApiAuthError) throw err;
    return { ok: false, status: 0, json: null };
  }
}

function parseGarminGmtTimestampMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 10_000_000_000 ? raw : raw * 1000;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized =
    trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const baseMs = Date.parse(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(baseMs)) return toDateKey(Date.now() + deltaDays * 86_400_000);
  const shifted = new Date(baseMs + deltaDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

async function fetchGarminPersonalApiMetrics(
  apiKey: string,
  baseUrl: string,
  localEndDate?: string,
  rangeOverride?: { startDate?: string; endDate?: string }
): Promise<{
  days: RemoteHealthDayMetric[];
  activities: RemoteGarminWorkoutActivity[];
  garminLastSyncAt: number | null;
}> {
  const initialToken = await getGarminPersonalBearerToken(apiKey, baseUrl);
  const tokenRef = { token: initialToken };

  const nowMs = Date.now();
  const todayLocalKey =
    localEndDate && /^\d{4}-\d{2}-\d{2}$/.test(localEndDate) ? localEndDate : toDateKey(nowMs);
  const validRangeEnd =
    rangeOverride?.endDate && /^\d{4}-\d{2}-\d{2}$/.test(rangeOverride.endDate)
      ? rangeOverride.endDate > todayLocalKey
        ? todayLocalKey
        : rangeOverride.endDate
      : todayLocalKey;
  const endDate = validRangeEnd;
  const yesterdayDate = shiftDateKey(endDate, -1);
  let startDate =
    rangeOverride?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(rangeOverride.startDate)
      ? rangeOverride.startDate
      : shiftDateKey(endDate, -13);
  if (startDate > endDate) {
    startDate = shiftDateKey(endDate, -13);
  }
  const minAllowedStart = shiftDateKey(endDate, -41);
  if (startDate < minAllowedStart) {
    startDate = minAllowedStart;
  }

  const [
    dailySummariesRes,
    todayUserSummaryRes,
    sleepSummariesRes,
    todaySleepRes,
    stepsRes,
    stressRes,
    hydrationRes,
    bodyBatteryRes,
    dailyHrRes,
    yesterdayHrRes,
    hrvRes,
    spo2TodayRes,
    spo2YesterdayRes,
    vo2Res,
    weightRes,
    activitiesRes,
  ] = await Promise.all([
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/usersummary-service/v2/dailysummaries?startDate=${startDate}&endDate=${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/usersummary-service/usersummary/daily?calendarDate=${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${startDate}&endDate=${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/sleep-service/sleep/dailySleep?date=${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/usersummary-service/stats/steps/daily/${startDate}/${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/usersummary-service/stats/stress/daily/${startDate}/${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/usersummary-service/stats/hydration/daily/${startDate}/${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${startDate}&endDate=${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/wellness-service/wellness/dailyHeartRate?date=${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/wellness-service/wellness/dailyHeartRate?date=${yesterdayDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/hrv-service/hrv/daily/${startDate}/${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/wellness-service/wellness/daily/spo2acclimation/${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/wellness-service/wellness/daily/spo2acclimation/${yesterdayDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/metrics-service/metrics/maxmet/daily/${startDate}/${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/weight-service/weight/range/${startDate}/${endDate}`,
      tokenRef
    ),
    fetchGarminPersonalEndpoint(
      apiKey,
      baseUrl,
      `/activitylist-service/activities/search/activities?start=0&limit=100`,
      tokenRef
    ),
  ]);

  const coreResponses = [
    dailySummariesRes,
    todayUserSummaryRes,
    sleepSummariesRes,
    todaySleepRes,
    stepsRes,
  ];
  const anySucceeded = [
    ...coreResponses,
    stressRes,
    hydrationRes,
    bodyBatteryRes,
    dailyHrRes,
    hrvRes,
    vo2Res,
    weightRes,
    activitiesRes,
  ].some((r) => r.ok);

  if (!anySucceeded) {
    const authFail = coreResponses.find((r) => r.status === 401 || r.status === 403);
    if (authFail) {
      throw new GarminApiAuthError(
        `Garmin Personal API hat den Zugriff verweigert (HTTP ${authFail.status}). Bitte prüfe deinen GARMIN_PERSONAL_API_KEY in Settings > Secrets.`,
        authFail.status
      );
    }
    throw new Error(
      'Garmin Personal API ist aktuell nicht erreichbar oder lieferte keine gültige Antwort.'
    );
  }

  const dayMap = new Map<string, DayAccumulator>();
  let garminLastSyncAt: number | null = null;

  // 1. Daily Summaries (v2 + daily user summary)
  const dailySummaryItems = [
    ...unwrapGarminList(dailySummariesRes.json, ['data', 'dailySummaries']),
    ...unwrapGarminList(todayUserSummaryRes.json, ['data']),
  ];
  for (const d of dailySummaryItems) {
    const syncTs =
      parseGarminGmtTimestampMs(d.lastSyncTimestampGMT) ??
      parseGarminGmtTimestampMs(d.wellnessEndTimeGmt) ??
      parseGarminGmtTimestampMs(d.wellnessChronology?.endTimestampGmt);
    if (syncTs && (!garminLastSyncAt || syncTs > garminLastSyncAt)) {
      garminLastSyncAt = syncTs;
    }

    const dk =
      normalizeGarminDateKey(d.calendarDate) ||
      normalizeGarminDateKey(d.summaryDate) ||
      normalizeGarminDateKey(d.startTimeGMT) ||
      normalizeGarminDateKey(d.startTimeInSeconds);
    if (!dk || dk < startDate || dk > endDate) continue;

    const modMin = Number(
      d.intensityMinutes?.moderate ??
        d.moderateIntensityMinutes ??
        (typeof d.moderateIntensityDurationInSeconds === 'number'
          ? Math.round(d.moderateIntensityDurationInSeconds / 60)
          : 0)
    );
    const vigMin = Number(
      d.intensityMinutes?.vigorous ??
        d.vigorousIntensityMinutes ??
        (typeof d.vigorousIntensityDurationInSeconds === 'number'
          ? Math.round(d.vigorousIntensityDurationInSeconds / 60)
          : 0)
    );
    const intensityMin =
      (Number.isFinite(modMin) ? modMin : 0) + (Number.isFinite(vigMin) ? vigMin : 0);
    const activeSec = Number(d.activeSeconds ?? d.activeTimeInSeconds ?? 0);
    const activeMin =
      intensityMin > 0
        ? Math.round(intensityMin)
        : Number.isFinite(activeSec) && activeSec > 0
        ? Math.round(activeSec / 60)
        : 0;
    const heartPts = intensityMin > 0 ? Math.round(modMin + vigMin * 2) : null;

    const stepsRaw =
      d.movement?.steps?.value ?? d.movement?.steps ?? d.totalSteps ?? d.steps ?? null;
    const distRaw =
      d.movement?.steps?.distanceInMeters ??
      d.movement?.distance?.value ??
      d.movement?.distanceMeters ??
      d.totalDistanceMeters ??
      d.distanceInMeters ??
      null;
    const calRaw =
      d.calories?.burnedActive ??
      d.calories?.active?.value ??
      d.calories?.active ??
      d.activeKilocalories ??
      null;
    const floorsRaw =
      d.movement?.floorsAscended?.value ??
      d.floors?.ascended ??
      d.floorsAscended ??
      d.floorsClimbed ??
      null;
    const rhrRaw =
      d.heartRate?.restingValue ??
      d.restingHeartRate ??
      d.restingHeartRateInBeatsPerMinute ??
      null;
    const avgHrRaw =
      d.heartRate?.avgValue ??
      d.averageHeartRate ??
      d.averageHeartRateInBeatsPerMinute ??
      null;
    const stressRaw = d.stress?.avgLevel ?? d.averageStressLevel ?? null;
    const bbRaw =
      d.bodyBattery?.maxValue ??
      d.bodyBattery?.mostRecentValue ??
      d.bodyBatteryMostRecentValue ??
      d.bodyBatteryHighestValue ??
      d.bodyBatteryChargedValue ??
      null;
    const spo2Raw =
      d.spo2?.avgValue ?? d.averageSpo2 ?? d.averageSpo2Value ?? d.latestSpo2 ?? null;
    const respRaw =
      d.respiration?.avgValue ?? d.avgWakingRespirationValue ?? null;
    const hydRaw =
      d.hydration?.consumedInMl ??
      d.hydration?.valueInML ??
      d.hydrationIntakeInML ??
      d.hydrationIntakeInMl ??
      null;

    mergeDayMetric(dayMap, dk, {
      activityMinutes: activeMin,
      steps: typeof stepsRaw === 'number' ? stepsRaw : null,
      distanceMeters: typeof distRaw === 'number' ? distRaw : null,
      caloriesActive: typeof calRaw === 'number' ? calRaw : null,
      floorsClimbed: typeof floorsRaw === 'number' ? floorsRaw : null,
      heartPoints: heartPts,
      restingHeartRate: typeof rhrRaw === 'number' && rhrRaw > 0 ? rhrRaw : null,
      avgHeartRate:
        typeof avgHrRaw === 'number' && avgHrRaw > 0
          ? avgHrRaw
          : typeof rhrRaw === 'number' && rhrRaw > 0
          ? rhrRaw
          : null,
      stressLevel: typeof stressRaw === 'number' && stressRaw >= 0 ? stressRaw : null,
      bodyBattery: typeof bbRaw === 'number' && bbRaw >= 0 ? bbRaw : null,
      spo2Percent: typeof spo2Raw === 'number' && spo2Raw > 0 ? spo2Raw : null,
      respirationRate: typeof respRaw === 'number' && respRaw > 0 ? respRaw : null,
      hydrationMl: typeof hydRaw === 'number' && hydRaw > 0 ? hydRaw : null,
    });
  }

  // 2. Sleep Summaries + Today Sleep (deduplicated per wake-up calendarDate)
  const sleepMap = new Map<
    string,
    {
      mins: number;
      deep: number;
      light: number;
      rem: number;
      awake: number;
      rhr: number | null;
      hrv: number | null;
      spo2: number | null;
      resp: number | null;
    }
  >();

  const rawSleepItems = [
    ...unwrapGarminList(sleepSummariesRes.json, ['data', 'sleepSummaries', 'dailySleepDTOs']),
    ...unwrapGarminList(todaySleepRes.json, ['data']),
  ];
  for (const wrapper of rawSleepItems) {
    const dto =
      wrapper.dailySleepDTO && typeof wrapper.dailySleepDTO === 'object'
        ? (wrapper.dailySleepDTO as Record<string, any>)
        : wrapper;
    const dk =
      normalizeGarminDateKey(dto.calendarDate) ||
      normalizeGarminDateKey(wrapper.calendarDate) ||
      normalizeGarminDateKey(dto.sleepEndTimestampLocal) ||
      normalizeGarminDateKey(dto.sleepEndTimestampGMT) ||
      normalizeGarminDateKey(dto.startTimeInSeconds);
    if (!dk || dk < startDate || dk > endDate) continue;

    const deep = Math.round(Number(dto.deepSleepSeconds ?? dto.deepSleepDurationInSeconds ?? 0) / 60);
    const light = Math.round(Number(dto.lightSleepSeconds ?? dto.lightSleepDurationInSeconds ?? 0) / 60);
    const rem = Math.round(Number(dto.remSleepSeconds ?? dto.remSleepInSeconds ?? 0) / 60);
    const awake = Math.round(Number(dto.awakeSleepSeconds ?? dto.awakeDurationInSeconds ?? 0) / 60);
    const totalSecRaw = Number(dto.sleepTimeSeconds ?? dto.durationInSeconds ?? 0);
    const stageSumMin = deep + light + rem;
    const mins = totalSecRaw > 0 ? Math.round(totalSecRaw / 60) : stageSumMin;
    if (mins <= 0 && stageSumMin <= 0) continue;

    const rhr = Number(wrapper.restingHeartRate ?? dto.restingHeartRate ?? 0);
    const hrv = Number(wrapper.avgOvernightHrv ?? dto.avgOvernightHrv ?? 0);
    const spo2 = Number(
      dto.averageSpO2Value ?? dto.averageSpo2Value ?? wrapper.averageSpO2Value ?? 0
    );
    const resp = Number(
      dto.averageRespirationValue ??
        dto.avgSleepRespirationValue ??
        wrapper.averageRespirationValue ??
        0
    );

    const candidate = {
      mins: Math.max(mins, stageSumMin),
      deep,
      light,
      rem,
      awake,
      rhr: rhr > 0 ? rhr : null,
      hrv: hrv > 0 ? hrv : null,
      spo2: spo2 > 0 ? spo2 : null,
      resp: resp > 0 ? resp : null,
    };

    const prev = sleepMap.get(dk);
    if (
      !prev ||
      candidate.deep + candidate.light + candidate.rem > prev.deep + prev.light + prev.rem ||
      candidate.mins > prev.mins
    ) {
      sleepMap.set(dk, candidate);
    }
  }

  for (const [dk, v] of sleepMap.entries()) {
    mergeDayMetric(dayMap, dk, {
      sleepMinutes: v.mins,
      sleepDeepMinutes: v.deep > 0 ? v.deep : null,
      sleepLightMinutes: v.light > 0 ? v.light : null,
      sleepRemMinutes: v.rem > 0 ? v.rem : null,
      sleepAwakeMinutes: v.awake > 0 ? v.awake : null,
      restingHeartRate: v.rhr,
      hrvMs: v.hrv,
      spo2Percent: v.spo2,
      respirationRate: v.resp,
    });
  }

  // 3. Steps stats
  for (const item of unwrapGarminList(stepsRes.json, ['data'])) {
    const dk = normalizeGarminDateKey(item.calendarDate);
    if (!dk) continue;
    const steps = item.totalSteps ?? item.steps ?? item.values?.totalSteps ?? item.values?.steps;
    const dist = item.totalDistance ?? item.totalDistanceMeters ?? item.values?.totalDistance;
    mergeDayMetric(dayMap, dk, {
      steps: typeof steps === 'number' ? steps : null,
      distanceMeters: typeof dist === 'number' ? dist : null,
    });
  }

  // 4. Stress stats
  for (const item of unwrapGarminList(stressRes.json, ['data'])) {
    const dk = normalizeGarminDateKey(item.calendarDate);
    if (!dk) continue;
    const lvl =
      item.overallStressLevel ??
      item.avgStressLevel ??
      item.values?.overallStressLevel ??
      item.values?.avgStressLevel;
    if (typeof lvl === 'number' && lvl >= 0) {
      mergeDayMetric(dayMap, dk, { stressLevel: lvl });
    }
  }

  // 5. Hydration stats
  for (const item of unwrapGarminList(hydrationRes.json, ['data'])) {
    const dk = normalizeGarminDateKey(item.calendarDate);
    if (!dk) continue;
    const ml =
      item.valueInML ??
      item.hydrationIntakeInML ??
      item.hydrationIntakeInMl ??
      item.values?.valueInML;
    if (typeof ml === 'number' && ml > 0) {
      mergeDayMetric(dayMap, dk, { hydrationMl: ml });
    }
  }

  // 6. Body Battery daily reports
  for (const item of unwrapGarminList(bodyBatteryRes.json, ['data'])) {
    const dk = normalizeGarminDateKey(item.date || item.calendarDate);
    if (!dk) continue;
    let bb: number | null = null;
    if (Array.isArray(item.bodyBatteryValuesArray) && item.bodyBatteryValuesArray.length > 0) {
      const levels: number[] = [];
      for (const row of item.bodyBatteryValuesArray) {
        if (Array.isArray(row)) {
          // Tuple formats seen in Garmin API: [offsetMs, level] or [ts, status, level, version]
          const candidate =
            typeof row[2] === 'number'
              ? row[2]
              : typeof row[1] === 'number'
              ? row[1]
              : null;
          if (candidate !== null && candidate >= 0 && candidate <= 100) {
            levels.push(candidate);
          }
        }
      }
      if (levels.length > 0) {
        bb = Math.max(...levels);
      }
    }
    if (bb === null) {
      const fallback =
        item.bodyBatteryHighestValue ??
        item.bodyBatteryMostRecentValue ??
        item.charged ??
        null;
      if (typeof fallback === 'number' && fallback >= 0 && fallback <= 100) {
        bb = fallback;
      }
    }
    if (bb !== null) {
      mergeDayMetric(dayMap, dk, { bodyBattery: bb });
    }
  }

  // 7. Daily Heart Rate (today + yesterday)
  for (const hrPayload of [dailyHrRes.json, yesterdayHrRes.json]) {
    for (const item of unwrapGarminList(hrPayload, ['data'])) {
      const dk = normalizeGarminDateKey(item.calendarDate);
      if (!dk) continue;
      const rhr = typeof item.restingHeartRate === 'number' ? item.restingHeartRate : null;
      let avgHr: number | null = null;
      if (Array.isArray(item.heartRateValues)) {
        const bpms: number[] = [];
        for (const pair of item.heartRateValues) {
          const val = Array.isArray(pair) ? pair[1] : pair?.bpm;
          if (typeof val === 'number' && val >= 25 && val <= 240) {
            bpms.push(val);
          }
        }
        if (bpms.length > 0) {
          avgHr = bpms.reduce((a, b) => a + b, 0) / bpms.length;
        }
      }
      mergeDayMetric(dayMap, dk, {
        restingHeartRate: rhr && rhr > 0 ? rhr : null,
        avgHeartRate: avgHr,
      });
    }
  }

  // 8. HRV daily summaries
  for (const item of unwrapGarminList(hrvRes.json, ['hrvSummaries', 'data'])) {
    const dk = normalizeGarminDateKey(item.calendarDate);
    if (!dk) continue;
    const hrv = Number(item.lastNightAvg ?? item.weeklyAvg ?? 0);
    if (hrv > 0) {
      mergeDayMetric(dayMap, dk, { hrvMs: hrv });
    }
  }

  // 9. SpO2 Acclimation
  for (const spo2Payload of [spo2TodayRes.json, spo2YesterdayRes.json]) {
    for (const item of unwrapGarminList(spo2Payload, ['data'])) {
      const dk = normalizeGarminDateKey(item.calendarDate);
      if (!dk) continue;
      const val = Number(item.averageSpo2 ?? item.avgSpo2 ?? item.latestSpo2 ?? 0);
      if (val >= 50 && val <= 100) {
        mergeDayMetric(dayMap, dk, { spo2Percent: val });
      }
    }
  }

  // 10. Max MET / VO2 Max
  for (const item of unwrapGarminList(vo2Res.json, ['data'])) {
    const dk = normalizeGarminDateKey(item.calendarDate || item.generic?.calendarDate || item.cycling?.calendarDate);
    if (!dk) continue;
    const vo2 = Number(
      item.generic?.vo2MaxPreciseValue ??
        item.generic?.vo2MaxValue ??
        item.cycling?.vo2MaxPreciseValue ??
        item.cycling?.vo2MaxValue ??
        item.vo2MaxPrecise ??
        item.vo2Max ??
        item.maxMetPrecise ??
        item.maxMet ??
        0
    );
    if (vo2 > 0) {
      mergeDayMetric(dayMap, dk, { vo2Max: vo2 });
    }
  }

  // 11. Weight / Body Composition
  for (const item of unwrapGarminList(weightRes.json, ['dailyWeightSummaries', 'dateWeightList', 'data'])) {
    const metric =
      item.latestWeight && typeof item.latestWeight === 'object'
        ? (item.latestWeight as Record<string, any>)
        : Array.isArray(item.allWeightMetrics) && item.allWeightMetrics.length > 0
        ? (item.allWeightMetrics[item.allWeightMetrics.length - 1] as Record<string, any>)
        : item;
    const dk =
      normalizeGarminDateKey(item.summaryDate) ||
      normalizeGarminDateKey(item.calendarDate) ||
      normalizeGarminDateKey(metric.calendarDate) ||
      normalizeGarminDateKey(metric.date);
    if (!dk) continue;

    const rawWeight = Number(metric.weight ?? item.weight ?? 0);
    const weightKg = rawWeight > 400 ? rawWeight / 1000 : rawWeight > 0 ? rawWeight : null;
    const bodyFatRaw = metric.bodyFat ?? metric.bodyFatPercentage ?? item.bodyFat ?? null;
    const bodyFatPercent = typeof bodyFatRaw === 'number' && bodyFatRaw > 0 ? bodyFatRaw : null;

    if (weightKg || bodyFatPercent) {
      mergeDayMetric(dayMap, dk, { weightKg, bodyFatPercent });
    }
  }

  // 12. Activities (Workouts count + duration/calories/distance/HR supplements + individual activity list)
  const activityRollup = new Map<
    string,
    { count: number; durationMin: number; calories: number; distanceMeters: number }
  >();
  const activities: RemoteGarminWorkoutActivity[] = [];
  for (const act of unwrapGarminList(activitiesRes.json, ['activityList', 'data'])) {
    const dk =
      normalizeGarminDateKey(act.startTimeLocal) ||
      normalizeGarminDateKey(act.startTimeGMT) ||
      normalizeGarminDateKey(act.beginTimestamp);
    if (!dk) continue;

    const durSec =
      [act.duration, act.movingDuration, act.elapsedDuration]
        .map((v) => Number(v))
        .find((v) => Number.isFinite(v) && v > 0) ?? 0;
    const durMin = durSec > 0 ? Math.max(1, Math.round(durSec / 60)) : 0;
    const cal = Number(act.calories ?? 0);
    const dist = Number(act.distance ?? 0);
    const actTypeObj =
      act.activityType && typeof act.activityType === 'object'
        ? (act.activityType as Record<string, unknown>)
        : null;
    const sportKey =
      (typeof actTypeObj?.typeKey === 'string' && actTypeObj.typeKey) ||
      (typeof act.activityType === 'string' ? act.activityType : '') ||
      'other';
    const rawName =
      (typeof act.activityName === 'string' && act.activityName.trim()) || sportKey;
    const rawId = act.activityId ?? act.id ?? `${dk}-${rawName}-${durMin}`;

    activities.push({
      id: String(rawId),
      dateKey: dk,
      name: rawName,
      sportType: sportKey,
      startTimeLocal: typeof act.startTimeLocal === 'string' ? act.startTimeLocal : null,
      durationMinutes: durMin,
      distanceMeters: dist > 0 ? Math.round(dist) : null,
      calories: cal > 0 ? Math.round(cal) : null,
      avgHeartRate:
        typeof act.averageHR === 'number' && act.averageHR > 0 ? Math.round(act.averageHR) : null,
      maxHeartRate:
        typeof act.maxHR === 'number' && act.maxHR > 0 ? Math.round(act.maxHR) : null,
    });

    if (dk < startDate || dk > endDate) continue;

    const prev = activityRollup.get(dk) || {
      count: 0,
      durationMin: 0,
      calories: 0,
      distanceMeters: 0,
    };
    activityRollup.set(dk, {
      count: prev.count + 1,
      durationMin: prev.durationMin + (durSec > 0 ? Math.round(durSec / 60) : 0),
      calories: prev.calories + (cal > 0 ? Math.round(cal) : 0),
      distanceMeters: prev.distanceMeters + (dist > 0 ? Math.round(dist) : 0),
    });

    if (typeof act.averageHR === 'number' && act.averageHR > 0) {
      mergeDayMetric(dayMap, dk, { avgHeartRate: act.averageHR });
    }
  }

  for (const [dk, agg] of activityRollup.entries()) {
    mergeDayMetric(dayMap, dk, {
      workoutsCount: agg.count,
      activityMinutes: agg.durationMin > 0 ? agg.durationMin : undefined,
      caloriesActive: agg.calories > 0 ? agg.calories : null,
      distanceMeters: agg.distanceMeters > 0 ? agg.distanceMeters : null,
    });
  }

  return {
    days: finalizeDayMap(dayMap),
    activities,
    garminLastSyncAt,
  };
}

export function registerHealthOAuthRoutes(app: Express) {
  // Provider configuration & live session status
  app.get('/api/health/providers/status', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const garminCfg = getGarminConfig(req);
    const garminSession = getSessionForProvider(req, 'garmin');
    const garminApiKeyConnected =
      garminCfg.authMode === 'api_key' && !isGarminApiKeyManuallyDisconnected(req);

    res.json({
      garmin: {
        configured: garminCfg.configured,
        connected: garminCfg.authMode === 'api_key' ? garminApiKeyConnected : Boolean(garminSession),
        authMode: garminCfg.authMode,
        callbackUrl: garminCfg.callbackUrl,
        connectedAt:
          garminSession?.session.connectedAt ||
          (garminApiKeyConnected ? SERVER_STARTED_AT : null),
      },
    });
  });

  // Garmin Connect: Build OAuth 2.0 PKCE Authorization URL OR connect directly via Personal API Key
  app.get('/api/health/garmin/auth-url', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    pruneExpiredStates();
    const cfg = getGarminConfig(req);
    if (!cfg.configured) {
      res.status(200).json({
        configured: false,
        authMode: null,
        callbackUrl: cfg.callbackUrl,
        error:
          'Garmin Connect ist noch nicht konfiguriert. Bitte hinterlege GARMIN_PERSONAL_API_KEY in Settings > Secrets und lade die App neu.',
      });
      return;
    }

    if (cfg.authMode === 'api_key') {
      try {
        await getGarminPersonalBearerToken(cfg.personalApiKey, cfg.personalApiBaseUrl, true);
        setGarminApiKeyOffCookie(res, false);
        const sessionToken = base64UrlEncode(crypto.randomBytes(32));
        const connectedAt = Date.now();
        sessions.set(sessionToken, {
          provider: 'garmin',
          accessToken: 'personal-api-key',
          expiresAt: connectedAt + 24 * 3600 * 1000,
          connectedAt,
        });
        setHealthSessionCookie(res, 'garmin', sessionToken);
        res.json({
          mode: 'api_key',
          connected: true,
          sessionToken,
          connectedAt,
        });
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Garmin Personal API Key konnte nicht verifiziert werden.';
        const status = err instanceof GarminApiAuthError ? err.status : 502;
        res.status(status).json({ error: msg });
      }
      return;
    }

    const codeVerifier = base64UrlEncode(crypto.randomBytes(48));
    const codeChallenge = base64UrlEncode(
      crypto.createHash('sha256').update(codeVerifier).digest()
    );
    const state = base64UrlEncode(crypto.randomBytes(24));

    pendingStates.set(state, {
      provider: 'garmin',
      codeVerifier,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: cfg.callbackUrl,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    res.json({
      mode: 'oauth',
      url: `https://connect.garmin.com/oauth2Confirm?${params.toString()}`,
    });
  });

  // Garmin Connect: OAuth Callback
  const handleGarminCallback = async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) {
      res
        .status(400)
        .send(
          renderPopupResultHtml(
            { type: 'HEALTH_OAUTH_ERROR', provider: 'garmin', message: `Garmin-Autorisierung abgelehnt (${error}).` },
            'Garmin-Verbindung wurde abgebrochen.'
          )
        );
      return;
    }

    if (!code || !state) {
      res
        .status(400)
        .send(
          renderPopupResultHtml(
            { type: 'HEALTH_OAUTH_ERROR', provider: 'garmin', message: 'Fehlender Code oder State von Garmin.' },
            'Ungültige Antwort von Garmin Connect.'
          )
        );
      return;
    }

    const pending = pendingStates.get(state);
    pendingStates.delete(state);
    if (!pending || pending.provider !== 'garmin' || !pending.codeVerifier) {
      res
        .status(400)
        .send(
          renderPopupResultHtml(
            { type: 'HEALTH_OAUTH_ERROR', provider: 'garmin', message: 'OAuth-State abgelaufen oder ungültig.' },
            'Anfrage abgelaufen. Bitte erneut versuchen.'
          )
        );
      return;
    }

    try {
      const cfg = getGarminConfig(req);
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        code_verifier: pending.codeVerifier,
        redirect_uri: cfg.callbackUrl,
      });

      const tokenResp = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!tokenResp.ok) {
        const text = await tokenResp.text();
        throw new Error(`Garmin Token-Tausch fehlgeschlagen (${tokenResp.status}): ${text.slice(0, 160)}`);
      }

      const tokenData = (await tokenResp.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!tokenData.access_token) {
        throw new Error('Kein Access-Token von Garmin erhalten.');
      }

      const sessionToken = base64UrlEncode(crypto.randomBytes(32));
      const connectedAt = Date.now();
      sessions.set(sessionToken, {
        provider: 'garmin',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: connectedAt + (tokenData.expires_in || 3600) * 1000,
        connectedAt,
      });

      setHealthSessionCookie(res, 'garmin', sessionToken);
      res.send(
        renderPopupResultHtml(
          {
            type: 'HEALTH_OAUTH_SUCCESS',
            provider: 'garmin',
            sessionToken,
            connectedAt,
          },
          'Garmin Connect erfolgreich verbunden! Daten werden synchronisiert...'
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Garmin-Verbindung fehlgeschlagen.';
      console.error('Garmin OAuth callback error:', err);
      res
        .status(500)
        .send(
          renderPopupResultHtml(
            { type: 'HEALTH_OAUTH_ERROR', provider: 'garmin', message: msg },
            msg
          )
        );
    }
  };
  app.get(['/api/health/garmin/callback', '/api/health/garmin/callback/'], handleGarminCallback);

  // Garmin Connect: Direct Sync (Personal API Key or OAuth)
  app.post('/api/health/garmin/sync', async (req: Request, res: Response) => {
    const cfg = getGarminConfig(req);
    const bodyObj = (req.body || {}) as {
      localDate?: unknown;
      startDate?: unknown;
      endDate?: unknown;
    };
    const rawLocalDate =
      typeof bodyObj.localDate === 'string'
        ? bodyObj.localDate.trim()
        : typeof req.query?.localDate === 'string'
        ? req.query.localDate.trim()
        : undefined;
    const rawStartDate =
      typeof bodyObj.startDate === 'string' ? bodyObj.startDate.trim() : undefined;
    const rawEndDate =
      typeof bodyObj.endDate === 'string' ? bodyObj.endDate.trim() : undefined;

    if (cfg.authMode === 'api_key') {
      if (isGarminApiKeyManuallyDisconnected(req)) {
        res.status(401).json({ error: 'Garmin Connect wurde getrennt. Bitte erneut verbinden.' });
        return;
      }
      try {
        const { days, activities, garminLastSyncAt } = await fetchGarminPersonalApiMetrics(
          cfg.personalApiKey,
          cfg.personalApiBaseUrl,
          rawLocalDate,
          rawStartDate || rawEndDate ? { startDate: rawStartDate, endDate: rawEndDate } : undefined
        );
        res.json({
          provider: 'garmin_connect',
          authMode: 'api_key',
          days,
          activities,
          garminLastSyncAt,
          syncedAt: Date.now(),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Garmin-Sync fehlgeschlagen.';
        const status = err instanceof GarminApiAuthError ? err.status : 502;
        console.error('Garmin Personal API sync error:', err);
        res.status(status).json({ error: msg });
      }
      return;
    }

    const found = getSessionForProvider(req, 'garmin');
    if (!found) {
      res.status(401).json({ error: 'Garmin Connect ist nicht verbunden.' });
      return;
    }

    try {
      const days = await fetchGarminHealthMetrics(found.session);
      res.json({
        provider: 'garmin_connect',
        authMode: 'oauth',
        days,
        garminLastSyncAt: null,
        syncedAt: Date.now(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Garmin-Sync fehlgeschlagen.';
      console.error('Garmin sync error:', err);
      res.status(502).json({ error: msg });
    }
  });

  // Garmin Connect: Optional Push Webhook Receiver
  app.post('/api/health/garmin/webhook', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      dailies?: GarminDailyItem[];
      sleeps?: GarminSleepItem[];
    };

    if (Array.isArray(body.dailies)) {
      for (const item of body.dailies) {
        if (!item.userId) continue;
        const bucket = garminWebhookCache.get(item.userId) || { dailies: [], sleeps: [] };
        bucket.dailies = [item, ...bucket.dailies].slice(0, 30);
        garminWebhookCache.set(item.userId, bucket);
      }
    }
    if (Array.isArray(body.sleeps)) {
      for (const item of body.sleeps) {
        if (!item.userId) continue;
        const bucket = garminWebhookCache.get(item.userId) || { dailies: [], sleeps: [] };
        bucket.sleeps = [item, ...bucket.sleeps].slice(0, 30);
        garminWebhookCache.set(item.userId, bucket);
      }
    }

    res.status(200).json({ received: true });
  });

  // Garmin Connect: Disconnect
  app.post('/api/health/garmin/disconnect', (req: Request, res: Response) => {
    const found = getSessionForProvider(req, 'garmin');
    if (found) {
      sessions.delete(found.sessionToken);
    }
    clearHealthSessionCookie(res, 'garmin');
    const cfg = getGarminConfig(req);
    if (cfg.authMode === 'api_key') {
      setGarminApiKeyOffCookie(res, true);
    }
    res.json({ disconnected: true });
  });
}
