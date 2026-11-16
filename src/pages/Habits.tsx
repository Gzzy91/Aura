import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import {
  Plus,
  Trash2,
  Edit2,
  Search,
  MinusCircle,
  PlusCircle,
  History,
  CheckCircle2,
  X,
  Filter,
  ChevronDown,
  Flame,
  LayoutList,
  LayoutGrid,
  Sparkles,
  Target,
} from 'lucide-react';
import { SkillType, Quest } from '@/types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, SKILL_COLORS, SKILL_BG_COLORS, SKILL_BORDER_COLORS } from '@/lib/utils';
import {
  getHabitCurrentStreak,
  getHabitTodayStats,
  getHabitTotals,
  getLast7DaysActivity,
} from '@/lib/habits';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';
import { QuestModal } from '@/components/QuestModal';
import { HabitHistoryModal } from '@/components/HabitHistoryModal';
import { triggerHabitPositiveConfetti } from '@/lib/confetti';
import { toast } from 'sonner';

type StatusTab = 'all' | 'open_today' | 'done_today';
type DirectionFilter = 'all' | 'positive' | 'negative' | 'both';
type SortOption = 'default' | 'open_first' | 'streak' | 'most_used' | 'xp';
type ViewMode = 'list' | 'cards';

const ALL_SKILLS: SkillType[] = ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'];

