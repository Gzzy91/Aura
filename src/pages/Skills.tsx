import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Dumbbell, Brain, Target, BookOpen, Users, Play, Clock, AlertTriangle } from 'lucide-react';
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { SkillType } from '@/types';
import { cn, SKILL_COLORS, SKILL_BG_COLORS, SKILL_PROGRESS_COLORS } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/ProgressBar';
import {
  SKILL_BASE_XP,
  WEEK_MS,
  computeLifetimeXp,
  getSkillLastWorkedFromHistory,
  getUpcomingWeeklyPenalty,
} from '@/lib/skillDecay';

const SKILL_ICONS: Record<SkillType, React.ElementType> = {
  Fitness: Dumbbell,
  Fokus: Target,
  Disziplin: Brain,
  Wissen: BookOpen,
  Soziales: Users,
};

const SKILL_DESCRIPTIONS: Record<SkillType, string> = {
  Fitness: 'Training, Bewegung, Schlaf & körperliche Energie',
  Fokus: 'Deep Work, Pomodoro-Sessions & ablenkungsfreie Zeit',
  Disziplin: 'Tägliche Routinen, Gewohnheiten & Verlässlichkeit',
  Wissen: 'Lernen, Lesen, Reflexion & mentale Weiterbildung',
  Soziales: 'Beziehungen, Kommunikation & gemeinsame Aktivitäten',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function Skills() {
  const { stats, quests, focusSessions } = useStore();
  const navigate = useNavigate();

  const skillDetails = useMemo(() => {
    const now = Date.now();
    const skillsList: SkillType[] = ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'];
    const historyLastWorked = getSkillLastWorkedFromHistory(quests, focusSessions);

    return skillsList.map((skill) => {
      const skillStats = stats.skills[skill] || { level: 1, xp: 0, xpToNextLevel: SKILL_BASE_XP };
      const totalXp = computeLifetimeXp(skillStats.level, skillStats.xp, SKILL_BASE_XP);
      const completedQuests = quests.filter(
        (q) => q.skill === skill && q.completed && !q.failed && q.type !== 'habit'
      ).length;
      const focusMinutes = focusSessions
        .filter((f) => f.skill === skill)
        .reduce((sum, f) => sum + (f.durationMinutes || 0), 0);

      const historyTs = historyLastWorked[skill];
      const storedTs = typeof skillStats.lastWorkedAt === 'number' ? skillStats.lastWorkedAt : null;
      const lastWorkedAt =
        historyTs !== null && storedTs !== null
          ? Math.max(historyTs, storedTs)
          : historyTs ?? storedTs;
      const lastDecayAt = typeof skillStats.lastDecayAt === 'number' ? skillStats.lastDecayAt : null;
      const anchor =
        lastWorkedAt !== null
          ? lastDecayAt !== null
            ? Math.max(lastWorkedAt, lastDecayAt)
            : lastWorkedAt
          : null;

      const daysSinceActivity =
        lastWorkedAt !== null ? Math.max(0, Math.floor((now - lastWorkedAt) / DAY_MS)) : null;
      const daysUntilDecay =
        anchor !== null && totalXp > 0
          ? Math.max(0, Math.ceil((anchor + WEEK_MS - now) / DAY_MS))
          : null;
      const nextPenaltyXp = getUpcomingWeeklyPenalty(skillStats.xpToNextLevel);
      const hasRecentDecay = Boolean(
        skillStats.lastDecayAmount &&
          skillStats.lastDecayAmount > 0 &&
          lastDecayAt !== null &&
          (lastWorkedAt === null || lastDecayAt >= lastWorkedAt)
      );

      return {
        skill,
        ...skillStats,
        totalXp,
        completedQuests,
        focusMinutes,
        progress: (skillStats.xp / skillStats.xpToNextLevel) * 100,
        daysSinceActivity,
        daysUntilDecay,
        nextPenaltyXp,
        hasRecentDecay,
      };
    });
  }, [stats.skills, quests, focusSessions]);

  const radarData = useMemo(
    () =>
      skillDetails.map((d) => ({
        skill: d.skill,
        level: d.level,
        totalXp: d.totalXp,
      })),
    [skillDetails]
  );

  const strongestSkill = useMemo(
    () => [...skillDetails].sort((a, b) => b.totalXp - a.totalXp)[0],
    [skillDetails]
  );

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Fähigkeiten &amp; Balance
          </h2>
          <p className="text-sm text-neutral-400">
            Entwickle deine 5 Kernattribute durch Quests, Habits und Fokus-Sessions
          </p>
        </div>
        {strongestSkill && strongestSkill.totalXp > 0 && (
          <div className="text-xs text-neutral-400">
            Stärkstes Attribut:{' '}
            <span className={cn('font-bold', SKILL_COLORS[strongestSkill.skill])}>
              {strongestSkill.skill} (Stufe {strongestSkill.level})
            </span>
          </div>
        )}
      </header>

      <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl px-4 py-3 flex items-start sm:items-center gap-3 text-xs text-neutral-300">
        <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
        <p>
          <span className="font-semibold text-white">Wöchentlicher Skill-Erhalt:</span> Wird an einem
          Skill 7 Tage lang nicht gearbeitet, werden{' '}
          <span className="text-amber-400 font-semibold">25 % der Stufen-EP</span> abgezogen – inklusive
          möglicher Level-Rückstufung.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Skill Balance Radar Graphic */}
        <div className="lg:col-span-5 bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col">
          <div className="mb-2">
            <h3 className="text-base font-bold text-white">Attribut-Profil</h3>
            <p className="text-xs text-neutral-400">
              Stufenverteilung über alle fünf Lebensbereiche
            </p>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#262626" />
                <PolarAngleAxis
                  dataKey="skill"
                  tick={{ fill: '#a3a3a3', fontSize: 12, fontWeight: 600 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#171717',
                    border: '1px solid #262626',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [`Stufe ${value}`, 'Level']}
                />
                <Radar
                  name="Level"
                  dataKey="level"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.28}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Skill Cards */}
        <div className="lg:col-span-7 grid gap-3.5">
          {skillDetails.map((item) => {
            const Icon = SKILL_ICONS[item.skill] || Brain;
            const textColorClass = SKILL_COLORS[item.skill];
            const bgColorClass = SKILL_BG_COLORS[item.skill];
            const progressColorClass = SKILL_PROGRESS_COLORS[item.skill];
            const isWarningWindow =
              item.totalXp > 0 && item.daysUntilDecay !== null && item.daysUntilDecay <= 2;

            return (
              <div
                key={item.skill}
                className="bg-neutral-900 p-4 sm:p-5 rounded-2xl border border-neutral-800 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl border border-neutral-800 flex items-center justify-center shrink-0',
                      bgColorClass,
                      textColorClass
                    )}
                  >
                    <Icon className="w-6 h-6" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-lg font-bold text-white truncate">{item.skill}</h3>
                      <span className="text-xs font-mono font-bold text-neutral-300 tabular-nums shrink-0">
                        Stufe {item.level} · {item.totalXp} EP gesamt
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-0.5 truncate">
                      {SKILL_DESCRIPTIONS[item.skill]}
                    </p>

                    <div className="mt-3 space-y-1.5">
                      <ProgressBar
                        progress={item.progress}
                        colorClass={progressColorClass}
                        className="h-2"
                      />
                      <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono tabular-nums">
                        <span>
                          {item.xp} / {item.xpToNextLevel} EP zum nächsten Level
                        </span>
                        <span>
                          {item.completedQuests} Quests · {item.focusMinutes}m Fokus
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]">
                        <span
                          className={cn(
                            'font-medium',
                            item.daysSinceActivity === 0
                              ? 'text-emerald-400'
                              : isWarningWindow
                              ? 'text-amber-400'
                              : 'text-neutral-500'
                          )}
                        >
                          {item.daysSinceActivity === null
                            ? 'Noch keine Aktivität erfasst'
                            : item.daysSinceActivity === 0
                            ? 'Heute trainiert'
                            : `Zuletzt vor ${item.daysSinceActivity} ${item.daysSinceActivity === 1 ? 'Tag' : 'Tagen'} trainiert`}
                        </span>

                        {item.totalXp > 0 && item.daysUntilDecay !== null && (
                          <span
                            className={cn(
                              'tabular-nums',
                              isWarningWindow ? 'text-amber-400 font-medium' : 'text-neutral-500'
                            )}
                          >
                            {item.daysUntilDecay === 0
                              ? `Abzug fällig (-${item.nextPenaltyXp} EP)`
                              : `Verfall (-${item.nextPenaltyXp} EP) in ${item.daysUntilDecay} ${item.daysUntilDecay === 1 ? 'Tag' : 'Tagen'}`}
                          </span>
                        )}
                      </div>

                      {item.hasRecentDecay && (
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-400 font-medium pt-0.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            -{item.lastDecayAmount} EP durch Inaktivität abgezogen
                            {item.lastDecayDemotedFrom && item.lastDecayDemotedFrom > item.level
                              ? ` (Rückstufung von Stufe ${item.lastDecayDemotedFrom})`
                              : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(`/focus?skill=${encodeURIComponent(item.skill)}`)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-200 transition-colors shrink-0 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 text-amber-400" />
                  <span>Trainieren</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
