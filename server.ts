import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_MODEL = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY ist nicht konfiguriert.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
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

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
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
      const message = error instanceof Error ? error.message : 'Fehler bei der AI-Coach-Zusammenfassung.';
      console.error('Error in /api/coach/weekly-summary:', error);
      res.status(500).json({ error: message });
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

        const followUp = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: followUpContents as any,
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

      const geminiHistory = (history || []).map((msg) => ({
        role: msg.role === 'coach' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
      geminiHistory.push({ role: 'user', parts: [{ text: userMessage }] });

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: geminiHistory as any,
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
      const message = error instanceof Error ? error.message : 'Fehler im Orakel-Coach.';
      console.error('Error in /api/coach/chat:', error);
      res.status(500).json({ error: message });
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

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: 'Erstelle ein neues Training.',
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
      const message = error instanceof Error ? error.message : 'Fehler bei der Generierung des Trainings.';
      console.error('Error in /api/coach/daily-training:', error);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
