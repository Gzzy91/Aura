import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Award, X, Sparkles, Brain, Dumbbell, BookOpen, Users, Target } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { SkillType } from '@/types';
import { toast } from 'sonner';

const WORK_TIME = 25 * 60;
const SHORT_BREAK = 5 * 60;

const SKILL_ICONS: Record<SkillType, any> = {
  Fitness: Dumbbell,
  Fokus: Target,
  Disziplin: Sparkles,
  Wissen: BookOpen,
  Soziales: Users,
};

export function Focus() {
  const [timeLeft, setTimeLeft] = useState(WORK_TIME);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [selectedSkill, setSelectedSkill] = useState<SkillType>('Fokus');
  
  const { gainXp, addFocusSession } = useStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      handleComplete();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft]);

  const handleComplete = () => {
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
    
    if (mode === 'work') {
      const xpReward = Math.floor(WORK_TIME / 60); // 1 XP per minute
      gainXp(selectedSkill, xpReward);
      addFocusSession({
        durationMinutes: Math.floor(WORK_TIME / 60),
        skill: selectedSkill,
        completedAt: Date.now(),
      });
      
      toast.success(`Fokus-Session beendet! +${xpReward} ${selectedSkill} EP`, {
        icon: '🎉',
        duration: 5000,
      });

      // Switch to break
      setMode('break');
      setTimeLeft(SHORT_BREAK);
    } else {
      toast.success("Pause beendet! Zeit für die nächste Session.", {
        icon: '☕',
      });
      setMode('work');
      setTimeLeft(WORK_TIME);
    }
  };

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === 'work' ? WORK_TIME : SHORT_BREAK);
  };

  const setModeManually = (newMode: 'work' | 'break') => {
    setIsActive(false);
    setMode(newMode);
    setTimeLeft(newMode === 'work' ? WORK_TIME : SHORT_BREAK);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const totalTime = mode === 'work' ? WORK_TIME : SHORT_BREAK;
  const progress = ((totalTime - timeLeft) / totalTime) * 100;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-8rem)]">
      <header className="mb-12 text-center">
        <h2 className="text-4xl font-bold tracking-tight mb-2">Fokus Kammer</h2>
        <p className="text-neutral-400">Nutze Pomodoro, um ungestört an deinen Skills zu leveln.</p>
      </header>

      <div className="flex bg-neutral-900 rounded-2xl p-1 mb-8">
        <button
          onClick={() => setModeManually('work')}
          className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
            mode === 'work' ? 'bg-amber-500/10 text-amber-500' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Fokus ({WORK_TIME / 60}m)
        </button>
        <button
          onClick={() => setModeManually('break')}
          className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
            mode === 'break' ? 'bg-blue-500/10 text-blue-500' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Pause ({SHORT_BREAK / 60}m)
        </button>
      </div>

      <div className="relative mb-12 flex flex-col items-center justify-center w-72 h-72">
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle
            cx="144"
            cy="144"
            r="136"
            className="stroke-neutral-800"
            strokeWidth="12"
            fill="none"
          />
          <circle
            cx="144"
            cy="144"
            r="136"
            className={`transition-all duration-1000 ease-linear ${
              mode === 'work' ? 'stroke-amber-500' : 'stroke-blue-500'
            }`}
            strokeWidth="12"
            strokeDasharray={136 * 2 * Math.PI}
            strokeDashoffset={136 * 2 * Math.PI * (1 - progress / 100)}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        <div className="z-10 text-center">
          <div className="text-6xl font-mono font-bold tracking-tighter tabular-nums mb-2">
            {formatTime(timeLeft)}
          </div>
          <div className="text-neutral-400 font-medium uppercase tracking-widest text-sm">
            {mode === 'work' ? 'Im Fokus' : 'Pause'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-12">
        <button
          onClick={toggleTimer}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
            isActive 
              ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700' 
              : mode === 'work' 
                ? 'bg-amber-500 text-amber-950 hover:bg-amber-400'
                : 'bg-blue-500 text-blue-950 hover:bg-blue-400'
          }`}
        >
          {isActive ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
        </button>
        <button
          onClick={resetTimer}
          className="w-16 h-16 rounded-full flex items-center justify-center bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
        >
          <Square className="w-6 h-6 fill-current" />
        </button>
      </div>

      {mode === 'work' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-sm">
          <label className="block text-sm font-medium text-neutral-400 mb-3">
            Welchen Skill trainierst du?
          </label>
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(SKILL_ICONS) as SkillType[]).map(skill => {
              const Icon = SKILL_ICONS[skill];
              return (
                <button
                  key={skill}
                  onClick={() => setSelectedSkill(skill)}
                  className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-colors ${
                    selectedSkill === skill
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                      : 'bg-neutral-800 text-neutral-500 border border-transparent hover:bg-neutral-700 hover:text-neutral-300'
                  }`}
                  title={skill}
                >
                  <Icon className="w-5 h-5" />
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-center text-sm text-neutral-500">
            Erfolgreiche Session: <span className="font-bold text-amber-500">+{WORK_TIME / 60} EP</span> in {selectedSkill}
          </div>
        </div>
      )}
    </div>
  );
}
