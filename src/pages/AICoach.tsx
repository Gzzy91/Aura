import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { Sparkles, Send, Loader2, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sendCoachChatMessage } from '@/services/coachService';
import { SkillType } from '@/types';
import { format, isSameDay } from 'date-fns';

const CHAT_STORAGE_KEY = 'aura_coach_chat_v1';

interface ChatMessage {
  role: 'user' | 'coach';
  content: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  role: 'coach',
  content:
    'Willkommen zurück! Ich bin dein persönlicher Aura-Coach. Ich kenne deine aktuellen Skills, Stimmungen, Quests und Erholungswerte. Woran möchtest du heute arbeiten?',
};

const QUICK_PROMPTS = [
  'Plane meinen optimalen Tagesfokus',
  'Wie verbessere ich meine Erholung & Energie?',
  'Werte meinen Wochenverlauf aus',
  'Schlage mir eine passende Quest für heute vor',
];

export function AICoach() {
  const {
    stats,
    quests,
    diaryEntries,
    weeklyCoachSummaries,
    healthRecords,
    foodEntries,
    addQuest,
  } = useStore();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
    const recentMoods = diaryEntries.filter((e) => e.date >= sevenDaysAgo && e.mood >= 1);
    const latestSummary = [...weeklyCoachSummaries].sort((a, b) => b.weekStart - a.weekStart)[0];
    const todayHealth = healthRecords.find((r) => r.id === todayKey);
    const todayCalories = foodEntries
      .filter((f) => isSameDay(new Date(f.date), today))
      .reduce((sum, f) => sum + (f.calories || 0), 0);

    const avg =
      recentMoods.length > 0
        ? (recentMoods.reduce((sum, e) => sum + e.mood, 0) / recentMoods.length).toFixed(1)
        : null;

    const parts = [
      avg ? `7-Tage Ø-Stimmung: ${avg}/5 Sterne (${recentMoods.length} Einträge)` : null,
      todayHealth
        ? `Heutige Erholung: ${todayHealth.recoveryScore}/100 (${todayHealth.recoveryState}), Schlaf ${Math.round(
            todayHealth.sleepDurationMinutes / 60 * 10
          ) / 10}h, Aktivität ${todayHealth.activityDurationMinutes}m`
        : null,
      todayCalories > 0 ? `Heutige Ernährung: ${todayCalories} kcal` : null,
      latestSummary ? `Letztes Wochenfazit: ${latestSummary.summary.slice(0, 260)}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' | ') : undefined;
  }, [diaryEntries, weeklyCoachSummaries, healthRecords, foodEntries]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    const currentHistory = [...messages];
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setIsLoading(true);

    const context = {
      level: stats.level,
      xp: stats.xp,
      xpToNextLevel: stats.xpToNextLevel,
      skills: stats.skills,
      activeQuests: quests.filter((q) => !q.completed).map((q) => q.title),
      recentMoodSummary,
    };

    try {
      const response = await sendCoachChatMessage({
        history: currentHistory,
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
        addQuest({
          title: args.title || 'Neue Coach-Quest',
          description: args.description || '',
          skill: args.skill || 'Disziplin',
          xpReward: typeof args.xpReward === 'number' ? args.xpReward : 20,
          type: questType,
          ...(questType === 'habit' ? { habitDirection: 'positive' as const } : {}),
        });

        const followUp = await sendCoachChatMessage({
          context,
          functionCallResult: {
            priorHistory: response.priorHistory || [],
            call: response.functionCall,
            result: { success: true },
          },
        });

        setMessages((prev) => [
          ...prev,
          { role: 'coach', content: followUp.text || 'Die Quest wurde erfolgreich erstellt!' },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'coach', content: response.text || 'Ich analysiere deinen aktuellen Stand...' },
        ]);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'coach',
          content:
            'Die Verbindung zum KI-Coach wurde kurz unterbrochen. Bitte versuche es gleich erneut.',
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
    <div className="flex flex-col h-[calc(100vh-9rem)] md:h-[calc(100vh-5rem)] max-w-5xl mx-auto">
      <header className="mb-5 flex items-end justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-amber-500" />
            KI-Coach
          </h2>
          <p className="text-neutral-400 mt-1">
            Individuelle Empfehlungen auf Basis deiner Stimmung, Gesundheit &amp; Quests
          </p>
        </div>
        {messages.length > 1 && (
          <button
            type="button"
            onClick={handleResetChat}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-xs font-bold text-neutral-300 hover:text-white transition-colors min-h-[40px]"
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
                    : 'bg-neutral-950 border border-neutral-800 text-neutral-100 rounded-tl-sm'
                }`}
              >
                {msg.role === 'coach' ? (
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
