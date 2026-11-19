import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { GenerateContentResponse } from '@google/genai';
import { registerHealthOAuthRoutes } from './server/healthOAuth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_MODEL = 'gemini-4-hydrogen';
const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY ist nicht konfiguriert. Bitte hinterlege deinen API-Key in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 20000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractGeminiError(error: unknown): { status: number; message: string; isTransient: boolean } {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  let parsedCode: number | undefined =
    typeof (error as { status?: unknown })?.status === 'number'
      ? ((error as { status: number }).status)
      : undefined;
  let parsedStatus: string | undefined;
  let parsedMessage = rawMessage;

  try {
    const jsonMatch = rawMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      const inner = obj.error || obj;
      if (typeof inner.code === 'number') parsedCode = inner.code;
      if (typeof inner.status === 'string') parsedStatus = inner.status;
      if (typeof inner.message === 'string') parsedMessage = inner.message;
    }
  } catch {
    // ignore JSON parse issues
  }

  const lower = `${rawMessage} ${parsedMessage} ${parsedStatus || ''}`.toLowerCase();

  if (lower.includes('gemini_api_key ist nicht konfiguriert')) {
    return {
      status: 500,
      message: 'Der Gemini API-Key ist nicht konfiguriert. Bitte prüfe deine Secrets unter Settings > Secrets.',
      isTransient: false,
    };
  }
  if (parsedCode === 403 || parsedStatus === 'PERMISSION_DENIED' || (parsedCode === 400 && lower.includes('api_key_invalid')) || lower.includes('api key not valid')) {
    return {
      status: parsedCode === 400 ? 400 : 403,
      message: 'Der Gemini API-Key ist ungültig oder hat keine Berechtigung. Bitte prüfe deinen API-Key unter Settings > Secrets.',
      isTransient: false,
    };
  }
  if (parsedCode === 429 || parsedStatus === 'RESOURCE_EXHAUSTED' || lower.includes('quota')) {
    return {
      status: 429,
      message: 'Das KI-Anfragelimit wurde vorübergehend erreicht (429). Bitte versuche es gleich erneut oder prüfe dein API-Kontingent in Settings > Secrets.',
      isTransient: true,
    };
  }
  if (parsedCode === 404 || parsedStatus === 'NOT_FOUND') {
    return {
      status: 404,
      message: 'Das angeforderte KI-Modell wurde nicht gefunden (404).',
      isTransient: false,
    };
  }
  if (
    parsedCode === 503 ||
    parsedStatus === 'UNAVAILABLE' ||
    lower.includes('high demand') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded')
  ) {
    return {
      status: 503,
      message: 'Der KI-Coach-Dienst ist momentan stark ausgelastet (503). Bitte versuche es in wenigen Sekunden erneut.',
      isTransient: true,
    };
  }
  if (
    parsedCode === 504 ||
    parsedCode === 502 ||
    parsedCode === 500 ||
    parsedStatus === 'DEADLINE_EXCEEDED' ||
    parsedStatus === 'INTERNAL' ||
    lower.includes('deadline') ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  ) {
    return {
      status: 504,
      message: 'Zeitüberschreitung oder vorübergehender Serverfehler bei der KI-Anfrage. Bitte versuche es gleich erneut.',
      isTransient: true,
    };
  }

  return {
    status: 500,
    message: parsedMessage || 'Unbekannter Fehler bei der KI-Anfrage.',
    isTransient: false,
  };
}

