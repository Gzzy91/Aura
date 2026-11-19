import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

type ProviderId = 'garmin' | 'google';
type GoogleApiMode = 'google_health' | 'google_fit';

interface PendingOAuthState {
  provider: ProviderId;
  codeVerifier?: string;
  apiMode?: GoogleApiMode;
  createdAt: number;
}

interface HealthOAuthSession {
  provider: ProviderId;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  apiMode?: GoogleApiMode;
  grantedScopes?: string[];
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

function getGoogleHealthConfig(req?: Request) {
  const clientId = (
    process.env.GOOGLE_HEALTH_CLIENT_ID ||
    process.env.GOOGLE_FIT_CLIENT_ID ||
    ''
  ).trim();
  const clientSecret = (
    process.env.GOOGLE_HEALTH_CLIENT_SECRET ||
    process.env.GOOGLE_FIT_CLIENT_SECRET ||
    ''
  ).trim();
  const callbackUrl = `${getAppBaseUrl(req)}/api/health/google/callback`;
  return {
    clientId,
    clientSecret,
    callbackUrl,
    configured: Boolean(clientId && clientSecret),
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

async function ensureValidGoogleToken(session: HealthOAuthSession): Promise<string> {
  if (Date.now() < session.expiresAt - 60_000) {
    return session.accessToken;
  }
  if (!session.refreshToken) {
    throw new Error('Google Health-Sitzung abgelaufen. Bitte erneut verbinden.');
  }

  const cfg = getGoogleHealthConfig();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: session.refreshToken,
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    throw new Error('Google-Token konnte nicht aktualisiert werden. Bitte erneut verbinden.');
  }
  const tokenData = (await resp.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokenData.access_token) {
    throw new Error('Ungültige Token-Antwort von Google OAuth.');
  }
  session.accessToken = tokenData.access_token;
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
      Accept: 'application/json',
    },
  });

  const rawText = await resp.text().catch(() => '');
  let parsed: { access_token?: string; token?: string; expires_in?: number; message?: string } = {};
  if (rawText.trim().startsWith('{')) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {};
    }
  } else if (rawText.trim() && !rawText.trim().startsWith('<')) {
    // Some endpoints return a raw JWT string directly
    if (rawText.trim().split('.').length === 3) {
      parsed = { access_token: rawText.trim() };
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
        Accept: 'application/json',
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

async function fetchGarminPersonalApiMetrics(
  apiKey: string,
  baseUrl: string
): Promise<RemoteHealthDayMetric[]> {
  const initialToken = await getGarminPersonalBearerToken(apiKey, baseUrl);
  const tokenRef = { token: initialToken };

  const nowMs = Date.now();
  const endDate = toDateKey(nowMs);
  const yesterdayDate = toDateKey(nowMs - 86_400_000);
  const startDate = toDateKey(nowMs - 13 * 86_400_000);

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
      `/activitylist-service/activities/search/activities?start=0&limit=50`,
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

  // 1. Daily Summaries (v2 + daily user summary)
  const dailySummaryItems = [
    ...unwrapGarminList(dailySummariesRes.json, ['data', 'dailySummaries']),
    ...unwrapGarminList(todayUserSummaryRes.json, ['data']),
  ];
  for (const d of dailySummaryItems) {
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
      d.movement?.distance?.value ??
      d.movement?.distanceMeters ??
      d.totalDistanceMeters ??
      d.distanceInMeters ??
      null;
    const calRaw =
      d.calories?.active?.value ??
      d.calories?.active ??
      d.activeKilocalories ??
      null;
    const floorsRaw = d.floors?.ascended ?? d.floorsAscended ?? d.floorsClimbed ?? null;
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
      d.hydration?.valueInML ?? d.hydrationIntakeInML ?? d.hydrationIntakeInMl ?? null;

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

  // 12. Activities (Workouts count + duration/calories/distance/HR supplements)
  const activityRollup = new Map<
    string,
    { count: number; durationMin: number; calories: number; distanceMeters: number }
  >();
  for (const act of unwrapGarminList(activitiesRes.json, ['activityList', 'data'])) {
    const dk =
      normalizeGarminDateKey(act.startTimeLocal) ||
      normalizeGarminDateKey(act.startTimeGMT) ||
      normalizeGarminDateKey(act.beginTimestamp);
    if (!dk || dk < startDate || dk > endDate) continue;

    const prev = activityRollup.get(dk) || {
      count: 0,
      durationMin: 0,
      calories: 0,
      distanceMeters: 0,
    };
    const durSec = Number(act.movingDuration ?? act.duration ?? act.elapsedDuration ?? 0);
    const cal = Number(act.calories ?? 0);
    const dist = Number(act.distance ?? 0);
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

  return finalizeDayMap(dayMap);
}

async function parseGoogleApiError(resp: globalThis.Response, apiLabel: string): Promise<string> {
  const raw = await resp.text().catch(() => '');
  let message = '';
  let reason = '';
  let activationUrl = '';

  try {
    const json = JSON.parse(raw) as {
      error?: {
        message?: string;
        status?: string;
        errors?: Array<{ reason?: string; message?: string }>;
        details?: Array<{ metadata?: { activationUrl?: string; consumer?: string }; reason?: string }>;
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
    const projectMatch = message.match(/project\s+([a-zA-Z0-9_-]+)/i);
    const projectHint = projectMatch ? ` (Projekt-ID: ${projectMatch[1]})` : '';
    const linkHint = activationUrl ? ` Link: ${activationUrl}` : '';
    return `${apiLabel} ist in deinem Google Cloud Projekt${projectHint} nicht aktiviert. Bitte aktiviere die API in demselben Projekt wie deine OAuth-Client-ID.${linkHint}`;
  }

  if (
    lower.includes('insufficient') ||
    lower.includes('scope') ||
    lower.includes('insufficientpermissions')
  ) {
    return `Fehlende Google-Berechtigungen (HTTP ${resp.status}). Bitte trenne Google Health kurz und verbinde es neu – achte im Google-Fenster darauf, alle Häkchen für Schlaf, Aktivität und Herzfrequenz zu setzen.`;
  }

  return `${apiLabel} Zugriff verweigert (HTTP ${resp.status})${
    message ? `: ${message}` : '. Bitte API-Aktivierung und Testnutzer in Google Cloud prüfen.'
  }`;
}

interface TimeInterval {
  start: number;
  end: number;
}

function mergeTimeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const valid = intervals
    .filter((iv) => Number.isFinite(iv.start) && Number.isFinite(iv.end) && iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
  if (valid.length === 0) return [];
  const merged: TimeInterval[] = [{ ...valid[0] }];
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

function subtractTimeIntervals(base: TimeInterval[], subtract: TimeInterval[]): TimeInterval[] {
  if (base.length === 0 || subtract.length === 0) return base;
  let current = base;
  for (const sub of subtract) {
    const next: TimeInterval[] = [];
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

async function fetchGoogleHealthV4Paged(
  baseUrl: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; resp?: globalThis.Response; dataPoints: Array<Record<string, any>> }> {
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

async function fetchGoogleHealthV4Metrics(
  accessToken: string,
  startMs: number,
  endMs: number
): Promise<RemoteHealthDayMetric[]> {
  const sleepQueryStartMs = startMs - 18 * 3600 * 1000;
  const startIso = new Date(sleepQueryStartMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

  const dayMap = new Map<string, DayAccumulator>();
  const authErrors: string[] = [];
  let succeededCount = 0;

  // 1. Sleep data points (prefer reconcile, fallback to raw dataPoints)
  let sleepDataPoints: Array<Record<string, any>> = [];
  const sleepReconcileUrl = `https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints:reconcile?filter=${encodeURIComponent(
    `sleep.interval.end_time>="${startIso}" AND sleep.interval.end_time<="${endIso}"`
  )}`;
  const sleepRes = await fetchGoogleHealthV4Paged(sleepReconcileUrl, headers);
  if (sleepRes.ok) {
    succeededCount += 1;
    sleepDataPoints = sleepRes.dataPoints;
  } else {
    const rawSleepRes = await fetchGoogleHealthV4Paged(
      `https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints`,
      headers
    );
    if (rawSleepRes.ok) {
      succeededCount += 1;
      sleepDataPoints = rawSleepRes.dataPoints;
    } else if (rawSleepRes.resp && (rawSleepRes.status === 401 || rawSleepRes.status === 403)) {
      authErrors.push(await parseGoogleApiError(rawSleepRes.resp, 'Google Health API v4'));
    }
  }

  // Deduplicate overlapping sleep sessions and capture sleep stage breakdown per wake-up day
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
    const dateKey = toDateKey(endParsed);

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
        sleepSessions[overlapIdx] = { start: sMs, end: endParsed, mins, deep, light, rem, awake, dateKey };
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
    mergeDayMetric(dayMap, dateKey, {
      sleepMinutes: v.mins,
      sleepDeepMinutes: v.deep > 0 ? v.deep : null,
      sleepLightMinutes: v.light > 0 ? v.light : null,
      sleepRemMinutes: v.rem > 0 ? v.rem : null,
      sleepAwakeMinutes: v.awake > 0 ? v.awake : null,
    });
  }

  // 2. Parallel fetches for all other Health API v4 dataTypes
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
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/active-minutes/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/heart-rate/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/distance/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/active-calories-burned/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/floors-climbed/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/resting-heart-rate/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/heart-rate-variability/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/oxygen-saturation/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/respiratory-rate/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/vo2-max/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/weight/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/body-fat/dataPoints', headers),
    fetchGoogleHealthV4Paged('https://health.googleapis.com/v4/users/me/dataTypes/hydration/dataPoints', headers),
  ]);

  const sumByDay = async (
    res: { ok: boolean; status: number; resp?: globalThis.Response; dataPoints: Array<Record<string, any>> },
    extractor: (dp: Record<string, any>) => { ts: number; val: number } | null,
    assign: (dk: string, sum: number) => void,
    isCritical = false
  ) => {
    if (!res.ok) {
      if (isCritical && res.resp && (res.status === 401 || res.status === 403)) {
        authErrors.push(await parseGoogleApiError(res.resp, 'Google Health API v4'));
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
      const dk = toDateKey(parsed.ts);
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
    (dk, sum) => mergeDayMetric(dayMap, dk, { activityMinutes: sum }),
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
      const dk = toDateKey(e);
      const prev = exByDay.get(dk) || { mins: 0, count: 0 };
      exByDay.set(dk, { mins: prev.mins + Math.round((e - s) / 60_000), count: prev.count + 1 });
    }
    for (const [dk, v] of exByDay.entries()) {
      mergeDayMetric(dayMap, dk, { activityMinutes: v.mins, workoutsCount: v.count });
    }
  } else if (exerciseRes.resp && (exerciseRes.status === 401 || exerciseRes.status === 403)) {
    authErrors.push(await parseGoogleApiError(exerciseRes.resp, 'Google Health API v4'));
  }

  if (hrRes.ok) {
    succeededCount += 1;
    for (const dp of hrRes.dataPoints) {
      const hr = dp.heartRate || dp.heart_rate || dp;
      const parsed = Date.parse(hr?.sampleTime || hr?.interval?.endTime || hr?.time || '');
      const bpm = Number(hr?.beatsPerMinute ?? hr?.bpm ?? 0);
      if (!Number.isNaN(parsed) && parsed >= startMs && parsed <= endMs && bpm > 0) {
        mergeDayMetric(dayMap, toDateKey(parsed), { avgHeartRate: bpm });
      }
    }
  } else if (hrRes.resp && (hrRes.status === 401 || hrRes.status === 403)) {
    authErrors.push(await parseGoogleApiError(hrRes.resp, 'Google Health API v4'));
  }

  await sumByDay(
    stepsRes,
    (dp) => {
      const obj = dp.steps || dp;
      const ts = Date.parse(obj?.interval?.endTime || obj?.interval?.end_time || '');
      const val = Number(obj?.count ?? obj?.steps ?? 0);
      return { ts, val };
    },
    (dk, sum) => mergeDayMetric(dayMap, dk, { steps: Math.round(sum) })
  );

  await sumByDay(
    distRes,
    (dp) => {
      const obj = dp.distance || dp;
      const ts = Date.parse(obj?.interval?.endTime || obj?.interval?.end_time || '');
      const val = Number(obj?.meters ?? obj?.inMeters ?? obj?.distanceMeters ?? 0);
      return { ts, val };
    },
    (dk, sum) => mergeDayMetric(dayMap, dk, { distanceMeters: Math.round(sum) })
  );

  await sumByDay(
    calRes,
    (dp) => {
      const obj = dp.activeCaloriesBurned || dp.active_calories_burned || dp;
      const ts = Date.parse(obj?.interval?.endTime || obj?.interval?.end_time || '');
      const val = Number(obj?.kcal ?? obj?.kilocalories ?? obj?.calories ?? 0);
      return { ts, val };
    },
    (dk, sum) => mergeDayMetric(dayMap, dk, { caloriesActive: Math.round(sum) })
  );

  await sumByDay(
    floorsRes,
    (dp) => {
      const obj = dp.floorsClimbed || dp.floors_climbed || dp;
      const ts = Date.parse(obj?.interval?.endTime || obj?.interval?.end_time || '');
      const val = Number(obj?.floors ?? obj?.count ?? 0);
      return { ts, val };
    },
    (dk, sum) => mergeDayMetric(dayMap, dk, { floorsClimbed: Math.round(sum) })
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
    (dk, sum) => mergeDayMetric(dayMap, dk, { hydrationMl: Math.round(sum) })
  );

  const samplePoints = (
    res: { ok: boolean; dataPoints: Array<Record<string, any>> },
    extractor: (dp: Record<string, any>) => { ts: number; partial: DayMetricPartial } | null
  ) => {
    if (!res.ok) return;
    succeededCount += 1;
    for (const dp of res.dataPoints) {
      const item = extractor(dp);
      if (!item || Number.isNaN(item.ts) || item.ts < startMs || item.ts > endMs) continue;
      mergeDayMetric(dayMap, toDateKey(item.ts), item.partial);
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
      'Google Health API v4 ist in Google Cloud für dieses Projekt nicht erreichbar. Prüfe die API-Aktivierung oder wechsle auf den Modus „Google Fit“.'
    );
  }

  return finalizeDayMap(dayMap);
}

async function fetchGoogleFitMetrics(
  accessToken: string,
  startMs: number,
  endMs: number,
  grantedScopes: string[] = []
): Promise<RemoteHealthDayMetric[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const scopeSet = new Set(grantedScopes);
  const hasScopeInfo = scopeSet.size > 0;
  const canReadSleep =
    !hasScopeInfo || scopeSet.has('https://www.googleapis.com/auth/fitness.sleep.read');
  const canReadActivity =
    !hasScopeInfo || scopeSet.has('https://www.googleapis.com/auth/fitness.activity.read');
  const canReadHeartRate =
    !hasScopeInfo || scopeSet.has('https://www.googleapis.com/auth/fitness.heart_rate.read');
  const canReadBody =
    !hasScopeInfo || scopeSet.has('https://www.googleapis.com/auth/fitness.body.read');
  const canReadOxygen =
    !hasScopeInfo || scopeSet.has('https://www.googleapis.com/auth/fitness.oxygen_saturation.read');
  const canReadNutrition =
    !hasScopeInfo || scopeSet.has('https://www.googleapis.com/auth/fitness.nutrition.read');

  if (!canReadSleep && !canReadActivity && !canReadHeartRate) {
    throw new Error(
      'Im Google-Login wurden keine Fitness-Berechtigungen (Schlaf, Aktivität oder Herzfrequenz) freigegeben. Bitte trenne Google Health und erteile beim erneuten Verbinden die Berechtigungen.'
    );
  }

  const dayMap = new Map<string, DayAccumulator>();
  const authErrors: string[] = [];
  let succeededCount = 0;

  // 1. Sleep segments + Sleep sessions (episode wake-up date + sleep stage breakdown)
  if (canReadSleep) {
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

    const lightIntervals: TimeInterval[] = [];
    const deepIntervals: TimeInterval[] = [];
    const remIntervals: TimeInterval[] = [];
    const genericAsleep: TimeInterval[] = [];
    const awakeIntervals: TimeInterval[] = [];

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
      authErrors.push(await parseGoogleApiError(sleepResp, 'Google Fit API'));
    }

    const sleepSessions: TimeInterval[] = [];
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
      authErrors.push(await parseGoogleApiError(sessResp, 'Google Fit API'));
    }

    const mergedDeep = mergeTimeIntervals(deepIntervals);
    const mergedRem = mergeTimeIntervals(remIntervals);
    const mergedLight = subtractClientOverlap(mergeTimeIntervals(lightIntervals), [
      ...mergedDeep,
      ...mergedRem,
    ]);
    const mergedDetailed = mergeTimeIntervals([...mergedDeep, ...mergedRem, ...mergedLight]);
    const mergedAwake = mergeTimeIntervals(awakeIntervals);
    const cleanGeneric = subtractTimeIntervals(
      subtractTimeIntervals(mergeTimeIntervals(genericAsleep), mergedDetailed),
      mergedAwake
    );
    const asleepIntervals = mergeTimeIntervals([...mergedDetailed, ...cleanGeneric]);

    const sleepStatsByDay = new Map<
      string,
      { mins: number; deep: number; light: number; rem: number; awake: number }
    >();

    if (asleepIntervals.length > 0) {
      const episodes: TimeInterval[][] = [[asleepIntervals[0]]];
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

      const sumOverlapMinutes = (ivs: TimeInterval[], wStart: number, wEnd: number): number => {
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
        if (mins <= 0) continue;

        const dk = toDateKey(epEnd);
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

    for (const sess of mergeTimeIntervals(sleepSessions)) {
      if (sess.end < startMs || sess.end > endMs) continue;
      const dk = toDateKey(sess.end);
      if ((sleepStatsByDay.get(dk)?.mins || 0) === 0) {
        const mins = Math.round((sess.end - sess.start) / 60_000);
        if (mins > 0) {
          sleepStatsByDay.set(dk, { mins: Math.min(1440, mins), deep: 0, light: 0, rem: 0, awake: 0 });
        }
      }
    }

    for (const [dk, st] of sleepStatsByDay.entries()) {
      mergeDayMetric(dayMap, dk, {
        sleepMinutes: st.mins,
        sleepDeepMinutes: st.deep > 0 ? st.deep : null,
        sleepLightMinutes: st.light > 0 ? st.light : null,
        sleepRemMinutes: st.rem > 0 ? st.rem : null,
        sleepAwakeMinutes: st.awake > 0 ? st.awake : null,
      });
    }
  }

  // Helper for daily bucketed Google Fit aggregate calls
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
        authErrors.push(await parseGoogleApiError(resp, 'Google Fit API'));
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
      const dateKey = toDateKey(midMs);
      const pts: Array<{ value?: Array<{ intVal?: number; fpVal?: number }> }> = [];
      for (const ds of b.dataset || []) {
        for (const p of ds.point || []) pts.push(p);
      }
      out.push({ dateKey, points: pts });
    }
    return out;
  };

  // 2. Parallel Google Fit queries for all enabled scopes
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
    canReadActivity ? queryFitBucket('com.google.active_minutes', true) : Promise.resolve([]),
    canReadActivity ? queryFitBucket('com.google.step_count.delta') : Promise.resolve([]),
    canReadActivity ? queryFitBucket('com.google.distance.delta') : Promise.resolve([]),
    canReadActivity ? queryFitBucket('com.google.calories.expended') : Promise.resolve([]),
    canReadActivity ? queryFitBucket('com.google.heart_minutes') : Promise.resolve([]),
    canReadHeartRate ? queryFitBucket('com.google.heart_rate.bpm', true) : Promise.resolve([]),
    canReadBody ? queryFitBucket('com.google.weight') : Promise.resolve([]),
    canReadBody ? queryFitBucket('com.google.body.fat.percentage') : Promise.resolve([]),
    canReadOxygen ? queryFitBucket('com.google.oxygen_saturation') : Promise.resolve([]),
    canReadNutrition ? queryFitBucket('com.google.hydration') : Promise.resolve([]),
    canReadActivity
      ? fetch(
          `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${encodeURIComponent(
            new Date(startMs).toISOString()
          )}&endTime=${encodeURIComponent(new Date(endMs).toISOString())}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  for (const b of actBuckets) {
    for (const p of b.points) {
      const mins = p.value?.[0]?.intVal ?? Math.round(p.value?.[0]?.fpVal || 0);
      if (mins > 0) mergeDayMetric(dayMap, b.dateKey, { activityMinutes: mins });
    }
  }
  for (const b of stepsBuckets) {
    for (const p of b.points) {
      const steps = p.value?.[0]?.intVal ?? Math.round(p.value?.[0]?.fpVal || 0);
      if (steps > 0) mergeDayMetric(dayMap, b.dateKey, { steps });
    }
  }
  for (const b of distBuckets) {
    for (const p of b.points) {
      const m = Math.round(p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0);
      if (m > 0) mergeDayMetric(dayMap, b.dateKey, { distanceMeters: m });
    }
  }
  for (const b of calBuckets) {
    for (const p of b.points) {
      const kcal = Math.round(p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0);
      if (kcal > 0) mergeDayMetric(dayMap, b.dateKey, { caloriesActive: kcal });
    }
  }
  for (const b of heartMinBuckets) {
    for (const p of b.points) {
      const pts = Math.round(p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0);
      if (pts > 0) mergeDayMetric(dayMap, b.dateKey, { heartPoints: pts });
    }
  }
  for (const b of hrBuckets) {
    for (const p of b.points) {
      const avg = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      const minHr = p.value?.[2]?.fpVal ?? p.value?.[2]?.intVal ?? 0;
      if (avg > 0) mergeDayMetric(dayMap, b.dateKey, { avgHeartRate: avg });
      if (minHr >= 30 && minHr <= 120) mergeDayMetric(dayMap, b.dateKey, { restingHeartRate: minHr });
    }
  }
  for (const b of weightBuckets) {
    for (const p of b.points) {
      const kg = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      if (kg >= 20 && kg <= 400) mergeDayMetric(dayMap, b.dateKey, { weightKg: kg });
    }
  }
  for (const b of fatBuckets) {
    for (const p of b.points) {
      const pct = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      if (pct >= 1 && pct <= 75) mergeDayMetric(dayMap, b.dateKey, { bodyFatPercent: pct });
    }
  }
  for (const b of spo2Buckets) {
    for (const p of b.points) {
      const pct = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      if (pct >= 50 && pct <= 100) mergeDayMetric(dayMap, b.dateKey, { spo2Percent: pct });
    }
  }
  for (const b of hydrationBuckets) {
    let litersSum = 0;
    for (const p of b.points) {
      const l = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
      if (l > 0) litersSum += l;
    }
    if (litersSum > 0) {
      mergeDayMetric(dayMap, b.dateKey, { hydrationMl: Math.round(litersSum * 1000) });
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
      if (s.activityType === 72 || s.activityType === 3) continue; // exclude Sleep & Still
      const eMs = Number(s.endTimeMillis || 0);
      const sMs = Number(s.startTimeMillis || 0);
      if (!Number.isFinite(eMs) || eMs <= sMs || eMs < startMs || eMs > endMs) continue;
      const dk = toDateKey(eMs);
      workoutByDay.set(dk, (workoutByDay.get(dk) || 0) + 1);
    }
    for (const [dk, count] of workoutByDay.entries()) {
      mergeDayMetric(dayMap, dk, { workoutsCount: count });
    }
  }

  if (succeededCount === 0 && authErrors.length > 0) {
    throw new Error(authErrors[0]);
  }

  return finalizeDayMap(dayMap);
}

function subtractClientOverlap(base: TimeInterval[], subtract: TimeInterval[]): TimeInterval[] {
  return subtractTimeIntervals(base, subtract);
}

export function registerHealthOAuthRoutes(app: Express) {
  // Provider configuration & live session status
  app.get('/api/health/providers/status', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const garminCfg = getGarminConfig(req);
    const googleCfg = getGoogleHealthConfig(req);
    const garminSession = getSessionForProvider(req, 'garmin');
    const googleSession = getSessionForProvider(req, 'google');
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
      google: {
        configured: googleCfg.configured,
        connected: Boolean(googleSession),
        apiMode: googleSession?.session.apiMode || null,
        callbackUrl: googleCfg.callbackUrl,
        connectedAt: googleSession?.session.connectedAt || null,
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
    if (cfg.authMode === 'api_key') {
      if (isGarminApiKeyManuallyDisconnected(req)) {
        res.status(401).json({ error: 'Garmin Connect wurde getrennt. Bitte erneut verbinden.' });
        return;
      }
      try {
        const days = await fetchGarminPersonalApiMetrics(
          cfg.personalApiKey,
          cfg.personalApiBaseUrl
        );
        res.json({
          provider: 'garmin_connect',
          authMode: 'api_key',
          days,
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

  // Google Health / Fit: Build OAuth 2.0 Authorization URL
  app.get('/api/health/google/auth-url', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    pruneExpiredStates();
    const cfg = getGoogleHealthConfig(req);
    if (!cfg.configured) {
      res.status(200).json({
        configured: false,
        callbackUrl: cfg.callbackUrl,
        error:
          'Google Health OAuth ist noch nicht konfiguriert. Bitte hinterlege GOOGLE_HEALTH_CLIENT_ID und GOOGLE_HEALTH_CLIENT_SECRET in Settings > Secrets und lade die App neu.',
      });
      return;
    }

    const requestedApi: GoogleApiMode =
      req.query.api === 'google_fit' ? 'google_fit' : 'google_health';
    const scopes =
      requestedApi === 'google_fit'
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

    const state = base64UrlEncode(crypto.randomBytes(24));
    pendingStates.set(state, {
      provider: 'google',
      apiMode: requestedApi,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.callbackUrl,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    res.json({
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  });

  // Google Health / Fit: OAuth Callback
  const handleGoogleCallback = async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) {
      res
        .status(400)
        .send(
          renderPopupResultHtml(
            { type: 'HEALTH_OAUTH_ERROR', provider: 'google', message: `Google-Autorisierung abgelehnt (${error}).` },
            'Google Health-Verbindung wurde abgebrochen.'
          )
        );
      return;
    }

    if (!code || !state) {
      res
        .status(400)
        .send(
          renderPopupResultHtml(
            { type: 'HEALTH_OAUTH_ERROR', provider: 'google', message: 'Fehlender Code oder State von Google.' },
            'Ungültige Antwort von Google.'
          )
        );
      return;
    }

    const pending = pendingStates.get(state);
    pendingStates.delete(state);
    if (!pending || pending.provider !== 'google') {
      res
        .status(400)
        .send(
          renderPopupResultHtml(
            { type: 'HEALTH_OAUTH_ERROR', provider: 'google', message: 'OAuth-State abgelaufen oder ungültig.' },
            'Anfrage abgelaufen. Bitte erneut versuchen.'
          )
        );
      return;
    }

    try {
      const cfg = getGoogleHealthConfig(req);
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: cfg.callbackUrl,
      });

      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!tokenResp.ok) {
        const text = await tokenResp.text();
        throw new Error(`Google Token-Tausch fehlgeschlagen (${tokenResp.status}): ${text.slice(0, 160)}`);
      }

      const tokenData = (await tokenResp.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };
      if (!tokenData.access_token) {
        throw new Error('Kein Access-Token von Google erhalten.');
      }

      const grantedScopesRaw = tokenData.scope || '';
      const grantedScopes = grantedScopesRaw
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const hasHealthScope = grantedScopes.some((s) => s.includes('googlehealth.'));
      const hasFitScope = grantedScopes.some((s) => s.includes('fitness.'));
      const resolvedApiMode: GoogleApiMode =
        pending.apiMode === 'google_health' && hasHealthScope
          ? 'google_health'
          : pending.apiMode === 'google_fit' && hasFitScope
          ? 'google_fit'
          : hasFitScope
          ? 'google_fit'
          : pending.apiMode || 'google_health';

      const sessionToken = base64UrlEncode(crypto.randomBytes(32));
      const connectedAt = Date.now();
      sessions.set(sessionToken, {
        provider: 'google',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: connectedAt + (tokenData.expires_in || 3600) * 1000,
        apiMode: resolvedApiMode,
        grantedScopes,
        connectedAt,
      });

      setHealthSessionCookie(res, 'google', sessionToken);
      res.send(
        renderPopupResultHtml(
          {
            type: 'HEALTH_OAUTH_SUCCESS',
            provider: 'google',
            apiMode: resolvedApiMode,
            sessionToken,
            connectedAt,
          },
          'Google Health erfolgreich verbunden! Daten werden synchronisiert...'
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Health-Verbindung fehlgeschlagen.';
      console.error('Google Health OAuth callback error:', err);
      res
        .status(500)
        .send(
          renderPopupResultHtml(
            { type: 'HEALTH_OAUTH_ERROR', provider: 'google', message: msg },
            msg
          )
        );
    }
  };
  app.get(['/api/health/google/callback', '/api/health/google/callback/'], handleGoogleCallback);

  // Google Health / Fit: Direct Sync
  app.post('/api/health/google/sync', async (req: Request, res: Response) => {
    const found = getSessionForProvider(req, 'google');
    if (!found) {
      res.status(401).json({ error: 'Google Health ist nicht verbunden.' });
      return;
    }

    try {
      const accessToken = await ensureValidGoogleToken(found.session);
      const endMs = Date.now();
      const startMs = getLocalDayAlignedStartMs(endMs, 14);
      const apiMode = found.session.apiMode || 'google_health';

      const days =
        apiMode === 'google_fit'
          ? await fetchGoogleFitMetrics(
              accessToken,
              startMs,
              endMs,
              found.session.grantedScopes || []
            )
          : await fetchGoogleHealthV4Metrics(accessToken, startMs, endMs);

      res.json({
        provider: 'google_health',
        apiMode,
        days,
        syncedAt: Date.now(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Health-Sync fehlgeschlagen.';
      console.error('Google Health sync error:', err);
      res.status(502).json({ error: msg });
    }
  });

  // Google Health / Fit: Disconnect
  app.post('/api/health/google/disconnect', async (req: Request, res: Response) => {
    const found = getSessionForProvider(req, 'google');
    if (found) {
      const tokenToRevoke = found.session.accessToken;
      sessions.delete(found.sessionToken);
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
          { method: 'POST' }
        );
      } catch {
        // Ignore revocation errors on disconnect
      }
    }
    clearHealthSessionCookie(res, 'google');
    res.json({ disconnected: true });
  });
}
