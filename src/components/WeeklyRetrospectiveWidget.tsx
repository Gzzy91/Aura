import { useState, useMemo, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Calendar,
  CalendarCheck2,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Flame,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { addDays, addWeeks, format, isSameWeek, subWeeks } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { useStore } from '@/store/useStore';
import { cn, SKILL_COLORS } from '@/lib/utils';
import { computeWeeklyRetrospectiveMetrics } from '@/lib/retrospective';
import { generateWeeklyRetrospective } from '@/services/coachService';
import { RetrospectiveFocusAction, WeeklyRetrospective } from '@/types';

const STABILITY_STYLE: Record<
  string,
  { badgeClass: string; textClass: string }
> = {
  Stabil: {
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    textClass: 'text-emerald-400',
  },
  'Leichte Schwankungen': {
    badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    textClass: 'text-sky-400',
  },
  Dynamisch: {
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    textClass: 'text-amber-400',
  },
  'Stark schwankend': {
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    textClass: 'text-rose-400',
  },
  'Noch keine Daten': {
    badgeClass: 'bg-neutral-800 text-neutral-400 border-neutral-700',
    textClass: 'text-neutral-400',
  },
};

function MoodSwingSparkline({
  days,
}: {
  days: Array<{ shortDay: string; mood: number | null }>;
}) {
  const width = 280;
  const height = 74;
  const padX = 18;
  const padY = 12;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const points = days.map((d, idx) => {
    const x = padX + (idx / Math.max(1, days.length - 1)) * plotW;
    const y =
      d.mood !== null
        ? padY + ((5 - d.mood) / 4) * plotH
        : null;
    return { x, y, mood: d.mood, shortDay: d.shortDay };
  });

  const validPoints = points.filter(
    (p): p is { x: number; y: number; mood: number; shortDay: string } =>
      p.y !== null && p.mood !== null
  );

  const polylinePoints = validPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[78px] overflow-visible"
        role="img"
        aria-label="Stimmungsschwankungen Montag bis Sonntag"
      >
        {[1, 3, 5].map((level) => {
          const y = padY + ((5 - level) / 4) * plotH;
          return (
            <line
              key={level}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="#262626"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          );
        })}

        {validPoints.length >= 2 && (
          <polyline
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />
        )}

        {points.map((p, idx) =>
          p.y !== null && p.mood !== null ? (
            <g key={idx}>
              <circle
                cx={p.x}
                cy={p.y}
                r={4.5}
                fill={p.mood >= 4 ? '#10b981' : p.mood >= 3 ? '#f59e0b' : '#f43f5e'}
                stroke="#0a0a0a"
                strokeWidth={2}
              />
              <text
                x={p.x}
                y={p.y - 8}
                textAnchor="middle"
                fill="#d4d4d4"
                fontSize="9"
                fontWeight="700"
              >
                {p.mood}★
              </text>
            </g>
          ) : (
            <circle
              key={idx}
              cx={p.x}
              cy={padY + plotH / 2}
              r={2.5}
              fill="#404040"
            />
          )
        )}
      </svg>

      <div className="grid grid-cols-7 text-center text-[10px] font-bold uppercase text-neutral-500 mt-0.5 px-1">
        {days.map((d, idx) => (
          <span key={idx}>{d.shortDay}</span>
        ))}
      </div>
    </div>
  );
}