async function generateWithResilience(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    config?: Record<string, unknown>;
    thinkingLevel?: ThinkingLevel;
  }
): Promise<GenerateContentResponse> {
  const buildConfig = (model: string, signal: AbortSignal) => {
    const baseConfig = {
      ...(params.config || {}),
      abortSignal: signal,
    } as Record<string, unknown>;
    if (params.thinkingLevel && model === GEMINI_MODEL) {
      baseConfig.thinkingConfig = { thinkingLevel: params.thinkingLevel };
    }
    return baseConfig;
  };

  const primaryController = new AbortController();
  const fallbackController = new AbortController();

  const runModel = (model: string, controller: AbortController) =>
    ai.models.generateContent({
      model,
      contents: params.contents as any,
      config: buildConfig(model, controller.signal) as any,
    });

  return await new Promise<GenerateContentResponse>((resolve, reject) => {
    let settled = false;
    let primaryError: unknown = null;
    let fallbackError: unknown = null;
    let primaryDone = false;
    let fallbackDone = false;
    let fallbackStarted = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

    const primaryTimeout = setTimeout(
      () => primaryController.abort(new Error('Primary model timeout')),
      15000
    );

    const cleanup = () => {
      clearTimeout(primaryTimeout);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
    };

    const finishSuccess = (res: GenerateContentResponse, winner: 'primary' | 'fallback') => {
      if (settled) return;
      settled = true;
      cleanup();
      if (winner === 'primary') {
        fallbackController.abort();
      } else {
        primaryController.abort();
      }
      resolve(res);
    };

    const maybeRejectAll = () => {
      if (settled) return;
      if (primaryDone && fallbackDone) {
        settled = true;
        cleanup();
        reject(fallbackError ?? primaryError);
      }
    };

    const startFallback = () => {
      if (settled || fallbackStarted) return;
      fallbackStarted = true;
      fallbackTimeout = setTimeout(
        () => fallbackController.abort(new Error('Fallback model timeout')),
        12000
      );
      runModel(FALLBACK_GEMINI_MODEL, fallbackController)
        .then((res) => finishSuccess(res, 'fallback'))
        .catch((err) => {
          fallbackError = err;
          fallbackDone = true;
          maybeRejectAll();
        });
    };

    // Start fallback in parallel if primary has not responded within 5.5s
    fallbackTimer = setTimeout(startFallback, 5500);

    runModel(GEMINI_MODEL, primaryController)
      .then((res) => finishSuccess(res, 'primary'))
      .catch((err) => {
        primaryError = err;
        primaryDone = true;
        const info = extractGeminiError(err);
        if (!info.isTransient) {
          if (!settled) {
            settled = true;
            cleanup();
            fallbackController.abort();
            reject(err);
          }
          return;
        }
        startFallback();
        maybeRejectAll();
      });
  });
}

const createQuestDeclaration = {
  name: 'createQuest',
  description:
    'Erstellt eine neue Quest für den Benutzer. Verwende dies, wenn der Benutzer dich bittet, eine Quest zu erstellen, oder wenn du eine vorschlägst und er zustimmt.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'Der Titel der Quest (kurz und prägnant).',
      },
      description: {
        type: Type.STRING,
        description: 'Eine detaillierte Beschreibung der Quest.',
      },
      skill: {
        type: Type.STRING,
        description:
          'Der Skill, der trainiert wird. Muss einer dieser Werte sein: Fitness, Fokus, Disziplin, Wissen, Soziales.',
        enum: ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'],
      },
      xpReward: {
        type: Type.INTEGER,
        description:
          'Die EP-Belohnung (z.B. 10 für einfach, 20 für normal, 50 für schwer).',
      },
      type: {
        type: Type.STRING,
        description:
          "Der Typ der Quest. 'daily' für einmalige oder tägliche Aufgaben, 'habit' für Gewohnheiten.",
        enum: ['daily', 'habit'],
      },
    },
    required: ['title', 'description', 'skill', 'xpReward', 'type'],
  },
};

const createDeepTrainingDeclaration = {
  name: 'createDeepTraining',
  description: 'Erstellt ein neues Training für die Coach-Bibliothek.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      category: { type: Type.STRING },
      iconName: { type: Type.STRING },
      content: { type: Type.STRING },
    },
    required: ['title', 'category', 'iconName', 'content'],
  },
};

interface DailyBreakdownPayload {
  shortDay: string;
  dateLabel: string;
  mood: number | null;
  moodLabel?: string | null;
  xp: number;
  completedCount: number;
  focusMinutes: number;
  notes?: string;
  progress?: string;
}