export function Habits() {
  const { quests, addQuest, completeQuest, deleteQuest, updateQuest, removeHabitCompletion } =
    useStore();

  const [isAdding, setIsAdding] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Quest | null>(null);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [historyHabitId, setHistoryHabitId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Non-blocking visual flash for rapid tapping
  const [flashAction, setFlashAction] = useState<{
    id: string;
    direction: 'positive' | 'negative';
  } | null>(null);

  // Quick-add bar state
  const [quickTitle, setQuickTitle] = useState('');
  const [quickSkill, setQuickSkill] = useState<SkillType>('Disziplin');
  const [quickDirection, setQuickDirection] = useState<'positive' | 'both' | 'negative'>('positive');

  // View, Search & Filters
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('habits_view_mode');
      return saved === 'cards' ? 'cards' : 'list';
    } catch {
      return 'list';
    }
  });
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSkills, setFilterSkills] = useState<SkillType[]>([]);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [showFilters, setShowFilters] = useState(false);

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('habits_view_mode', mode);
    } catch {
      // Ignore storage errors
    }
  };

  const habits = useMemo(() => quests.filter((q) => q.type === 'habit'), [quests]);
  const historyHabit = useMemo(
    () => (historyHabitId ? habits.find((h) => h.id === historyHabitId) || null : null),
    [habits, historyHabitId]
  );

  const allTags = useMemo(
    () => Array.from(new Set(habits.flatMap((h) => h.tags || []))).sort(),
    [habits]
  );

  // Global Today Summary across all habits
  const todaySummary = useMemo(() => {
    let positiveHabitsDone = 0;
    let positiveCapableCount = 0;
    let totalPosActions = 0;
    let totalNegActions = 0;
    let netXp = 0;

    for (const h of habits) {
      const dir = h.habitDirection || 'positive';
      const t = getHabitTodayStats(h);
      totalPosActions += t.positiveToday;
      totalNegActions += t.negativeToday;
      netXp += t.netXpToday;
      if (dir === 'positive' || dir === 'both') {
        positiveCapableCount += 1;
        if (t.positiveToday > 0) positiveHabitsDone += 1;
      }
    }

    return {
      positiveHabitsDone,
      positiveCapableCount,
      totalPosActions,
      totalNegActions,
      netXp,
    };
  }, [habits]);

  const tabCounts = useMemo(() => {
    let openToday = 0;
    let doneToday = 0;

    for (const h of habits) {
      const t = getHabitTodayStats(h);
      const hasAnyToday = t.positiveToday > 0 || t.negativeToday > 0;
      if (hasAnyToday) doneToday += 1;

      const dir = h.habitDirection || 'positive';
      if (dir === 'negative') {
        if (t.negativeToday === 0) openToday += 1;
      } else if (t.positiveToday === 0) {
        openToday += 1;
      }
    }

    return {
      all: habits.length,
      openToday,
      doneToday,
    };
  }, [habits]);

  const activeFilterCount =
    (filterSkills.length > 0 ? 1 : 0) +
    (directionFilter !== 'all' ? 1 : 0) +
    (filterTags.length > 0 ? 1 : 0) +
    (sortOption !== 'default' ? 1 : 0);

  const resetAllFilters = () => {
    setFilterSkills([]);
    setDirectionFilter('all');
    setFilterTags([]);
    setSortOption('default');
    setSearchQuery('');
    setStatusTab('all');
  };

  const filteredHabits = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase();

    const filtered = habits.filter((h) => {
      const t = getHabitTodayStats(h);
      const dir = h.habitDirection || 'positive';

      if (statusTab === 'open_today') {
        if (dir === 'negative') {
          if (t.negativeToday > 0) return false;
        } else if (t.positiveToday > 0) {
          return false;
        }
      } else if (statusTab === 'done_today') {
        if (t.positiveToday === 0 && t.negativeToday === 0) return false;
      }

      if (directionFilter !== 'all' && dir !== directionFilter) {
        return false;
      }

      if (filterSkills.length > 0 && !filterSkills.includes(h.skill)) {
        return false;
      }

      if (filterTags.length > 0 && (!h.tags || !filterTags.every((tag) => h.tags!.includes(tag)))) {
        return false;
      }

      if (searchLower) {
        const matchesTitle = h.title.toLowerCase().includes(searchLower);
        const matchesDesc = (h.description || '').toLowerCase().includes(searchLower);
        const matchesTags = h.tags?.some((tag) => tag.toLowerCase().includes(searchLower));
        if (!matchesTitle && !matchesDesc && !matchesTags) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortOption === 'open_first') {
        const aToday = getHabitTodayStats(a).positiveToday > 0 ? 1 : 0;
        const bToday = getHabitTodayStats(b).positiveToday > 0 ? 1 : 0;
        if (aToday !== bToday) return aToday - bToday;
      } else if (sortOption === 'streak') {
        const diff = getHabitCurrentStreak(b) - getHabitCurrentStreak(a);
        if (diff !== 0) return diff;
      } else if (sortOption === 'most_used') {
        const diff = (b.completions?.length || 0) - (a.completions?.length || 0);
        if (diff !== 0) return diff;
      } else if (sortOption === 'xp') {
        const diff = b.xpReward - a.xpReward;
        if (diff !== 0) return diff;
      }
      return b.createdAt - a.createdAt;
    });
  }, [habits, statusTab, directionFilter, filterSkills, filterTags, searchQuery, sortOption]);

  const handleComplete = (habit: Quest, isNegativeHabit: boolean = false, customDateMs?: number) => {
    if (!isNegativeHabit && !customDateMs) {
      triggerHabitPositiveConfetti();
    }

    setFlashAction({
      id: habit.id,
      direction: isNegativeHabit ? 'negative' : 'positive',
    });
    setTimeout(() => {
      setFlashAction((prev) => (prev?.id === habit.id ? null : prev));
    }, 260);

    const completionDate = completeQuest(habit.id, isNegativeHabit, customDateMs);

    const undoCompletion = () => {
      const currentHabit = useStore.getState().quests.find((q) => q.id === habit.id);
      const list = currentHabit?.completions || [];
      let indexToRemove = -1;
      if (typeof completionDate === 'number') {
        indexToRemove = list.findIndex((c) => c.date === completionDate);
      }
      if (indexToRemove === -1) {
        const targetDir = isNegativeHabit ? 'negative' : 'positive';
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].direction === targetDir) {
            indexToRemove = i;
            break;
          }
        }
      }
      if (indexToRemove !== -1) {
        removeHabitCompletion(habit.id, indexToRemove);
      }
    };

    if (isNegativeHabit) {
      toast.info(`"${habit.title}" protokolliert (-${habit.xpReward} EP)`, {
        action: {
          label: 'Rückgängig',
          onClick: undoCompletion,
        },
      });
    } else {
      toast.success(`"${habit.title}" erledigt! +${habit.xpReward} EP`, {
        action: {
          label: 'Rückgängig',
          onClick: undoCompletion,
        },
      });
    }
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;

    addQuest({
      title,
      description: '',
      skill: quickSkill,
      xpReward: 5,
      type: 'habit',
      habitDirection: quickDirection,
      subtasks: [],
      tags: [],
    });

    setQuickTitle('');
    toast.success(`Habit "${title}" erstellt`);
  };

  const cycleQuickDirection = () => {
    setQuickDirection((prev) =>
      prev === 'positive' ? 'both' : prev === 'both' ? 'negative' : 'positive'
    );
  };

  const handleDelete = () => {
    if (selectedHabitId) {
      deleteQuest(selectedHabitId);
      if (historyHabitId === selectedHabitId) setHistoryHabitId(null);
      setSelectedHabitId(null);
      setIsDeleting(false);
      toast.info('Habit gelöscht');
    }
  };

  const hasActiveSearchOrFilter =
    searchQuery.trim().length > 0 || activeFilterCount > 0 || statusTab !== 'all';

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12">
      {/* Top Header */}
      <header className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Gewohnheiten
            </h2>
            <span className="text-xs font-mono font-semibold text-neutral-400 tabular-nums">
              {filteredHabits.length}/{habits.length}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5 truncate">
            Routinen aufbauen & schlechte Gewohnheiten abbauen
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold px-3.5 py-2.5 sm:px-4 rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-500/10 active:scale-95 transition-all text-xs sm:text-sm whitespace-nowrap shrink-0 min-h-[42px]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Neuer Habit</span>
        </button>
      </header>

      {/* Today Momentum Summary Strip */}
      {habits.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-neutral-900/90 border border-neutral-800/90 rounded-xl px-3 py-2">
            <div className="text-[11px] text-neutral-400 truncate">Heute erledigt</div>
            <div className="text-sm sm:text-base font-bold text-white tabular-nums mt-0.5">
              {todaySummary.positiveHabitsDone}
              {todaySummary.positiveCapableCount > 0 && (
                <span className="text-neutral-500 font-medium">
                  /{todaySummary.positiveCapableCount}
                </span>
              )}
            </div>
          </div>
          <div className="bg-neutral-900/90 border border-neutral-800/90 rounded-xl px-3 py-2">
            <div className="text-[11px] text-neutral-400 truncate">Aktionen heute</div>
            <div className="text-sm sm:text-base font-bold tabular-nums mt-0.5 flex items-center gap-1.5">
              <span className="text-emerald-400">+{todaySummary.totalPosActions}</span>
              <span className="text-neutral-600">/</span>
              <span className="text-rose-400">-{todaySummary.totalNegActions}</span>
            </div>
          </div>
          <div className="bg-neutral-900/90 border border-neutral-800/90 rounded-xl px-3 py-2">
            <div className="text-[11px] text-neutral-400 truncate">Habit-EP heute</div>
            <div
              className={cn(
                'text-sm sm:text-base font-bold font-mono tabular-nums mt-0.5',
                todaySummary.netXp > 0
                  ? 'text-amber-400'
                  : todaySummary.netXp < 0
                  ? 'text-rose-400'
                  : 'text-neutral-400'
              )}
            >
              {todaySummary.netXp > 0 ? `+${todaySummary.netXp}` : todaySummary.netXp} EP
            </div>
          </div>
        </div>
      )}

      {/* 1-Line Quick-Add Bar */}
      <form
        onSubmit={handleQuickAdd}
        className="flex items-center gap-1.5 bg-neutral-900/80 border border-neutral-800/90 rounded-xl p-1.5"
      >
        <input
          type="text"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Schnell-Habit (+5 EP)..."
          className="flex-1 min-w-0 bg-transparent px-2.5 py-1.5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={cycleQuickDirection}
          title="Richtung wechseln (Positiv / Beides / Negativ)"
          aria-label="Habit-Richtung wechseln"
          className={cn(
            'px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-colors shrink-0 min-h-[34px] whitespace-nowrap',
            quickDirection === 'positive'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : quickDirection === 'both'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
          )}
        >
          {quickDirection === 'positive' ? '+ Pos' : quickDirection === 'both' ? '± Beides' : '- Neg'}
        </button>
        <select
          value={quickSkill}
          onChange={(e) => setQuickSkill(e.target.value as SkillType)}
          aria-label="Skill für Schnell-Habit"
          className={cn(
            'bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-[11px] font-semibold focus:outline-none focus:border-amber-500 shrink-0 min-h-[34px]',
            SKILL_COLORS[quickSkill]
          )}
        >
          {ALL_SKILLS.map((s) => (
            <option key={s} value={s} className="text-white bg-neutral-900">
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!quickTitle.trim()}
          title="Schnell-Habit erstellen"
          aria-label="Schnell-Habit erstellen"
          className="w-9 h-9 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-neutral-950 flex items-center justify-center transition-colors shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </form>

      {/* Segmented Status Tabs */}
      <div className="bg-neutral-900/90 p-1 rounded-xl border border-neutral-800 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => setStatusTab('all')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-all min-w-0 whitespace-nowrap',
            statusTab === 'all'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/40'
          )}
        >
          <Target className="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span className="truncate">Alle</span>
          <span className="text-[11px] font-mono text-neutral-400 tabular-nums shrink-0">
            {tabCounts.all}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusTab('open_today')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-all min-w-0 whitespace-nowrap',
            statusTab === 'open_today'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/40'
          )}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-sky-400" />
          <span className="truncate">Heute offen</span>
          <span className="text-[11px] font-mono text-neutral-400 tabular-nums shrink-0">
            {tabCounts.openToday}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setStatusTab('done_today')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-all min-w-0 whitespace-nowrap',
            statusTab === 'done_today'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/40'
          )}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span className="truncate">Heute aktiv</span>
          <span className="text-[11px] font-mono text-neutral-400 tabular-nums shrink-0">
            {tabCounts.doneToday}
          </span>
        </button>
      </div>

      {/* Compact Search, Layout Toggle & Filter Bar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
            <input
              type="text"
              placeholder="Habit suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900/80 border border-neutral-800/80 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/80 transition-colors min-h-[40px]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Suche leeren"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Layout Toggle: Kompakt-Liste vs Karten */}
          <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-1 flex items-center shrink-0">
            <button
              type="button"
              onClick={() => handleSetViewMode('list')}
              title="Kompakte Listenansicht"
              aria-label="Listenansicht"
              className={cn(
                'p-1.5 rounded-lg transition-colors min-w-[32px] min-h-[30px] flex items-center justify-center',
                viewMode === 'list'
                  ? 'bg-neutral-800 text-amber-400'
                  : 'text-neutral-500 hover:text-neutral-300'
              )}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode('cards')}
              title="Kartenansicht"
              aria-label="Kartenansicht"
              className={cn(
                'p-1.5 rounded-lg transition-colors min-w-[32px] min-h-[30px] flex items-center justify-center',
                viewMode === 'cards'
                  ? 'bg-neutral-800 text-amber-400'
                  : 'text-neutral-500 hover:text-neutral-300'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors shrink-0 min-h-[40px]',
              showFilters || activeFilterCount > 0
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                : 'bg-neutral-900/80 border-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-neutral-950 text-[10px] font-bold flex items-center justify-center tabular-nums">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={cn('w-3 h-3 transition-transform', showFilters && 'rotate-180')} />
          </button>
        </div>

        {/* Collapsible Filter Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-neutral-900/60 border border-neutral-800/80 rounded-xl p-3 space-y-3"
            >
              {/* Skill Filter */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-neutral-400 tracking-wide">
                    Skill
                  </span>
                  {filterSkills.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterSkills([])}
                      className="text-[11px] text-amber-500 hover:text-amber-400 font-semibold"
                    >
                      Alle Skills
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_SKILLS.map((skill) => {
                    const isSelected = filterSkills.includes(skill);
                    return (
                      <button
                        key={skill}
                        type="button"
                        onClick={() =>
                          setFilterSkills((prev) =>
                            prev.includes(skill)
                              ? prev.filter((s) => s !== skill)
                              : [...prev, skill]
                          )
                        }
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border',
                          isSelected
                            ? cn(SKILL_BG_COLORS[skill], SKILL_COLORS[skill], SKILL_BORDER_COLORS[skill])
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800'
                        )}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Direction & Sort */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/60">
                <div>
                  <span className="text-[11px] font-semibold text-neutral-400 tracking-wide block mb-1.5">
                    Richtung
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        { id: 'all', label: 'Alle' },
                        { id: 'positive', label: 'Positiv' },
                        { id: 'both', label: 'Beides' },
                        { id: 'negative', label: 'Negativ' },
                      ] as const
                    ).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDirectionFilter(d.id)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                          directionFilter === d.id
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-neutral-400 tracking-wide block mb-1.5">
                    Sortierung
                  </span>
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as SortOption)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-amber-500"
                  >
                    <option value="default">Standard (Neueste zuerst)</option>
                    <option value="open_first">Heute offen zuerst</option>
                    <option value="streak">Höchste Serie zuerst</option>
                    <option value="most_used">Meiste Aktionen zuerst</option>
                    <option value="xp">Nach EP-Wert (höchste zuerst)</option>
                  </select>
                </div>
              </div>

              {/* Tags */}
              {allTags.length > 0 && (
                <div className="pt-2 border-t border-neutral-800/60">
                  <span className="text-[11px] font-semibold text-neutral-400 tracking-wide block mb-1.5">
                    Tags
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {allTags.map((tag) => {
                      const isSelected = filterTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            setFilterTags((prev) =>
                              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                            )
                          }
                          className={cn(
                            'px-2 py-0.5 rounded-md text-xs font-medium transition-colors border',
                            isSelected
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                          )}
                        >
                          #{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeFilterCount > 0 && (
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                  >
                    Alle Filter zurücksetzen
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Habits Content */}
      {filteredHabits.length === 0 ? (
        <div className="text-center py-12 px-4 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20">
          {habits.length === 0 ? (
            <div className="space-y-3">
              <Sparkles className="w-8 h-8 text-amber-500/50 mx-auto" />
              <p className="text-sm font-medium text-neutral-300">
                Noch keine Gewohnheiten angelegt
              </p>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Erstelle deinen ersten Habit oben über die Schnellleiste oder den Button.
              </p>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition-colors"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Ersten Habit erstellen</span>
              </button>
            </div>
          ) : statusTab === 'open_today' && !searchQuery && activeFilterCount === 0 ? (
            <div className="space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mx-auto" />
              <p className="text-sm font-medium text-neutral-300">
                Alle offenen Habits für heute erledigt!
              </p>
              <button
                type="button"
                onClick={() => setStatusTab('all')}
                className="text-xs text-amber-400 hover:underline font-semibold"
              >
                Alle Habits anzeigen
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-neutral-400">
                {searchQuery
                  ? `Keine Habits gefunden für "${searchQuery}"`
                  : 'Keine Habits für die aktuellen Filter gefunden.'}
              </p>
              {hasActiveSearchOrFilter && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-xs text-amber-400 hover:underline font-semibold"
                >
                  Filter zurücksetzen
                </button>
              )}
            </div>
          )}
        </div>
      ) : viewMode === 'list' ? (
        /* COMPACT LIST VIEW */
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredHabits.map((habit) => {
              const dir = habit.habitDirection || 'positive';
              const showPositive = dir === 'positive' || dir === 'both';
              const showNegative = dir === 'negative' || dir === 'both';
              const today = getHabitTodayStats(habit);
              const streak = getHabitCurrentStreak(habit);
              const last7 = getLast7DaysActivity(habit);
              const isFlashingPos =
                flashAction?.id === habit.id && flashAction.direction === 'positive';
              const isFlashingNeg =
                flashAction?.id === habit.id && flashAction.direction === 'negative';

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  key={habit.id}
                  className={cn(
                    'rounded-xl border p-3 sm:px-4 sm:py-3 transition-all',
                    isFlashingPos
                      ? 'bg-emerald-950/35 border-emerald-500/60'
                      : isFlashingNeg
                      ? 'bg-rose-950/35 border-rose-500/60'
                      : cn('bg-neutral-900/90 hover:bg-neutral-800/70', SKILL_BORDER_COLORS[habit.skill])
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
                    {/* Info & Metadata (Tap opens History) */}
                    <div
                      onClick={() => setHistoryHabitId(habit.id)}
                      className="flex-1 min-w-0 cursor-pointer select-none"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-sm sm:text-base text-white truncate">
                          {habit.title}
                        </h4>

                        {/* Mobile Action Icons on Top Right */}
                        <div
                          className="flex items-center gap-0.5 sm:hidden shrink-0 -mt-1 -mr-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setHistoryHabitId(habit.id)}
                            aria-label="Historie anzeigen"
                            className="p-2 text-neutral-400 hover:text-white rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingHabit(habit)}
                            aria-label="Habit bearbeiten"
                            className="p-2 text-neutral-400 hover:text-white rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedHabitId(habit.id);
                              setIsDeleting(true);
                            }}
                            aria-label="Habit löschen"
                            className="p-2 text-neutral-400 hover:text-rose-400 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Clean Unboxed Metadata Row */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-400 mt-0.5">
                        <span className={cn('font-medium', SKILL_COLORS[habit.skill])}>
                          {habit.skill}
                        </span>
                        <span aria-hidden="true" className="text-neutral-600">
                          ·
                        </span>
                        <span className="font-mono text-amber-400 font-semibold tabular-nums">
                          {dir === 'both'
                            ? `±${habit.xpReward}`
                            : dir === 'negative'
                            ? `-${habit.xpReward}`
                            : `+${habit.xpReward}`}{' '}
                          EP
                        </span>
                        {streak > 0 && (
                          <>
                            <span aria-hidden="true" className="text-neutral-600">
                              ·
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-amber-300 font-medium tabular-nums">
                              <Flame className="w-3 h-3 text-amber-500" />
                              {streak}T {dir === 'negative' ? 'sauber' : 'Serie'}
                            </span>
                          </>
                        )}
                        {habit.tags && habit.tags.length > 0 && (
                          <>
                            <span aria-hidden="true" className="text-neutral-600">
                              ·
                            </span>
                            <span className="text-neutral-500 truncate max-w-[160px]">
                              {habit.tags.map((t) => `#${t}`).join(' ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Bottom/Right Controls: 7-Day Mini Strip + Tap Buttons + Desktop Icons */}
                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-neutral-800/60">
                      {/* 7-Day Activity Dots */}
                      <div
                        className="flex items-center gap-1"
                        title="Letzte 7 Tage"
                        aria-label="Aktivität der letzten 7 Tage"
                      >
                        {last7.map((day) => {
                          const net = day.positiveCount - day.negativeCount;
                          return (
                            <span
                              key={day.date.toISOString()}
                              title={`${day.shortLabel}: +${day.positiveCount} / -${day.negativeCount}`}
                              className={cn(
                                'w-2.5 h-2.5 rounded-sm transition-colors',
                                net > 0
                                  ? 'bg-emerald-500'
                                  : net < 0
                                  ? 'bg-rose-500'
                                  : day.positiveCount > 0 && day.negativeCount > 0
                                  ? 'bg-amber-400'
                                  : 'bg-neutral-800',
                                day.isToday && 'ring-1 ring-amber-400/70'
                              )}
                            />
                          );
                        })}
                      </div>

                      {/* Tactile + / - Log Buttons */}
                      <div className="flex items-center gap-1.5">
                        {showPositive && (
                          <button
                            type="button"
                            onClick={() => handleComplete(habit, false)}
                            aria-label={`${habit.title} positiv protokollieren`}
                            className={cn(
                              'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 min-h-[40px] min-w-[44px] tabular-nums',
                              today.positiveToday > 0
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                                : 'bg-neutral-800/90 border-neutral-700/70 text-neutral-200 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-300'
                            )}
                          >
                            <PlusCircle className="w-4 h-4 shrink-0" />
                            <span>Positiv</span>
                            {today.positiveToday > 0 && (
                              <span className="font-mono text-emerald-200">
                                · {today.positiveToday}
                              </span>
                            )}
                          </button>
                        )}
                        {showNegative && (
                          <button
                            type="button"
                            onClick={() => handleComplete(habit, true)}
                            aria-label={`${habit.title} negativ protokollieren`}
                            className={cn(
                              'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 min-h-[40px] min-w-[44px] tabular-nums',
                              today.negativeToday > 0
                                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                                : 'bg-neutral-800/90 border-neutral-700/70 text-neutral-300 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300'
                            )}
                          >
                            <MinusCircle className="w-4 h-4 shrink-0" />
                            <span>Negativ</span>
                            {today.negativeToday > 0 && (
                              <span className="font-mono text-rose-200">
                                · {today.negativeToday}
                              </span>
                            )}
                          </button>
                        )}
                      </div>

                      {/* Desktop Action Icons (always visible, no hover trap) */}
                      <div className="hidden sm:flex items-center gap-0.5 pl-1 border-l border-neutral-800">
                        <button
                          type="button"
                          onClick={() => setHistoryHabitId(habit.id)}
                          title="Historie"
                          aria-label="Historie anzeigen"
                          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingHabit(habit)}
                          title="Bearbeiten"
                          aria-label="Habit bearbeiten"
                          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedHabitId(habit.id);
                            setIsDeleting(true);
                          }}
                          title="Löschen"
                          aria-label="Habit löschen"
                          className="p-2 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {filteredHabits.map((habit) => {
              const dir = habit.habitDirection || 'positive';
              const showPositive = dir === 'positive' || dir === 'both';
              const showNegative = dir === 'negative' || dir === 'both';
              const today = getHabitTodayStats(habit);
              const totals = getHabitTotals(habit);
              const streak = getHabitCurrentStreak(habit);
              const last7 = getLast7DaysActivity(habit);
              const isFlashingPos =
                flashAction?.id === habit.id && flashAction.direction === 'positive';
              const isFlashingNeg =
                flashAction?.id === habit.id && flashAction.direction === 'negative';

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  key={habit.id}
                  className={cn(
                    'p-4 rounded-2xl border flex flex-col gap-3 transition-all',
                    isFlashingPos
                      ? 'bg-emerald-950/35 border-emerald-500/60'
                      : isFlashingNeg
                      ? 'bg-rose-950/35 border-rose-500/60'
                      : cn('bg-neutral-900/95', SKILL_BORDER_COLORS[habit.skill])
                  )}
                >
                  {/* Card Header with Always-Visible Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setHistoryHabitId(habit.id)}
                    >
                      <h4 className="font-bold text-base sm:text-lg text-white truncate">
                        {habit.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-400 mt-0.5">
                        <span className={cn('font-semibold', SKILL_COLORS[habit.skill])}>
                          {habit.skill}
                        </span>
                        <span aria-hidden="true" className="text-neutral-600">
                          ·
                        </span>
                        <span className="font-mono text-amber-400 font-semibold tabular-nums">
                          {dir === 'both'
                            ? `±${habit.xpReward}`
                            : dir === 'negative'
                            ? `-${habit.xpReward}`
                            : `+${habit.xpReward}`}{' '}
                          EP
                        </span>
                        {streak > 0 && (
                          <>
                            <span aria-hidden="true" className="text-neutral-600">
                              ·
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-amber-300 font-medium tabular-nums">
                              <Flame className="w-3 h-3 text-amber-500" />
                              {streak}T {dir === 'negative' ? 'sauber' : 'Serie'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0 -mt-1 -mr-1">
                      <button
                        type="button"
                        onClick={() => setHistoryHabitId(habit.id)}
                        title="Historie"
                        aria-label="Historie anzeigen"
                        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingHabit(habit)}
                        title="Bearbeiten"
                        aria-label="Habit bearbeiten"
                        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedHabitId(habit.id);
                          setIsDeleting(true);
                        }}
                        title="Löschen"
                        aria-label="Habit löschen"
                        className="p-2 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {habit.description && (
                    <p className="text-xs sm:text-sm text-neutral-400 line-clamp-2">
                      {habit.description}
                    </p>
                  )}

                  {habit.tags && habit.tags.length > 0 && (
                    <div className="text-[11px] text-neutral-500 truncate">
                      {habit.tags.map((tag) => `#${tag}`).join(' · ')}
                    </div>
                  )}

                  {/* 7-Day Mini Consistency Strip */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800/70">
                    <div className="flex items-center gap-1.5">
                      {last7.map((day) => {
                        const net = day.positiveCount - day.negativeCount;
                        return (
                          <div key={day.date.toISOString()} className="flex flex-col items-center gap-1">
                            <span
                              className={cn(
                                'w-3 h-3 rounded-sm transition-colors',
                                net > 0
                                  ? 'bg-emerald-500'
                                  : net < 0
                                  ? 'bg-rose-500'
                                  : day.positiveCount > 0 && day.negativeCount > 0
                                  ? 'bg-amber-400'
                                  : 'bg-neutral-800',
                                day.isToday && 'ring-1 ring-amber-400/70'
                              )}
                            />
                            <span
                              className={cn(
                                'text-[9px] leading-none',
                                day.isToday ? 'text-amber-400 font-bold' : 'text-neutral-500'
                              )}
                            >
                              {day.shortLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <span className="text-[11px] text-neutral-500 tabular-nums">
                      Gesamt: +{totals.totalPositive} / -{totals.totalNegative}
                    </span>
                  </div>

                  {/* Card Footer Action Buttons */}
                  <div className="flex items-center gap-2 mt-auto">
                    {showPositive && (
                      <button
                        type="button"
                        onClick={() => handleComplete(habit, false)}
                        className={cn(
                          'flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border transition-all flex-1 active:scale-95 min-h-[44px] tabular-nums',
                          today.positiveToday > 0
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                            : 'bg-neutral-800 border-neutral-700/70 text-neutral-200 hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:text-emerald-300'
                        )}
                      >
                        <PlusCircle className="w-4 h-4 shrink-0" />
                        <span>Positiv</span>
                        {today.positiveToday > 0 && (
                          <span className="font-mono text-emerald-200">
                            ({today.positiveToday})
                          </span>
                        )}
                      </button>
                    )}
                    {showNegative && (
                      <button
                        type="button"
                        onClick={() => handleComplete(habit, true)}
                        className={cn(
                          'flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold border transition-all flex-1 active:scale-95 min-h-[44px] tabular-nums',
                          today.negativeToday > 0
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                            : 'bg-neutral-800 border-neutral-700/70 text-neutral-300 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-300'
                        )}
                      >
                        <MinusCircle className="w-4 h-4 shrink-0" />
                        <span>Negativ</span>
                        {today.negativeToday > 0 && (
                          <span className="font-mono text-rose-200">
                            ({today.negativeToday})
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {(isAdding || editingHabit) && (
        <QuestModal
          isOpen={isAdding || !!editingHabit}
          onClose={() => {
            setIsAdding(false);
            setEditingHabit(null);
          }}
          onSave={(habitData) => {
            if (editingHabit) {
              updateQuest(editingHabit.id, habitData);
              toast.success('Habit aktualisiert');
            } else {
              addQuest({ ...habitData, type: 'habit' });
              toast.success(`Habit "${habitData.title}" erstellt`);
            }
          }}
          initialQuest={
            editingHabit ||
            ({
              title: '',
              description: '',
              skill: 'Fitness',
              xpReward: 5,
              type: 'habit',
              habitDirection: 'positive',
              subtasks: [],
              tags: [],
            } as Quest)
          }
        />
      )}

      {isDeleting && (
        <DeleteConfirmationModal
          onConfirm={handleDelete}
          onCancel={() => {
            setIsDeleting(false);
            setSelectedHabitId(null);
          }}
        />
      )}

      {historyHabit && (
        <HabitHistoryModal
          habit={historyHabit}
          onClose={() => setHistoryHabitId(null)}
          onRemoveCompletion={(index) => {
            removeHabitCompletion(historyHabit.id, index);
            toast.info('Eintrag aus Historie entfernt');
          }}
          onAddCompletion={(isNegative, customDateMs) => {
            handleComplete(historyHabit, isNegative, customDateMs);
          }}
        />
      )}
    </div>
  );
}
