import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Dumbbell, Brain, Target, BookOpen, Users, Play } from 'lucide-react';
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

function computeLifetimeXp(level: number, currentXp: number): number {
  let total = currentXp;
  let threshold = 50;
  for (let lv = 1; lv < level; lv++) {
    total += threshold;
    threshold = Math.floor(threshold * 1.5);
  }
  return total;
}

export function Skills() {
  const { stats, quests, focusSessions } = useStore();
  const navigate = useNavigate();

  const skillDetails = useMemo(() => {
    const skillsList: SkillType[] = ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'];
    return skillsList.map((skill) => {
      const skillStats = stats.skills[skill] || { level: 1, xp: 0, xpToNextLevel: 50 };
      const totalXp = computeLifetimeXp(skillStats.level, skillStats.xp);
      const completedQuests = quests.filter(
        (q) => q.skill === skill && q.completed && !q.failed && q.type !== 'habit'
      ).length;
      const focusMinutes = focusSessions
        .filter((f) => f.skill === skill)
        .reduce((sum, f) => sum + (f.durationMinutes || 0), 0);

      return {
        skill,
        ...skillStats,
        totalXp,
        completedQuests,
        focusMinutes,
        progress: (skillStats.xp / skillStats.xpToNextLevel) * 100,
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

                    <div className="mt-3 space-y-1">
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
