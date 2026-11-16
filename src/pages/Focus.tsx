import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Dumbbell,
  BookOpen,
  Users,
  Target,
  Clock,
  CheckCircle2,
  Flame,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { SkillType } from '@/types';
import { cn, SKILL_COLORS, SKILL_BG_COLORS } from '@/lib/utils';
import { format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';

const WORK_PRESETS = [15, 25, 50] as const;
const BREAK_PRESETS = [5, 10, 15] as const;

const SKILL_ICONS: Record<SkillType, React.ElementType> = {
  Fitness: Dumbbell,
  Fokus: Target,
  Disziplin: Sparkles,
  Wissen: BookOpen,
  Soziales: Users,
};

const VALID_SKILLS: SkillType[] = ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'];

export function Focus() {
  const [searchParams] = useSearchParams();
  const initialSkillParam = searchParams.get('skill') as SkillType | null;
  const resolvedInitialSkill: SkillType =
    initialSkillParam && VALID_SKILLS.includes(initialSkillParam) ? initialSkillParam : 'Fokus';

  const { gainXp, addFocusSession, focusSessions, quests } = useStore();

  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [workMinutes, setWorkMinutes] = useState<number>(25);
  const [breakMinutes, setBreakMinutes] = useState<number>(5);
  const [timeLeft, setTimeLeft] = useState<number>(25 * 60);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillType>(resolvedInitialSkill);
  const [linkedQuestId, setLinkedQuestId] = useState<string>('');

  const endTimeRef = useRef<number | null>(null);
  const completedLockRef = useRef<boolean>(false);

  // Sync URL ?skill= if navigated from Skills page
  useEffect(() => {
    const param = searchParams.get('skill') as SkillType | null;
    if (param && VALID_SKILLS.includes(param)) {
      setSelectedSkill(param);
    }
  }, [searchParams]);

  const activeQuests = useMemo(
    () => quests.filter((q) => !q.completed && q.type !== 'habit'),
    [quests]
  );

  const todaySessions = useMemo(() => {
    const today = new Date();
    return focusSessions.filter((s) => isSameDay(new Date(s.completedAt), today));
  }, [focusSessions]);

  const todayMinutes = useMemo(
    () => todaySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0),
    [todaySessions]
  );

  const recentSessions = useMemo(
    () => [...focusSessions].sort((a, b) => b.completedAt - a.completedAt).slice(0, 6),
    [focusSessions]
  );

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Document title sync while timer runs
  useEffect(() => {
    if (isActive) {
      document.title = `${formatTime(timeLeft)} · ${mode === 'work' ? 'Fokus' : 'Pause'} – Aura`;
    } else {
      document.title = 'Aura – Fokus, Gewohnheiten & Energie';
    }
    return () => {
      document.title = 'Aura – Fokus, Gewohnheiten & Energie';
    };
  }, [isActive, timeLeft, mode]);

  const handleComplete = () => {
    if (completedLockRef.current) return;
    completedLockRef.current = true;
    setIsActive(false);
    endTimeRef.current = null;

    if (mode === 'work') {
      const xpReward = workMinutes; // 1 EP per minute
      const linkedQuest = activeQuests.find((q) => q.id === linkedQuestId);
      gainXp(selectedSkill, xpReward);
      addFocusSession({
        durationMinutes: workMinutes,
        skill: selectedSkill,
        completedAt: Date.now(),
        ...(linkedQuest ? { notes: linkedQuest.title } : {}),
      });

      toast.success(`Fokus-Session beendet! +${xpReward} ${selectedSkill} EP`, {
        icon: '🎯',
        duration: 5000,
      });

      setMode('break');
      setTimeLeft(breakMinutes * 60);
    } else {
      toast.success('Pause beendet! Zeit für die nächste Session.', {
        icon: '☕',
      });
      setMode('work');
      setTimeLeft(workMinutes * 60);
    }
  };

  // Drift-resistant timestamp countdown loop
  useEffect(() => {
    if (!isActive) {
      endTimeRef.current = null;
      return;
    }

    completedLockRef.current = false;
    if (endTimeRef.current === null) {
      endTimeRef.current = Date.now() + timeLeft * 1000;
    }

    const interval = setInterval(() => {
      if (!endTimeRef.current) return;
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        handleComplete();
      }
    }, 250);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, mode, workMinutes, breakMinutes, selectedSkill, linkedQuestId]);

  const toggleTimer = () => {
    if (isActive) {
      if (endTimeRef.current) {
        const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
        setTimeLeft(remaining);
      }
      endTimeRef.current = null;
      setIsActive(false);
    } else {
      completedLockRef.current = false;
      endTimeRef.current = Date.now() + timeLeft * 1000;
      setIsActive(true);
    }
  };

  const resetTimer = () => {
    setIsActive(false);
    endTimeRef.current = null;
    completedLockRef.current = false;
    setTimeLeft((mode === 'work' ? workMinutes : breakMinutes) * 60);
  };

  const switchMode = (newMode: 'work' | 'break') => {
    setIsActive(false);
    endTimeRef.current = null;
    completedLockRef.current = false;
    setMode(newMode);
    setTimeLeft((newMode === 'work' ? workMinutes : breakMinutes) * 60);
  };

  const selectPreset = (minutes: number) => {
    setIsActive(false);
    endTimeRef.current = null;
    completedLockRef.current = false;
    if (mode === 'work') {
      setWorkMinutes(minutes);
    } else {
      setBreakMinutes(minutes);
    }
    setTimeLeft(minutes * 60);
  };

  const totalTime = (mode === 'work' ? workMinutes : breakMinutes) * 60;
  const progress = totalTime > 0 ? Math.min(100, Math.max(0, ((totalTime - timeLeft) / totalTime) * 100)) : 0;
  const presets = mode === 'work' ? WORK_PRESETS : BREAK_PRESETS;
  const activePreset = mode === 'work' ? workMinutes : breakMinutes;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Target className="w-8 h-8 text-amber-500" />
            Fokus-Kammer
          </h2>
          <p className="text-neutral-400 mt-1">
            Ungestörte Tiefenarbeit mit Timer-Presets, Quest-Verknüpfung &amp; direktem EP-Fortschritt.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-2.5 shrink-0">
          <Flame className="w-4 h-4 text-amber-500" />
          <div className="text-xs">
            <span className="text-neutral-400">Heute fokussiert: </span>
            <strong className="text-white tabular-nums">{todayMinutes} Min</strong>
            <span className="text-neutral-500 ml-1.5 tabular-nums">({todaySessions.length}×)</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Timer Column */}
        <section className="lg:col-span-7 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 flex flex-col items-center">
          {/* Mode Switch + Presets */}
          <div className="w-full flex flex-wrap items-center justify-between gap-3 mb-8">
            <div className="flex bg-neutral-950 border border-neutral-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => switchMode('work')}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-bold transition-colors min-h-[40px]',
                  mode === 'work'
                    ? 'bg-amber-500 text-neutral-950'
                    : 'text-neutral-400 hover:text-neutral-200'
                )}
              >
                Fokus ({workMinutes}m)
              </button>
              <button
                type="button"
                onClick={() => switchMode('break')}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-bold transition-colors min-h-[40px]',
                  mode === 'break'
                    ? 'bg-blue-500 text-neutral-950'
                    : 'text-neutral-400 hover:text-neutral-200'
                )}
              >
                Pause ({breakMinutes}m)
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 rounded-xl p-1">
              {presets.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => selectPreset(mins)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums transition-colors min-h-[36px]',
                    activePreset === mins
                      ? mode === 'work'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                      : 'text-neutral-400 hover:text-white border border-transparent'
                  )}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          {/* Circular Progress Dial */}
          <div className="relative mb-8 flex flex-col items-center justify-center w-64 h-64 sm:w-72 sm:h-72">
            <svg viewBox="0 0 288 288" className="absolute inset-0 w-full h-full -rotate-90">
              <circle
                cx="144"
                cy="144"
                r="132"
                className="stroke-neutral-800"
                strokeWidth="12"
                fill="none"
              />
              <circle
                cx="144"
                cy="144"
                r="132"
                className={cn(
                  'transition-all duration-300 ease-out',
                  mode === 'work' ? 'stroke-amber-500' : 'stroke-blue-500'
                )}
                strokeWidth="12"
                strokeDasharray={132 * 2 * Math.PI}
                strokeDashoffset={132 * 2 * Math.PI * (1 - progress / 100)}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="z-10 text-center">
              <div className="text-5xl sm:text-6xl font-mono font-bold tracking-tighter tabular-nums mb-1.5 text-white">
                {formatTime(timeLeft)}
              </div>
              <div className="text-neutral-400 font-semibold uppercase tracking-widest text-xs">
                {mode === 'work' ? `Fokus · ${selectedSkill}` : 'Aktive Erholung'}
              </div>
            </div>
          </div>

          {/* Primary Controls */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={toggleTimer}
              className={cn(
                'h-14 px-8 rounded-2xl flex items-center justify-center gap-2.5 font-bold text-sm transition-colors min-w-[150px]',
                isActive
                  ? 'bg-neutral-800 text-neutral-100 hover:bg-neutral-700'
                  : mode === 'work'
                    ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400'
                    : 'bg-blue-500 text-neutral-950 hover:bg-blue-400'
              )}
            >
              {isActive ? (
                <>
                  <Pause className="w-5 h-5 fill-current" />
                  Pausieren
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  {timeLeft < totalTime ? 'Fortsetzen' : 'Starten'}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={resetTimer}
              className="w-14 h-14 rounded-2xl flex items-center justify-center bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
              aria-label="Timer zurücksetzen"
              title="Zurücksetzen"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </section>

        {/* Configuration + History Column */}
        <aside className="lg:col-span-5 space-y-6">
          {/* Skill & Optional Quest Selection */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
                Skill für diese Session
              </label>
              <div className="grid grid-cols-5 gap-2">
                {VALID_SKILLS.map((skill) => {
                  const Icon = SKILL_ICONS[skill];
                  const selected = selectedSkill === skill;
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => setSelectedSkill(skill)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 rounded-xl border transition-colors min-h-[58px]',
                        selected
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/50'
                          : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:text-neutral-200'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[10px] font-semibold truncate max-w-full">{skill}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-neutral-400">
                Abschluss-Belohnung:{' '}
                <strong className="text-amber-400 tabular-nums">+{workMinutes} EP</strong> in{' '}
                {selectedSkill}
              </p>
            </div>

            <div className="pt-4 border-t border-neutral-800">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">
                Optional mit Quest verknüpfen
              </label>
              <select
                value={linkedQuestId}
                onChange={(e) => {
                  const qId = e.target.value;
                  setLinkedQuestId(qId);
                  const found = activeQuests.find((q) => q.id === qId);
                  if (found) setSelectedSkill(found.skill);
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-neutral-200 focus:outline-none focus:border-amber-500 min-h-[44px]"
              >
                <option value="">Freie Fokus-Session (ohne Quest)</option>
                {activeQuests.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} ({q.skill})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Recent Sessions History */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Letzte Fokus-Sessions
              </h3>
              <span className="text-xs font-mono text-neutral-500 tabular-nums">
                {focusSessions.length} gesamt
              </span>
            </div>

            {recentSessions.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-neutral-800 rounded-2xl text-xs text-neutral-500">
                Noch keine Session abgeschlossen. Starte deinen ersten Fokus-Block!
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between gap-3 bg-neutral-950 border border-neutral-800 rounded-xl p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CheckCircle2 className={cn('w-4 h-4 shrink-0', SKILL_COLORS[session.skill])} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {session.notes || `${session.skill}-Fokus`}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {format(new Date(session.completedAt), 'dd.MM. · HH:mm', { locale: de })} Uhr
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          'text-[11px] font-bold px-2 py-0.5 rounded-md',
                          SKILL_BG_COLORS[session.skill],
                          SKILL_COLORS[session.skill]
                        )}
                      >
                        {session.skill}
                      </span>
                      <span className="text-xs font-mono font-bold text-amber-400 tabular-nums">
                        {session.durationMinutes}m
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