interface WeeklySummaryRequestBody {
  weekLabel: string;
  avgMood: number | null;
  moodDelta: number | null;
  loggedDaysCount: number;
  totalXp: number;
  xpDelta: number;
  totalCompleted: number;
  totalFocusMinutes: number;
  topSkill: { skill: string; xp: number } | null;
  moodDistribution: Record<string, number>;
  dailyBreakdown: DailyBreakdownPayload[];
  userLevel?: number;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // Weekly Mood & Progress AI-Coach Summary
  app.post('/api/coach/weekly-summary', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const body = req.body as WeeklySummaryRequestBody;

      if (!body || !Array.isArray(body.dailyBreakdown)) {
        res.status(400).json({ error: 'Ungültige Wochendaten übermittelt.' });
        return;
      }

      const dayLines = body.dailyBreakdown
        .map((d) => {
          const moodPart =
            d.mood !== null
              ? `${d.mood}/5 Sterne (${d.moodLabel || ''})`
              : 'keine Stimmung geloggt';
          const notesPart =
            d.notes || d.progress
              ? ` | Notiz: "${[d.notes, d.progress].filter(Boolean).join(' / ').slice(0, 160)}"`
              : '';
          return `- ${d.shortDay} (${d.dateLabel}): Stimmung ${moodPart}, +${d.xp} EP, ${d.completedCount} Quests, ${d.focusMinutes} Min Fokus${notesPart}`;
        })
        .join('\n');

      const avgMoodText =
        body.avgMood !== null ? `${body.avgMood.toFixed(1)} / 5 Sterne` : 'noch keine Bewertung';
      const moodDeltaText =
        body.moodDelta !== null
          ? `${body.moodDelta >= 0 ? '+' : ''}${body.moodDelta} vs. Vorwoche`
          : 'kein Vorwochenvergleich';
      const xpDeltaText = `${body.xpDelta >= 0 ? '+' : ''}${body.xpDelta} EP vs. Vorwoche`;
      const topSkillText = body.topSkill
        ? `${body.topSkill.skill} (+${body.topSkill.xp} EP)`
        : 'noch kein Fokus-Skill';

      const systemInstruction = `Du bist der "AI-Coach" (Orakel-Coach) in der persönlichen Entwicklungs- und Tagebuch-App "Aura".
Deine Aufgabe: Schreibe auf Basis der erfassten Wochen-Stimmungswerte (1–5 Sterne) und Fortschrittsdaten eine authentische, motivierende und persönlich auf die Woche zugeschnittene Zusammenfassung auf DEUTSCH.

Stil & Regeln:
- Sprich den Nutzer direkt mit "Du" an.
- Tonfall: Warmherzig, klarsichtig, bestärkend, wie ein weiser Mentor – motivierend ohne leere Floskeln oder übertriebenes Pathos.
- Gehe konkret auf den Stimmungsverlauf ein (z.B. Durchschnitt, Höhen und Tiefen einzelner Wochentage, Veränderung zur Vorwoche) und verknüpfe ihn mit den erzielten Fortschritten (Quests, EP, Fokuszeit, Notizen).
- Wenn es schwächere Stimmungstage (1–2 Sterne) gab, würdige die Resilienz und mache Mut. Wenn die Stimmung hoch war (4–5 Sterne), feiere die Dynamik und zeige, was sie getragen hat. Wenn nur wenige Tage geloggt wurden, würdige den Anfang und ermutige sanft zur täglichen 1-Klick-Stimmungserfassung.
- Formatierung (kompakt, 130–180 Wörter):
  1. Eine kurze, motivierende Kernaussage als **fette Überschriftzeile**.
  2. 2 kurze, flüssige Absätze mit Beobachtungen zu Stimmung & Fortschritt.
  3. Abschließend ein Abschnitt **Impuls für deine nächste Woche:** mit genau 1–2 konkreten, leicht umsetzbaren Empfehlungen.`;

      const prompt = `Erstelle die motivierende AI-Coach-Zusammenfassung für die Woche ${body.weekLabel}:

Helden-Level: ${body.userLevel ?? 1}
Erfasste Stimmungstage: ${body.loggedDaysCount} von 7
Durchschnittliche Stimmung: ${avgMoodText} (${moodDeltaText})
Stimmungsverteilung: 5★=${body.moodDistribution?.['5'] ?? 0}x, 4★=${body.moodDistribution?.['4'] ?? 0}x, 3★=${body.moodDistribution?.['3'] ?? 0}x, 2★=${body.moodDistribution?.['2'] ?? 0}x, 1★=${body.moodDistribution?.['1'] ?? 0}x
Wochen-EP: +${body.totalXp} EP (${xpDeltaText})
Abgeschlossene Quests: ${body.totalCompleted}
Fokuszeit: ${body.totalFocusMinutes} Minuten
Stärkster Skill: ${topSkillText}

Tagesverlauf:
${dayLines}`;

      const response = await generateWithResilience(ai, {
        contents: prompt,
        thinkingLevel: ThinkingLevel.LOW,
        config: {
          systemInstruction,
        },
      });

      const summary = response.text?.trim();
      if (!summary) {
        res.status(502).json({ error: 'Keine Antwort vom AI-Coach erhalten.' });
        return;
      }

      res.json({ summary });
    } catch (error: unknown) {
      const info = extractGeminiError(error);
      console.error('Error in /api/coach/weekly-summary:', error);
      res.status(info.status).json({ error: info.message });
    }
  });

  // Sunday AI-Powered Weekly Retrospective (Mood Fluctuations + Goal Attainment + Next Week Outlook)
  app.post('/api/coach/weekly-retrospective', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const body = req.body as {
        weekLabel: string;
        loggedMoodDays: number;
        avgMood: number | null;
        minMood: number | null;
        maxMood: number | null;
        moodSwingRange: number | null;
        moodVolatility: number | null;
        stabilityLabel: string;
        biggestJump?: { fromDay: string; toDay: string; delta: number } | null;
        peakDay?: { shortDay: string; mood: number } | null;
        lowDay?: { shortDay: string; mood: number } | null;
        completedQuestsCount: number;
        failedQuestsCount: number;
        pendingWeekQuestsCount: number;
        questCompletionRate: number;
        habitPositiveCount: number;
        habitNegativeCount: number;
        totalXp: number;
        totalFocusMinutes: number;
        topSkill?: { skill: string; xp: number } | null;
        completedQuestTitles?: string[];
        failedQuestTitles?: string[];
        visionProgress?: Array<{
          title: string;
          completed: boolean;
          linkedQuests: number;
          completedLinkedQuests: number;
          progressPercent: number;
        }>;
        dailyBreakdown: Array<{
          shortDay: string;
          dateLabel: string;
          mood: number | null;
          moodLabel?: string | null;
          completedQuests: number;
          failedQuests: number;
          habitPositive: number;
          habitNegative: number;
          xp: number;
          focusMinutes: number;
          notes?: string;
          progress?: string;
        }>;
        userLevel?: number;
        streak?: number;
      };

      if (!body || !Array.isArray(body.dailyBreakdown) || !body.weekLabel) {
        res.status(400).json({ error: 'Ungültige Retrospektive-Daten übermittelt.' });
        return;
      }

      const dayLines = body.dailyBreakdown
        .map((d) => {
          const moodText =
            d.mood !== null
              ? `${d.mood}/5 ★ (${d.moodLabel || ''})`
              : 'keine Stimmung';
          const questText = `${d.completedQuests} erledigt, ${d.failedQuests} verpasst`;
          const habitText = `Habits +${d.habitPositive}/-${d.habitNegative}`;
          const notesPart =
            d.notes || d.progress
              ? ` | Reflexion: "${[d.notes, d.progress].filter(Boolean).join(' / ').slice(0, 180)}"`
              : '';
          return `- ${d.shortDay} (${d.dateLabel}): Stimmung ${moodText} | Quests: ${questText} | ${habitText} | +${d.xp} EP | ${d.focusMinutes} Min Fokus${notesPart}`;
        })
        .join('\n');

      const visionLines =
        Array.isArray(body.visionProgress) && body.visionProgress.length > 0
          ? body.visionProgress
              .map(
                (v) =>
                  `- "${v.title}": ${v.progressPercent}% (${v.completedLinkedQuests}/${v.linkedQuests} verknüpfte Quests${v.completed ? ', abgeschlossen' : ''})`
              )
              .join('\n')
          : 'Keine aktiven Lebensziele verknüpft.';

      const systemInstruction = `Du bist der "Sonntags-Mentor" (AI-Coach) in der persönlichen Entwicklungs-App "Aura".
Jeden Sonntag erstellst du eine tiefgehende, konstruktive und motivierende "Wochen-Retrospektive" auf DEUTSCH für den Nutzer ("Du").

Deine 4 Aufgaben:
1. "headline": Eine prägnante, motivierende Überschrift (max. 70 Zeichen), die die Essenz der Woche einfängt.
2. "moodFluctuationAnalysis": Analysiere konkret die STIMMUNGSSCHWANKUNGEN der Woche (Durchschnitt, Spannweite Min–Max, Stabilität/Volatilität, stärkster Umschwung zwischen Tagen, Zusammenhang mit Fokuszeit, Habits oder Tagebuch-Notizen). Ordne Hochs und Tiefs einfühlsam und ohne Vorwürfe ein. (2–4 klare Sätze)
3. "goalAchievementAnalysis": Analysiere die ZIELERREICHUNG der Woche (abgeschlossene vs. nicht durchgeführte Quests, Erfolgsquote %, Habit-Balance +/-, Fortschritt bei Lebenszielen, verdiente EP und Fokusminuten). Würdige Konsequenz und gib bei verpassten Quests eine pragmatische Einordnung statt Kritik. (2–4 klare Sätze)
4. "nextWeekOutlook": Formuliere einen maßgeschneiderten, motivierenden AUSBLICK FÜR DIE NÄCHSTE WOCHE, der direkt aus den Mustern dieser Woche lernt (z.B. wie man Stimmungstiefs abfedert, Energie-Hochs nutzt oder Überforderung bei Quests vermeidet). (3–4 inspirierende, konkrete Sätze)
5. "focusRecommendations": Schlage 2–3 konkrete, realistische Quests/Fokus-Aktionen für die nächste Woche vor (Titel, kurze Begründung, passender Skill aus [Fitness, Fokus, Disziplin, Wissen, Soziales], XP zwischen 15 und 50).

Wichtig: Erfinde keine nicht geloggten Tage als geloggt. Wenn wenig Daten vorliegen, erkenne das ehrlich an und motiviere sanft zur kommenden Woche.`;

      const prompt = `Erstelle die Sonntags-Wochen-Retrospektive für die Woche ${body.weekLabel}:

Helden-Status: Level ${body.userLevel ?? 1}, aktuelle Serie: ${body.streak ?? 0} Tage
Stimmung & Schwankungen:
- Geloggte Stimmungstage: ${body.loggedMoodDays} von 7
- Durchschnitt: ${body.avgMood !== null ? `${body.avgMood.toFixed(2)} / 5 ★` : 'keine Daten'}
- Min / Max: ${body.minMood !== null && body.maxMood !== null ? `${body.minMood}★ bis ${body.maxMood}★` : 'keine Daten'}
- Schwankungsbreite: ${body.moodSwingRange !== null ? `${body.moodSwingRange} Sterne` : '–'} (Volatilität σ=${body.moodVolatility ?? '–'}, Einstufung: ${body.stabilityLabel})
- Bester Stimmungstag: ${body.peakDay ? `${body.peakDay.shortDay} (${body.peakDay.mood}/5 ★)` : '–'}
- Tiefster Stimmungstag: ${body.lowDay ? `${body.lowDay.shortDay} (${body.lowDay.mood}/5 ★)` : '–'}
- Größter Tages-Umschwung: ${body.biggestJump ? `${body.biggestJump.fromDay} → ${body.biggestJump.toDay} (${body.biggestJump.delta >= 0 ? '+' : ''}${body.biggestJump.delta} ★)` : '–'}

Zielerreichung:
- Abgeschlossene Quests: ${body.completedQuestsCount}
- Nicht durchgeführte/verpasste Quests: ${body.failedQuestsCount}
- Noch offene Wochen-Quests: ${body.pendingWeekQuestsCount}
- Quest-Erfolgsquote: ${body.questCompletionRate}%
- Gewohnheiten (Habits): +${body.habitPositiveCount} positiv / -${body.habitNegativeCount} negativ
- Wochen-EP: +${body.totalXp} EP | Fokuszeit: ${body.totalFocusMinutes} Min
- Top-Skill: ${body.topSkill ? `${body.topSkill.skill} (+${body.topSkill.xp} EP)` : 'noch keiner'}
- Erledigte Quest-Beispiele: ${(body.completedQuestTitles || []).join(', ') || 'keine'}
- Verpasste Quest-Beispiele: ${(body.failedQuestTitles || []).join(', ') || 'keine'}

Lebensziele (Visions):
${visionLines}

Tagesverlauf (Mo–So):
${dayLines}`;

      const response = await generateWithResilience(ai, {
        contents: prompt,
        thinkingLevel: ThinkingLevel.LOW,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              moodFluctuationAnalysis: { type: Type.STRING },
              goalAchievementAnalysis: { type: Type.STRING },
              nextWeekOutlook: { type: Type.STRING },
              focusRecommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    skill: {
                      type: Type.STRING,
                      enum: ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'],
                    },
                    xpReward: { type: Type.INTEGER },
                  },
                  required: ['title', 'description', 'skill', 'xpReward'],
                },
              },
            },
            required: [
              'headline',
              'moodFluctuationAnalysis',
              'goalAchievementAnalysis',
              'nextWeekOutlook',
              'focusRecommendations',
            ],
          },
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        res.status(502).json({ error: 'Keine Antwort für die Wochen-Retrospektive erhalten.' });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        headline?: string;
        moodFluctuationAnalysis?: string;
        goalAchievementAnalysis?: string;
        nextWeekOutlook?: string;
        focusRecommendations?: Array<{
          title?: string;
          description?: string;
          skill?: string;
          xpReward?: number;
        }>;
      };

      const validSkills = new Set(['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales']);
      const recs = Array.isArray(parsed.focusRecommendations)
        ? parsed.focusRecommendations.slice(0, 3).map((rec, idx) => ({
            id: `retro-rec-${idx + 1}`,
            title: String(rec.title || 'Fokus-Schritt nächste Woche').slice(0, 140),
            description: String(rec.description || '').slice(0, 400),
            skill: validSkills.has(String(rec.skill)) ? String(rec.skill) : 'Disziplin',
            xpReward: Math.max(10, Math.min(100, Math.round(Number(rec.xpReward) || 25))),
          }))
        : [];

      res.json({
        headline: String(parsed.headline || 'Deine Sonntags-Retrospektive').slice(0, 280),
        moodFluctuationAnalysis: String(parsed.moodFluctuationAnalysis || '').slice(0, 3800),
        goalAchievementAnalysis: String(parsed.goalAchievementAnalysis || '').slice(0, 3800),
        nextWeekOutlook: String(parsed.nextWeekOutlook || '').slice(0, 3800),
        focusRecommendations: recs,
      });
    } catch (error: unknown) {
      const info = extractGeminiError(error);
      console.error('Error in /api/coach/weekly-retrospective:', error);
      res.status(info.status).json({ error: info.message });
    }
  });

  // AI-Coach Chat Endpoint
  app.post('/api/coach/chat', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const { history, userMessage, context, functionCallResult } = req.body as {
        history?: Array<{ role: 'user' | 'coach'; content: string }>;
        userMessage?: string;
        context?: {
          level: number;
          xp: number;
          xpToNextLevel: number;
          skills: Record<string, unknown>;
          activeQuests: string[];
          recentMoodSummary?: string;
        };
        functionCallResult?: {
          priorHistory: unknown[];
          call: unknown;
          result: Record<string, unknown>;
        };
      };

      const systemInstruction = `You are an AI Coach in a Self-Improvement RPG app called "LifeQuest" (Aura).
The user is a "Hero" leveling up their life.
Current Stats:
Level: ${context?.level ?? 1}
XP: ${context?.xp ?? 0}/${context?.xpToNextLevel ?? 100}
Skills: ${JSON.stringify(context?.skills ?? {})}
Active Quests: ${JSON.stringify(context?.activeQuests ?? [])}
${context?.recentMoodSummary ? `Recent Mood Context: ${context.recentMoodSummary}` : ''}

The user has access to "Lebensziele" (Visions), a Pomodoro "Fokus Timer", a daily 1-5 star mood tracker, and weekly mood summaries.
Provide concise, motivating, and actionable advice. Speak like a wise mentor or RPG guide. Suggest specific quests if appropriate.
IMPORTANT: Respond in GERMAN. Use "Du" to address the user.
You have the ability to create quests for the user using the createQuest tool. Use it when the user explicitly asks you to create a quest, or when they agree to a quest you suggested.`;

      if (functionCallResult) {
        const followUpContents = [
          ...(Array.isArray(functionCallResult.priorHistory) ? functionCallResult.priorHistory : []),
          { role: 'model', parts: [{ functionCall: functionCallResult.call }] },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'createQuest',
                  response: functionCallResult.result,
                },
              },
            ],
          },
        ];

        const followUp = await generateWithResilience(ai, {
          contents: followUpContents,
          thinkingLevel: ThinkingLevel.LOW,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: [createQuestDeclaration] }],
          },
        });

        res.json({
          text: followUp.text || 'Die Quest wurde erfolgreich erstellt!',
        });
        return;
      }

      if (!userMessage || typeof userMessage !== 'string') {
        res.status(400).json({ error: 'Nachricht darf nicht leer sein.' });
        return;
      }

      // Normalize history so Gemini contents always start with a user turn and have non-empty text
      const rawHistory = (history || [])
        .filter((msg) => msg && typeof msg.content === 'string' && msg.content.trim().length > 0)
        .map((msg) => ({
          role: msg.role === 'coach' ? 'model' : 'user',
          parts: [{ text: msg.content.trim() }],
        }));

      const firstUserIdx = rawHistory.findIndex((m) => m.role === 'user');
      const geminiHistory = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : [];
      geminiHistory.push({ role: 'user', parts: [{ text: userMessage.trim() }] });

      const response = await generateWithResilience(ai, {
        contents: geminiHistory,
        thinkingLevel: ThinkingLevel.LOW,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [createQuestDeclaration] }],
        },
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        res.json({
          functionCall: call,
          priorHistory: geminiHistory,
        });
        return;
      }

      res.json({
        text: response.text || 'Ich denke über deinen Pfad nach...',
      });
    } catch (error: unknown) {
      const info = extractGeminiError(error);
      console.error('Error in /api/coach/chat:', error);
      res.status(info.status).json({ error: info.message });
    }
  });

  // Daily Deep Training Generator
  app.post('/api/coach/daily-training', async (req: Request, res: Response) => {
    try {
      const ai = getAiClient();
      const { existingTitles } = req.body as { existingTitles?: string[] };
      const titlesList = Array.isArray(existingTitles) ? existingTitles.join(', ') : '';

      const systemInstruction = `You are a High-Performance AI Coach in a Self-Improvement RPG app called "LifeQuest".
Your task is to generate one new "Deep Training" module for the Coach Library.
It should cover advanced psychological, anatomical, or cognitive concepts.
It MUST be different from the following existing titles: ${titlesList}.

Return your result using the "createDeepTraining" function.
The "category" must be one of: "Fitness", "Fokus", "Disziplin", "Wissen", "Soziales" or a combination (e.g., "Fokus & Disziplin").
The "iconName" must be one of: "Brain", "Dumbbell", "Shield", "Activity", "Moon", "Dna", "BookOpen".
The "content" should use markdown formatting with sections, bold text, and a final "Dein Coaching-Auftrag:" actionable task.
Write in GERMAN. Address the user as "Du".`;

      const response = await generateWithResilience(ai, {
        contents: 'Erstelle ein neues Training.',
        thinkingLevel: ThinkingLevel.LOW,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [createDeepTrainingDeclaration] }],
        },
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        const args = response.functionCalls[0].args as Record<string, string>;
        res.json({
          title: args.title || 'Erweiterte Fokus-Strategie',
          category: args.category || 'Fokus',
          iconName: args.iconName || 'Brain',
          content: args.content || 'Hier ist dein neues Training.',
        });
        return;
      }

      res.status(502).json({ error: 'Fehler bei der Generierung des Trainings.' });
    } catch (error: unknown) {
      const info = extractGeminiError(error);
      console.error('Error in /api/coach/daily-training:', error);
      res.status(info.status).json({ error: info.message });
    }
  });

  registerHealthOAuthRoutes(app);

  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API-Endpunkt nicht gefunden.' });
  });

  app.get('/favicon.ico', (_req: Request, res: Response) => {
    res.type('image/svg+xml');
    res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    let viteMiddlewares: ((req: Request, res: Response, next: NextFunction) => void) | null = null;
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        },
        appType: 'spa',
      });
      viteMiddlewares = vite.middlewares as unknown as (
        req: Request,
        res: Response,
        next: NextFunction
      ) => void;
      return vite;
    })();
    viteReady.catch((err) => {
      console.error('Vite middleware initialization failed:', err);
    });
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!viteMiddlewares) {
          await viteReady;
        }
        if (viteMiddlewares) {
          viteMiddlewares(req, res, next);
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const portArgIdx = process.argv.indexOf('--port');
  const cliPort = portArgIdx >= 0 ? Number(process.argv[portArgIdx + 1]) : NaN;
  const port =
    (Number.isFinite(cliPort) && cliPort > 0 ? cliPort : 0) ||
    (process.env.NGINX_PORT &&
    process.env.PORT === process.env.NGINX_PORT &&
    process.env.DEFAULT_APP_PORT
      ? Number(process.env.DEFAULT_APP_PORT)
      : Number(process.env.PORT) || 3000);
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
