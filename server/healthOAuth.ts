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

function getAppBaseUrl(): string {
  const envUrl = process.env.APP_URL;
  if (envUrl && envUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(envUrl)) {
    return envUrl.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

function getGarminConfig() {
  const clientId = process.env.GARMIN_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GARMIN_CLIENT_SECRET?.trim() || '';
  const callbackUrl = `${getAppBaseUrl()}/api/health/garmin/callback`;
  return {
    clientId,
    clientSecret,
    callbackUrl,
    configured: Boolean(clientId && clientSecret),
  };
}

function getGoogleHealthConfig() {
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
  const callbackUrl = `${getAppBaseUrl()}/api/health/google/callback`;
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

function mergeDayMetric(
  map: Map<
    string,
    { sleepMinutes: number; activityMinutes: number; hrValues: number[] }
  >,
  dateKey: string,
  partial: { sleepMinutes?: number; activityMinutes?: number; avgHeartRate?: number | null }
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
  const entry = map.get(dateKey) || { sleepMinutes: 0, activityMinutes: 0, hrValues: [] };
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
  map.set(dateKey, entry);
}

function finalizeDayMap(
  map: Map<string, { sleepMinutes: number; activityMinutes: number; hrValues: number[] }>
): RemoteHealthDayMetric[] {
  return Array.from(map.entries())
    .map(([dateKey, v]) => ({
      dateKey,
      sleepDurationMinutes: Math.max(0, Math.min(1440, Math.round(v.sleepMinutes))),
      activityDurationMinutes: Math.max(0, Math.min(1440, Math.round(v.activityMinutes))),
      avgHeartRate:
        v.hrValues.length > 0
          ? Math.round(v.hrValues.reduce((s, n) => s + n, 0) / v.hrValues.length)
          : null,
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
  ];

  const dailies: GarminDailyItem[] = [];
  const sleeps: GarminSleepItem[] = [];
  let hadHttpError = false;
  let lastErrorStatus = 0;

  await Promise.all(
    windows.flatMap(({ start, end }) => [
      fetch(
        `https://apis.garmin.com/wellness-api/rest/dailies?uploadStartTimeInSeconds=${start}&uploadEndTimeInSeconds=${end}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then(async (r) => {
        if (r.ok) {
          const arr = (await r.json()) as GarminDailyItem[];
          if (Array.isArray(arr)) dailies.push(...arr);
        } else if (r.status === 401 || r.status === 403) {
          hadHttpError = true;
          lastErrorStatus = r.status;
        }
      }),
      fetch(
        `https://apis.garmin.com/wellness-api/rest/sleeps?uploadStartTimeInSeconds=${start}&uploadEndTimeInSeconds=${end}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then(async (r) => {
        if (r.ok) {
          const arr = (await r.json()) as GarminSleepItem[];
          if (Array.isArray(arr)) sleeps.push(...arr);
        } else if (r.status === 401 || r.status === 403) {
          hadHttpError = true;
          lastErrorStatus = r.status;
        }
      }),
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

  const dayMap = new Map<
    string,
    { sleepMinutes: number; activityMinutes: number; hrValues: number[] }
  >();

  for (const d of dailies) {
    const dateKey =
      d.calendarDate ||
      (typeof d.startTimeInSeconds === 'number' ? toDateKey(d.startTimeInSeconds * 1000) : '');
    if (!dateKey) continue;

    const intensitySec =
      (d.moderateIntensityDurationInSeconds || 0) + (d.vigorousIntensityDurationInSeconds || 0);
    const activeSec = intensitySec > 0 ? intensitySec : d.activeTimeInSeconds || 0;
    const hr =
      typeof d.averageHeartRateInBeatsPerMinute === 'number'
        ? d.averageHeartRateInBeatsPerMinute
        : typeof d.restingHeartRateInBeatsPerMinute === 'number'
        ? d.restingHeartRateInBeatsPerMinute
        : null;

    mergeDayMetric(dayMap, dateKey, {
      activityMinutes: Math.round(activeSec / 60),
      avgHeartRate: hr,
    });
  }

  const sleepBySummaryId = new Map<string, { dateKey: string; mins: number }>();
  for (const s of sleeps) {
    const dateKey =
      s.calendarDate ||
      (typeof s.startTimeInSeconds === 'number' ? toDateKey(s.startTimeInSeconds * 1000) : '');
    if (!dateKey) continue;
    const totalSec =
      typeof s.durationInSeconds === 'number' && s.durationInSeconds > 0
        ? s.durationInSeconds
        : (s.deepSleepDurationInSeconds || 0) +
          (s.lightSleepDurationInSeconds || 0) +
          (s.remSleepInSeconds || 0);
    const mins = Math.round(totalSec / 60);
    const key = s.summaryId || `${dateKey}-${s.startTimeInSeconds || mins}`;
    sleepBySummaryId.set(key, { dateKey, mins });
  }

  const sleepTotalPerDay = new Map<string, number>();
  for (const item of sleepBySummaryId.values()) {
    sleepTotalPerDay.set(item.dateKey, (sleepTotalPerDay.get(item.dateKey) || 0) + item.mins);
  }
  for (const [dateKey, mins] of sleepTotalPerDay.entries()) {
    mergeDayMetric(dayMap, dateKey, { sleepMinutes: mins });
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

async function fetchGoogleHealthV4Metrics(
  accessToken: string,
  startMs: number,
  endMs: number
): Promise<RemoteHealthDayMetric[]> {
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

  const dayMap = new Map<
    string,
    { sleepMinutes: number; activityMinutes: number; hrValues: number[] }
  >();
  const authErrors: string[] = [];
  let succeededCount = 0;

  // 1. Sleep data points (prefer reconcile, fallback to raw dataPoints)
  let sleepJson: { dataPoints?: Array<Record<string, any>> } | null = null;
  const sleepReconcileUrl = `https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints:reconcile?filter=${encodeURIComponent(
    `sleep.interval.end_time>="${startIso}" AND sleep.interval.end_time<="${endIso}"`
  )}`;
  const sleepRes = await fetch(sleepReconcileUrl, { headers });
  if (sleepRes.ok) {
    succeededCount += 1;
    sleepJson = (await sleepRes.json()) as { dataPoints?: Array<Record<string, any>> };
  } else {
    const rawSleepRes = await fetch(
      `https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints`,
      { headers }
    );
    if (rawSleepRes.ok) {
      succeededCount += 1;
      sleepJson = (await rawSleepRes.json()) as { dataPoints?: Array<Record<string, any>> };
    } else if (rawSleepRes.status === 401 || rawSleepRes.status === 403) {
      authErrors.push(await parseGoogleApiError(rawSleepRes, 'Google Health API v4'));
    }
  }

  const sleepByDay = new Map<string, number>();
  for (const dp of sleepJson?.dataPoints || []) {
    const sleep = dp.sleep || dp;
    const endTime = sleep?.interval?.endTime || sleep?.interval?.end_time;
    const startTime = sleep?.interval?.startTime || sleep?.interval?.start_time;
    const endParsed = endTime ? Date.parse(endTime) : NaN;
    if (Number.isNaN(endParsed) || endParsed < startMs || endParsed > endMs) continue;
    const dateKey = toDateKey(endParsed);

    let mins = Number(sleep?.summary?.minutesAsleep ?? sleep?.summary?.minutes_asleep ?? 0);
    if (!mins && Array.isArray(sleep?.stages)) {
      let asleepMs = 0;
      for (const stage of sleep.stages) {
        const type = String(stage.type || stage.stageType || '').toLowerCase();
        if (type && !type.includes('awake') && !type.includes('out_of_bed')) {
          const s = Date.parse(stage.interval?.startTime || stage.startTime || '');
          const e = Date.parse(stage.interval?.endTime || stage.endTime || '');
          if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) asleepMs += e - s;
        }
      }
      mins = Math.round(asleepMs / 60_000);
    }
    if (!mins && startTime) {
      const startParsed = Date.parse(startTime);
      if (!Number.isNaN(startParsed) && endParsed > startParsed) {
        mins = Math.round((endParsed - startParsed) / 60_000);
      }
    }
    if (mins > 0) {
      sleepByDay.set(dateKey, (sleepByDay.get(dateKey) || 0) + mins);
    }
  }
  for (const [dateKey, mins] of sleepByDay.entries()) {
    mergeDayMetric(dayMap, dateKey, { sleepMinutes: mins });
  }

  // 2. Active Minutes & Exercise
  const activeRes = await fetch(
    `https://health.googleapis.com/v4/users/me/dataTypes/active-minutes/dataPoints`,
    { headers }
  );
  if (activeRes.ok) {
    succeededCount += 1;
    const activeJson = (await activeRes.json()) as { dataPoints?: Array<Record<string, any>> };
    const activeByDay = new Map<string, number>();
    for (const dp of activeJson.dataPoints || []) {
      const am = dp.activeMinutes || dp.active_minutes || dp;
      const endTime = am?.interval?.endTime || am?.interval?.end_time || dp.endTime;
      const endParsed = endTime ? Date.parse(endTime) : NaN;
      if (Number.isNaN(endParsed) || endParsed < startMs || endParsed > endMs) continue;
      const dateKey = toDateKey(endParsed);
      const mins = Number(am?.minutes ?? am?.activeMinutes ?? am?.value ?? 0);
      if (mins > 0) {
        activeByDay.set(dateKey, (activeByDay.get(dateKey) || 0) + mins);
      }
    }
    for (const [dateKey, mins] of activeByDay.entries()) {
      mergeDayMetric(dayMap, dateKey, { activityMinutes: mins });
    }
  } else if (activeRes.status === 401 || activeRes.status === 403) {
    authErrors.push(await parseGoogleApiError(activeRes, 'Google Health API v4'));
  }

  const exerciseRes = await fetch(
    `https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints`,
    { headers }
  );
  if (exerciseRes.ok) {
    succeededCount += 1;
    const exJson = (await exerciseRes.json()) as { dataPoints?: Array<Record<string, any>> };
    const exByDay = new Map<string, number>();
    for (const dp of exJson.dataPoints || []) {
      const ex = dp.exercise || dp;
      const startTime = ex?.interval?.startTime || ex?.interval?.start_time;
      const endTime = ex?.interval?.endTime || ex?.interval?.end_time;
      const s = startTime ? Date.parse(startTime) : NaN;
      const e = endTime ? Date.parse(endTime) : NaN;
      if (Number.isNaN(s) || Number.isNaN(e) || e < startMs || e > endMs || e <= s) continue;
      const dateKey = toDateKey(e);
      exByDay.set(dateKey, (exByDay.get(dateKey) || 0) + Math.round((e - s) / 60_000));
    }
    for (const [dateKey, mins] of exByDay.entries()) {
      mergeDayMetric(dayMap, dateKey, { activityMinutes: mins });
    }
  } else if (exerciseRes.status === 401 || exerciseRes.status === 403) {
    authErrors.push(await parseGoogleApiError(exerciseRes, 'Google Health API v4'));
  }

  // 3. Heart Rate
  const hrRes = await fetch(
    `https://health.googleapis.com/v4/users/me/dataTypes/heart-rate/dataPoints`,
    { headers }
  );
  if (hrRes.ok) {
    succeededCount += 1;
    const hrJson = (await hrRes.json()) as { dataPoints?: Array<Record<string, any>> };
    for (const dp of hrJson.dataPoints || []) {
      const hr = dp.heartRate || dp.heart_rate || dp;
      const ts = hr?.sampleTime || hr?.interval?.endTime || hr?.time;
      const parsed = ts ? Date.parse(ts) : NaN;
      const bpm = Number(hr?.beatsPerMinute ?? hr?.bpm ?? 0);
      if (!Number.isNaN(parsed) && parsed >= startMs && parsed <= endMs && bpm > 0) {
        mergeDayMetric(dayMap, toDateKey(parsed), { avgHeartRate: bpm });
      }
    }
  } else if (hrRes.status === 401 || hrRes.status === 403) {
    authErrors.push(await parseGoogleApiError(hrRes, 'Google Health API v4'));
  }

  if (succeededCount === 0 && authErrors.length > 0) {
    throw new Error(authErrors[0]);
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

  if (!canReadSleep && !canReadActivity && !canReadHeartRate) {
    throw new Error(
      'Im Google-Login wurden keine Fitness-Berechtigungen (Schlaf, Aktivität oder Herzfrequenz) freigegeben. Bitte trenne Google Health und erteile beim erneuten Verbinden die Berechtigungen.'
    );
  }

  const dayMap = new Map<
    string,
    { sleepMinutes: number; activityMinutes: number; hrValues: number[] }
  >();
  const authErrors: string[] = [];
  let succeededCount = 0;

  // 1. Sleep segments + Sleep sessions fallback
  const sleepByDay = new Map<string, number>();
  if (canReadSleep) {
    const sleepResp = await fetch(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          aggregateBy: [{ dataTypeName: 'com.google.sleep.segment' }],
          startTimeMillis: startMs,
          endTimeMillis: endMs,
        }),
      }
    );

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
            // 1 = Awake, 3 = Out of bed
            if (stage === 1 || stage === 3) continue;
            const sMs = Number(p.startTimeNanos || 0) / 1_000_000;
            const eMs = Number(p.endTimeNanos || 0) / 1_000_000;
            if (eMs > sMs) {
              const dk = toDateKey(eMs);
              sleepByDay.set(dk, (sleepByDay.get(dk) || 0) + (eMs - sMs) / 60_000);
            }
          }
        }
      }
    } else if (sleepResp.status === 401 || sleepResp.status === 403) {
      authErrors.push(await parseGoogleApiError(sleepResp, 'Google Fit API'));
    }

    // Fallback to Fit sleep sessions (activityType 72) if sleep segments were empty
    if (sleepByDay.size === 0) {
      const sessResp = await fetch(
        `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${encodeURIComponent(
          new Date(startMs).toISOString()
        )}&endTime=${encodeURIComponent(new Date(endMs).toISOString())}&activityType=72`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (sessResp.ok) {
        succeededCount += 1;
        const sessJson = (await sessResp.json()) as {
          session?: Array<{ startTimeMillis?: string; endTimeMillis?: string }>;
        };
        for (const s of sessJson.session || []) {
          const sMs = Number(s.startTimeMillis || 0);
          const eMs = Number(s.endTimeMillis || 0);
          if (eMs > sMs) {
            const dk = toDateKey(eMs);
            sleepByDay.set(dk, (sleepByDay.get(dk) || 0) + (eMs - sMs) / 60_000);
          }
        }
      } else if (sessResp.status === 401 || sessResp.status === 403) {
        authErrors.push(await parseGoogleApiError(sessResp, 'Google Fit API'));
      }
    }
  }

  for (const [dateKey, mins] of sleepByDay.entries()) {
    mergeDayMetric(dayMap, dateKey, { sleepMinutes: Math.round(mins) });
  }

  // 2. Daily Active Minutes (queried independently so a missing HR datasource cannot fail it)
  if (canReadActivity) {
    const actResp = await fetch(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          aggregateBy: [{ dataTypeName: 'com.google.active_minutes' }],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: startMs,
          endTimeMillis: endMs,
        }),
      }
    );

    if (actResp.ok) {
      succeededCount += 1;
      const actJson = (await actResp.json()) as {
        bucket?: Array<{
          startTimeMillis?: string;
          endTimeMillis?: string;
          dataset?: Array<{
            point?: Array<{ value?: Array<{ intVal?: number; fpVal?: number }> }>;
          }>;
        }>;
      };

      for (const b of actJson.bucket || []) {
        const midMs =
          (Number(b.startTimeMillis || 0) + Number(b.endTimeMillis || 0)) / 2 || Date.now();
        const dateKey = toDateKey(midMs);
        for (const ds of b.dataset || []) {
          for (const p of ds.point || []) {
            const mins = p.value?.[0]?.intVal ?? Math.round(p.value?.[0]?.fpVal || 0);
            if (mins > 0) mergeDayMetric(dayMap, dateKey, { activityMinutes: mins });
          }
        }
      }
    } else if (actResp.status === 401 || actResp.status === 403) {
      authErrors.push(await parseGoogleApiError(actResp, 'Google Fit API'));
    }
  }

  // 3. Daily Heart Rate (queried independently)
  if (canReadHeartRate) {
    const hrResp = await fetch(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: startMs,
          endTimeMillis: endMs,
        }),
      }
    );

    if (hrResp.ok) {
      succeededCount += 1;
      const hrJson = (await hrResp.json()) as {
        bucket?: Array<{
          startTimeMillis?: string;
          endTimeMillis?: string;
          dataset?: Array<{
            point?: Array<{ value?: Array<{ fpVal?: number; intVal?: number }> }>;
          }>;
        }>;
      };

      for (const b of hrJson.bucket || []) {
        const midMs =
          (Number(b.startTimeMillis || 0) + Number(b.endTimeMillis || 0)) / 2 || Date.now();
        const dateKey = toDateKey(midMs);
        for (const ds of b.dataset || []) {
          for (const p of ds.point || []) {
            const bpm = p.value?.[0]?.fpVal ?? p.value?.[0]?.intVal ?? 0;
            if (bpm > 0) mergeDayMetric(dayMap, dateKey, { avgHeartRate: bpm });
          }
        }
      }
    } else if (hrResp.status === 401 || hrResp.status === 403) {
      authErrors.push(await parseGoogleApiError(hrResp, 'Google Fit API'));
    }
  }

  if (succeededCount === 0 && authErrors.length > 0) {
    throw new Error(authErrors[0]);
  }

  return finalizeDayMap(dayMap);
}