export function WeeklyRetrospectiveWidget({
  onNavigateToQuests,
  onNavigateToCoach,
}: {
  onNavigateToQuests?: () => void;
  onNavigateToCoach?: () => void;
}) {
  const {
    quests,
    diaryEntries,
    focusSessions,
    visions,
    stats,
    weeklyRetrospectives,
    saveWeeklyRetrospective,
    markRetroRecommendationAdopted,
    addQuest,
  } = useStore();

  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isTodaySunday = new Date().getDay() === 0;
  const isCurrentWeek = isSameWeek(selectedDate, new Date(), { weekStartsOn: 1 });

  const metrics = useMemo(
    () =>
      computeWeeklyRetrospectiveMetrics({
        baseDate: selectedDate,
        quests,
        diaryEntries,
        focusSessions,
        visions,
        stats,
      }),
    [selectedDate, quests, diaryEntries, focusSessions, visions, stats]
  );

  const currentRetro = useMemo(
    () => weeklyRetrospectives.find((r) => r.id === metrics.weekKey) || null,
    [weeklyRetrospectives, metrics.weekKey]
  );

  const isStale = useMemo(() => {
    if (!currentRetro) return false;
    return (
      currentRetro.loggedMoodDays !== metrics.loggedMoodDays ||
      currentRetro.completedQuestsCount !== metrics.completedQuestsCount ||
      currentRetro.failedQuestsCount !== metrics.failedQuestsCount ||
      Math.abs(currentRetro.totalXp - metrics.totalXp) >= 5
    );
  }, [currentRetro, metrics]);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const response = await generateWeeklyRetrospective({
        weekLabel: metrics.weekLabel,
        loggedMoodDays: metrics.loggedMoodDays,
        avgMood: metrics.avgMood,
        minMood: metrics.minMood,
        maxMood: metrics.maxMood,
        moodSwingRange: metrics.moodSwingRange,
        moodVolatility: metrics.moodVolatility,
        stabilityLabel: metrics.stabilityLabel,
        biggestJump: metrics.biggestJump,
        peakDay: metrics.peakDay,
        lowDay: metrics.lowDay,
        completedQuestsCount: metrics.completedQuestsCount,
        failedQuestsCount: metrics.failedQuestsCount,
        pendingWeekQuestsCount: metrics.pendingWeekQuestsCount,
        questCompletionRate: metrics.questCompletionRate,
        habitPositiveCount: metrics.habitPositiveCount,
        habitNegativeCount: metrics.habitNegativeCount,
        totalXp: metrics.totalXp,
        totalFocusMinutes: metrics.totalFocusMinutes,
        topSkill: metrics.topSkill,
        completedQuestTitles: metrics.completedQuestTitles,
        failedQuestTitles: metrics.failedQuestTitles,
        visionProgress: metrics.visionProgress,
        dailyBreakdown: metrics.dailyBreakdown.map((d) => ({
          shortDay: d.shortDay,
          dateLabel: d.dateLabel,
          mood: d.mood,
          moodLabel: d.moodLabel,
          completedQuests: d.completedQuests,
          failedQuests: d.failedQuests,
          habitPositive: d.habitPositive,
          habitNegative: d.habitNegative,
          xp: d.xp,
          focusMinutes: d.focusMinutes,
          notes: d.notes,
          progress: d.progress,
        })),
        userLevel: metrics.userLevel,
        streak: metrics.streak,
      });

      const retro: WeeklyRetrospective = {
        id: metrics.weekKey,
        weekStart: metrics.weekStart.getTime(),
        weekEnd: metrics.weekEnd.getTime(),
        headline: response.headline,
        moodFluctuationAnalysis: response.moodFluctuationAnalysis,
        goalAchievementAnalysis: response.goalAchievementAnalysis,
        nextWeekOutlook: response.nextWeekOutlook,
        focusRecommendations: response.focusRecommendations,
        avgMood: metrics.avgMood,
        minMood: metrics.minMood,
        maxMood: metrics.maxMood,
        moodSwingRange: metrics.moodSwingRange,
        moodVolatility: metrics.moodVolatility,
        loggedMoodDays: metrics.loggedMoodDays,
        completedQuestsCount: metrics.completedQuestsCount,
        failedQuestsCount: metrics.failedQuestsCount,
        questCompletionRate: metrics.questCompletionRate,
        habitPositiveCount: metrics.habitPositiveCount,
        habitNegativeCount: metrics.habitNegativeCount,
        totalXp: metrics.totalXp,
        totalFocusMinutes: metrics.totalFocusMinutes,
        adoptedRecommendationIds: currentRetro?.adoptedRecommendationIds || [],
        generatedAt: Date.now(),
        triggerType: isTodaySunday && isCurrentWeek ? 'sunday_auto' : 'manual',
      };

      await saveWeeklyRetrospective(retro);
      toast.success('Wochen-Retrospektive erfolgreich erstellt!');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Wochen-Retrospektive konnte nicht generiert werden.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [
    isGenerating,
    metrics,
    currentRetro?.adoptedRecommendationIds,
    isTodaySunday,
    isCurrentWeek,
    saveWeeklyRetrospective,
  ]);

  const handleAdoptRecommendation = async (rec: RetrospectiveFocusAction) => {
    if (!currentRetro) return;
    const nextMonday = addDays(metrics.weekEnd, 1);
    nextMonday.setHours(18, 0, 0, 0);

    addQuest({
      title: rec.title,
      description: rec.description,
      skill: rec.skill,
      xpReward: rec.xpReward,
      type: 'daily',
      dueDate: nextMonday.getTime(),
      hasTime: false,
      tags: ['Sonntags-Retrospektive'],
    });

    await markRetroRecommendationAdopted(currentRetro.id, rec.id);
    toast.success(`Quest „${rec.title}“ für nächste Woche geplant!`, {
      action: onNavigateToQuests
        ? {
            label: 'Zu Quests',
            onClick: onNavigateToQuests,
          }
        : undefined,
    });
  };

  const stabilityMeta = STABILITY_STYLE[metrics.stabilityLabel] || STABILITY_STYLE['Noch keine Daten'];
  const adoptedIds = currentRetro?.adoptedRecommendationIds || [];

  return (
    <div className="bg-neutral-900 p-4 sm:p-6 rounded-2xl border border-neutral-800 h-full flex flex-col gap-5">
      {/* Header + Schedule Status + Week Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold flex items-center gap-2 text-white">
              <Compass className="w-5 h-5 text-amber-500" />
              Wochen-Retrospektive
            </h3>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold border',
                isTodaySunday
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-neutral-950 text-neutral-400 border-neutral-800'
              )}
            >
              <CalendarCheck2 className="w-3.5 h-3.5" />
              {isTodaySunday
                ? 'Sonntag · Auto-Retrospektive aktiv'
                : `Jeden Sonntag · Nächste am ${format(metrics.weekEnd, 'dd.MM.')}`}
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            Analyse deiner Stimmungsschwankungen, Zielerreichung &amp; Ausblick für nächste Woche
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <div className="flex items-center gap-1 bg-neutral-950 border border-neutral-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setSelectedDate((d) => subWeeks(d, 1));
              }}
              className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Vorherige Woche"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-neutral-300 px-2 whitespace-nowrap tabular-nums">
              {metrics.weekLabel}
            </span>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setSelectedDate((d) => addWeeks(d, 1));
              }}
              disabled={isCurrentWeek}
              className={cn(
                'p-1.5 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center',
                isCurrentWeek
                  ? 'text-neutral-700 cursor-not-allowed'
                  : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
              )}
              aria-label="Nächste Woche"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isCurrentWeek && (
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setSelectedDate(new Date());
                }}
                className="px-2.5 py-1 text-[11px] font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 rounded-lg transition-colors min-h-[32px]"
              >
                Aktuell
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className={cn(
              'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] disabled:opacity-50',
              !currentRetro || isStale
                ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400'
                : 'bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analysiere...
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                {currentRetro ? 'Neu generieren' : 'Jetzt generieren'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Deterministic Two-Column Metrics Strip: Mood Fluctuations + Goal Attainment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Stimmungsschwankungen */}
        <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                Stimmungsschwankungen
              </span>
            </div>
            <span
              className={cn(
                'px-2 py-0.5 rounded-md text-[10px] font-bold border',
                stabilityMeta.badgeClass
              )}
            >
              {metrics.stabilityLabel}
            </span>
          </div>

          <MoodSwingSparkline days={metrics.dailyBreakdown} />

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-800/80 text-xs">
            <div>
              <span className="block text-[10px] text-neutral-500 uppercase font-bold">
                Ø Stimmung
              </span>
              <span className="font-mono font-bold text-amber-400 tabular-nums">
                {metrics.avgMood !== null ? `${metrics.avgMood.toFixed(1)} / 5 ★` : '–'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-neutral-500 uppercase font-bold">
                Spannweite
              </span>
              <span className="font-mono font-bold text-white tabular-nums">
                {metrics.minMood !== null && metrics.maxMood !== null
                  ? `${metrics.minMood}★ – ${metrics.maxMood}★`
                  : '–'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-neutral-500 uppercase font-bold">
                Umschwung
              </span>
              <span className="font-mono font-bold text-neutral-200 tabular-nums">
                {metrics.biggestJump
                  ? `${metrics.biggestJump.fromDay}→${metrics.biggestJump.toDay} (${
                      metrics.biggestJump.delta >= 0 ? '+' : ''
                    }${metrics.biggestJump.delta})`
                  : '–'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Zielerreichung */}
        <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                Zielerreichung
              </span>
            </div>
            <span className="font-mono text-xs font-black text-emerald-400 tabular-nums">
              {metrics.questCompletionRate}% Quote
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded-full bg-neutral-900 overflow-hidden border border-neutral-800">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${metrics.questCompletionRate}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-neutral-400 tabular-nums">
              <span>
                <strong className="text-emerald-400">{metrics.completedQuestsCount}</strong> erledigt
                {' · '}
                <strong className="text-rose-400">{metrics.failedQuestsCount}</strong> verpasst
                {metrics.pendingWeekQuestsCount > 0 && (
                  <>
                    {' · '}
                    <strong className="text-neutral-200">{metrics.pendingWeekQuestsCount}</strong> offen
                  </>
                )}
              </span>
              <span className="font-mono font-bold text-amber-400">+{metrics.totalXp} EP</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-neutral-800/80 text-xs">
            <div>
              <span className="block text-[10px] text-neutral-500 uppercase font-bold">
                Habits (+/-)
              </span>
              <span className="font-mono font-bold tabular-nums">
                <span className="text-emerald-400">+{metrics.habitPositiveCount}</span>
                <span className="text-neutral-600"> / </span>
                <span className="text-rose-400">-{metrics.habitNegativeCount}</span>
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-neutral-500 uppercase font-bold">
                Fokuszeit
              </span>
              <span className="font-mono font-bold text-sky-400 tabular-nums">
                {metrics.totalFocusMinutes} Min
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-neutral-500 uppercase font-bold">
                Lebensziele
              </span>
              <span className="font-mono font-bold text-neutral-200 tabular-nums">
                {metrics.visionProgress.length > 0
                  ? `${metrics.visionProgress.filter((v) => v.completed || v.progressPercent === 100).length}/${metrics.visionProgress.length} erreicht`
                  : 'Keine'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Retrospective Output / States */}
      {isGenerating && !currentRetro ? (
        <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-6 flex items-center gap-3 text-sm text-neutral-300">
          <Loader2 className="w-5 h-5 animate-spin text-amber-400 shrink-0" />
          <div>
            <p className="font-bold text-white">Sonntags-Retrospektive wird erstellt…</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              Stimmungsschwankungen, Quest-Bilanz und dein individueller Ausblick werden ausgewertet.
            </p>
          </div>
        </div>
      ) : errorMsg ? (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Retrospektive konnte nicht geladen werden</p>
              <p className="text-rose-300/80 mt-0.5">{errorMsg}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-3.5 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold border border-rose-500/30 transition-colors self-start sm:self-auto min-h-[38px]"
          >
            Erneut versuchen
          </button>
        </div>
      ) : currentRetro ? (
        <div className="bg-gradient-to-br from-amber-500/10 via-neutral-950/90 to-neutral-950 border border-amber-500/25 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {currentRetro.triggerType === 'sunday_auto'
                    ? 'Automatische Sonntags-Retrospektive'
                    : 'Erstellte Wochen-Retrospektive'}
                </span>
                {isStale && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                    Neue Wochendaten
                  </span>
                )}
              </div>
              <h4 className="text-lg font-black text-white mt-1">
                {currentRetro.headline}
              </h4>
            </div>
            <span className="text-[11px] text-neutral-500 tabular-nums">
              {format(new Date(currentRetro.generatedAt), 'dd.MM.yyyy, HH:mm', { locale: de })} Uhr
            </span>
          </div>

          {/* 3 Analysis Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                <Activity className="w-3.5 h-3.5" />
                Stimmungsschwankungen
              </div>
              <p className="text-xs text-neutral-200 leading-relaxed">
                {currentRetro.moodFluctuationAnalysis}
              </p>
            </div>

            <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Target className="w-3.5 h-3.5" />
                Zielerreichung
              </div>
              <p className="text-xs text-neutral-200 leading-relaxed">
                {currentRetro.goalAchievementAnalysis}
              </p>
            </div>

            <div className="bg-neutral-900/80 border border-amber-500/25 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
                <TrendingUp className="w-3.5 h-3.5" />
                Ausblick nächste Woche
              </div>
              <p className="text-xs text-neutral-200 leading-relaxed">
                {currentRetro.nextWeekOutlook}
              </p>
            </div>
          </div>

          {/* Next Week Actionable Focus Recommendations */}
          {currentRetro.focusRecommendations && currentRetro.focusRecommendations.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-neutral-800/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  Empfohlene Fokus-Quests für nächste Woche
                </span>
                <span className="text-[11px] text-neutral-500">
                  Start ab {format(addDays(metrics.weekEnd, 1), 'dd.MM.', { locale: de })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {currentRetro.focusRecommendations.map((rec) => {
                  const isAdopted = adoptedIds.includes(rec.id);
                  return (
                    <div
                      key={rec.id}
                      className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3 flex flex-col justify-between gap-2.5"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                          <span className={cn(SKILL_COLORS[rec.skill] || 'text-amber-400')}>
                            {rec.skill}
                          </span>
                          <span className="font-mono text-amber-400 tabular-nums">
                            +{rec.xpReward} EP
                          </span>
                        </div>
                        <p className="text-xs font-bold text-white leading-snug">
                          {rec.title}
                        </p>
                        {rec.description && (
                          <p className="text-[11px] text-neutral-400 leading-relaxed">
                            {rec.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isAdopted}
                        onClick={() => handleAdoptRecommendation(rec)}
                        className={cn(
                          'w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-bold transition-colors min-h-[38px]',
                          isAdopted
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                            : 'bg-neutral-900 hover:bg-amber-500 hover:text-neutral-950 text-neutral-200 border border-neutral-800'
                        )}
                      >
                        {isAdopted ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Für nächste Woche geplant
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            Als Quest übernehmen
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {onNavigateToCoach && (
            <div className="pt-2 border-t border-neutral-800/70 flex justify-end">
              <button
                type="button"
                onClick={onNavigateToCoach}
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
              >
                Im AI-Coach vertiefen
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-neutral-950/70 border border-dashed border-neutral-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">
                {isTodaySunday
                  ? 'Sonntags-Retrospektive wartet auf Auswertung'
                  : `Automatische Auswertung am Sonntag (${format(metrics.weekEnd, 'dd.MM.yyyy')})`}
              </p>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-xl">
                Jeden Sonntag analysiert dein AI-Coach automatisch deine Stimmungsschwankungen und Zielerreichungen dieser Woche und erstellt einen persönlichen Ausblick. Du kannst jederzeit auch vorab eine Retrospektive erzeugen.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition-colors shrink-0 min-h-[44px]"
          >
            <Sparkles className="w-4 h-4" />
            {isTodaySunday ? 'Retrospektive erstellen' : 'Vorschau jetzt erstellen'}
          </button>
        </div>
      )}
    </div>
  );
}
