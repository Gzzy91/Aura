import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { Sparkles, Send, Loader2, RotateCcw, AlertCircle, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sendCoachChatMessage } from '@/services/coachService';
import { SkillType } from '@/types';
import { format, isSameDay } from 'date-fns';

const CHAT_STORAGE_KEY = 'aura_coach_chat_v1';

interface ChatMessage {
  role: 'user' | 'coach';
  content: string;
  isError?: boolean;
  retryText?: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  role: 'coach',
  content:
    'Willkommen zurück! Ich bin dein persönlicher Aura-Coach. Ich kenne deine aktuellen Skills, Stimmungen, Quests und Erholungswerte. Woran möchtest du heute arbeiten?',
};

const QUICK_PROMPTS = [
  'Plane meinen optimalen Tagesfokus',
  'Wie verbessere ich meine Erholung & Energie?',
  'Besprich meine letzte Sonntags-Retrospektive',
  'Schlage mir eine passende Quest für heute vor',
];

function toSafeDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function AICoach() {
  const {
    stats,
    quests = [],
    diaryEntries = [],
    weeklyCoachSummaries = [],
    weeklyRetrospectives = [],
    healthRecords = [],
    foodEntries = [],
    addQuest,
  } = useStore();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (m): m is ChatMessage =>
              Boolean(m) &&
              typeof m === 'object' &&
              (m.role === 'user' || m.role === 'coach') &&
              typeof m.content === 'string'
          );
          if (valid.length > 0) return valid;
        }
      }
    } catch {
      // ignore invalid storage
    }
    return [WELCOME_MESSAGE];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      // ignore storage quota errors
    }
  }, [messages]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const recentMoodSummary = useMemo(() => {
    const today = new Date();
    const todayKey = format(today, 'yyyy-MM-dd');
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentMoods = diaryEntries.filter(
      (e) => typeof e.date === 'number' && e.date >= sevenDaysAgo && typeof e.mood === 'number' && e.mood >= 1
    );
    const latestSummary = [...weeklyCoachSummaries].sort((a, b) => (b.weekStart || 0) - (a.weekStart || 0))[0];
    const latestRetro = [...weeklyRetrospectives].sort((a, b) => (b.weekStart || 0) - (a.weekStart || 0))[0];
    const todayHealth = healthRecords.find((r) => r.id === todayKey);
    const todayCalories = foodEntries
      .filter((f) => {
        const fd = toSafeDate(f.date);
        return fd ? isSameDay(fd, today) : false;
      })
      .reduce((sum, f) => sum + (f.calories || 0), 0);

    const avg =
      recentMoods.length > 0
        ? (recentMoods.reduce((sum, e) => sum + e.mood, 0) / recentMoods.length).toFixed(1)
        : null;

    const parts = [
      avg ? `7-Tage Ø-Stimmung: ${avg}/5 Sterne (${recentMoods.length} Einträge)` : null,
      todayHealth
        ? `Heutige Erholung: ${todayHealth.recoveryScore}/100 (${todayHealth.recoveryState}), Schlaf ${Math.round(
            (todayHealth.sleepDurationMinutes || 0) / 60 * 10
          ) / 10}h, Aktivität ${todayHealth.activityDurationMinutes || 0}m`
        : null,
      todayCalories > 0 ? `Heutige Ernährung: ${todayCalories} kcal` : null,
      latestRetro
        ? `Letzte Sonntags-Retrospektive (${latestRetro.id}): ${latestRetro.headline || ''} | Quote ${latestRetro.questCompletionRate ?? 0}% | Ausblick: ${(latestRetro.nextWeekOutlook || '').slice(0, 220)}`
        : null,
      latestSummary ? `Letztes Wochenfazit: ${(latestSummary.summary || '').slice(0, 200)}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' | ') : undefined;
  }, [diaryEntries, weeklyCoachSummaries, weeklyRetrospectives, healthRecords, foodEntries]);

  const sendMessage = async (textToSend: string, isRetry = false) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    if (!isRetry) {
      setInput('');
    }

    // Exclude welcome message, error bubbles, and (on retry) the duplicated failed user turn
    const cleanBaseMessages = messages.filter(
      (msg, idx) => !(idx === 0 && msg.role === 'coach') && !msg.isError
    );

    const historyForApi = (
      isRetry &&
      cleanBaseMessages.length > 0 &&
      cleanBaseMessages[cleanBaseMessages.length - 1]?.role === 'user' &&
      cleanBaseMessages[cleanBaseMessages.length - 1]?.content === trimmed
        ? cleanBaseMessages.slice(0, -1)
        : cleanBaseMessages
    ).map(({ role, content }) => ({ role, content }));

    if (isRetry) {
      setMessages((prev) => prev.filter((m) => !m.isError));
    } else {
      setMessages((prev) => [...prev.filter((m) => !m.isError), { role: 'user', content: trimmed }]);
    }

    setIsLoading(true);

    const context = {
      level: stats?.level ?? 1,
      xp: stats?.xp ?? 0,
      xpToNextLevel: stats?.xpToNextLevel ?? 100,
      skills: stats?.skills ?? {},
      activeQuests: quests.filter((q) => !q.completed).map((q) => q.title).slice(0, 40),
      recentMoodSummary,
    };

    try {
      const response = await sendCoachChatMessage({
        history: historyForApi,
        userMessage: trimmed,
        context,
      });

      if (response.functionCall && response.functionCall.name === 'createQuest') {
        const args = (response.functionCall.args || {}) as {
          title?: string;
          description?: string;
          skill?: SkillType;
          xpReward?: number;
          type?: 'daily' | 'habit';
        };
        const questType = args.type === 'habit' ? 'habit' : 'daily';
        const questTitle = args.title || 'Neue Coach-Quest';
        addQuest({
          title: questTitle,
          description: args.description || '',
          skill: args.skill || 'Disziplin',
          xpReward: typeof args.xpReward === 'number' ? args.xpReward : 20,
          type: questType,
          ...(questType === 'habit' ? { habitDirection: 'positive' as const } : {}),
        });

        try {
          const followUp = await sendCoachChatMessage({
            context,
            functionCallResult: {
              priorHistory: response.priorHistory || [],
              modelContent: response.modelContent,
              call: response.functionCall,
              result: { success: true },
            },
          });

          setMessages((prev) => [
            ...prev,
            { role: 'coach', content: followUp.text || `Die Quest **${questTitle}** wurde erfolgreich erstellt!` },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              role: 'coach',
              content: `Ich habe die Quest **${questTitle}** direkt zu deinen Quests hinzugefügt!`,
            },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'coach', content: response.text || 'Ich analysiere deinen aktuellen Stand...' },
        ]);
      }
    } catch (error) {
      console.error('AI Coach chat error:', error);
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : 'Die Verbindung zum KI-Coach konnte nicht hergestellt werden.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'coach',
          content: errorMessage,
          isError: true,
          retryText: trimmed,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleResetChat = () => {
    setMessages([WELCOME_MESSAGE]);
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-10.5rem)] md:h-[calc(100dvh-4.5rem)] min-h-[420px] max-w-5xl mx-auto">
      <header className="mb-3 sm:mb-5 flex flex-wrap items-end justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5 sm:gap-3">
            <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
            KI-Coach
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Individuelle Empfehlungen auf Basis deiner Stimmung, Gesundheit &amp; Quests
          </p>
        </div>
        {messages.length > 1 && (
          <button
            type="button"
            onClick={handleResetChat}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-xs font-bold text-neutral-300 hover:text-white transition-colors min-h-[40px] shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Neuer Chat
          </button>
        )}
      </header>

      <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-amber-500 text-neutral-950 font-medium rounded-tr-sm'
                    : msg.isError
                      ? 'bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-tl-sm'
                      : 'bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-tl-sm'
                }`}
              >
                {msg.isError ? (
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <p className="text-xs sm:text-sm text-rose-200 leading-relaxed">{msg.content}</p>
                    </div>
                    {msg.retryText && (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => sendMessage(msg.retryText!, true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 border border-rose-500/30 text-xs font-bold transition-colors min-h-[36px] disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Erneut versuchen
                      </button>
                    )}
                  </div>
                ) : msg.role === 'coach' ? (
                  <div className="markdown-body prose prose-invert prose-sm max-w-none [&_p]:my-1.5 [&_strong]:text-amber-400">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {messages.length === 1 && !isLoading && (
            <div className="pt-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                Schnellstart-Impulse
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="px-3.5 py-2 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-amber-500/50 text-xs font-semibold text-neutral-300 hover:text-amber-400 transition-colors text-left min-h-[38px]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-2xl rounded-tl-sm p-4 flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span className="text-sm text-neutral-400">Analysiere deine Daten...</span>
              </div>
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 bg-neutral-950 border-t border-neutral-800 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Frage nach Rat oder einer neuen Quest..."
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 min-h-[44px]"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-amber-500 text-neutral-950 px-4 py-3 rounded-xl font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[48px] min-h-[44px] flex items-center justify-center"
            aria-label="Nachricht senden"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
