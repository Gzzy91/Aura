import { useStore } from '@/store/useStore';
import { Dumbbell, Brain, Target, BookOpen, Users } from 'lucide-react';
import { SkillType } from '@/types';
import { cn, SKILL_COLORS, SKILL_BORDER_COLORS, SKILL_PROGRESS_COLORS } from '@/lib/utils';
import { ProgressBar } from '@/components/ui/ProgressBar';

const SKILL_ICONS: Record<SkillType, any> = {
  Fitness: Dumbbell,
  Fokus: Target,
  Disziplin: Brain,
  Wissen: BookOpen,
  Soziales: Users,
};

export function Skills() {
  const { stats } = useStore();

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Skill-Baum</h2>
        <p className="text-neutral-400">Entwickle deine Attribute</p>
      </header>

      <div className="grid gap-4">
        {Object.entries(stats.skills).map(([skillName, skillStats]) => {
          const Icon = SKILL_ICONS[skillName as SkillType] || Brain;
          const textColorClass = SKILL_COLORS[skillName as SkillType] || 'text-neutral-500';
          const progressColorClass = SKILL_PROGRESS_COLORS[skillName as SkillType] || 'bg-neutral-500';
          const progress = (skillStats.xp / skillStats.xpToNextLevel) * 100;

          return (
            <div key={skillName} className={cn("bg-neutral-900 p-6 rounded-2xl border-l-4 border-y border-r border-y-neutral-800 border-r-neutral-800 flex items-center gap-6", SKILL_BORDER_COLORS[skillName as SkillType])}>
              <div className={cn("p-4 rounded-xl bg-neutral-950 border border-neutral-800", textColorClass)}>
                <Icon className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-xl font-bold">{skillName}</h3>
                    <p className="text-sm text-neutral-400 font-mono mt-1">Stufe {skillStats.level}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold font-mono text-white">{skillStats.xp}</div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">Total EP</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-neutral-400 font-mono">
                    <span>{skillStats.xp} EP</span>
                    <span>{skillStats.xpToNextLevel} EP</span>
                  </div>
                  <ProgressBar progress={progress} colorClass={progressColorClass} className="h-2" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