export function registerHealthOAuthRoutes(app: Express) {
  // Provider configuration & live session status
  app.get('/api/health/providers/status', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const garminCfg = getGarminConfig();
    const googleCfg = getGoogleHealthConfig();
    const garminSession = getSessionForProvider(req, 'garmin');
    const googleSession = getSessionForProvider(req, 'google');

    res.json({
      garmin: {
        configured: garminCfg.configured,
        connected: Boolean(garminSession),
        callbackUrl: garminCfg.callbackUrl,
        connectedAt: garminSession?.session.connectedAt || null,
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

  // Garmin Connect: Build OAuth 2.0 PKCE Authorization URL
  app.get('/api/health/garmin/auth-url', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    pruneExpiredStates();
    const cfg = getGarminConfig();
    if (!cfg.configured) {
      res.status(200).json({
        configured: false,
        callbackUrl: cfg.callbackUrl,
        error:
          'Garmin Connect OAuth ist noch nicht konfiguriert. Bitte hinterlege GARMIN_CLIENT_ID und GARMIN_CLIENT_SECRET in Settings > Secrets und starte den Server neu.',
      });
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
      const cfg = getGarminConfig();
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

  // Garmin Connect: Direct Sync
  app.post('/api/health/garmin/sync', async (req: Request, res: Response) => {
    const found = getSessionForProvider(req, 'garmin');
    if (!found) {
      res.status(401).json({ error: 'Garmin Connect ist nicht verbunden.' });
      return;
    }

    try {
      const days = await fetchGarminHealthMetrics(found.session);
      res.json({
        provider: 'garmin_connect',
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
    res.json({ disconnected: true });
  });

  // Google Health / Fit: Build OAuth 2.0 Authorization URL
  app.get('/api/health/google/auth-url', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    pruneExpiredStates();
    const cfg = getGoogleHealthConfig();
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
      const cfg = getGoogleHealthConfig();
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
      const startMs = endMs - 7 * 24 * 60 * 60 * 1000;
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
