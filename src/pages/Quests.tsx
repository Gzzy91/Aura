import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { 
  Check, 
  X, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  History, 
  Target, 
  ListTodo, 
  Calendar, 
  Clock, 
  RotateCcw, 
  Search, 
  Repeat, 
  PlusCircle, 
  MinusCircle, 
  Filter, 
  ChevronDown, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { SkillType, Quest } from '@/types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, SKILL_COLORS, SKILL_BG_COLORS, SKILL_BORDER_COLORS } from '@/lib/utils';
import { QuestDetailsModal } from '@/components/QuestDetailsModal';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';
import { QuestModal } from '@/components/QuestModal';
import { isSameDay, isSameWeek, isSameMonth, isSameYear, isTomorrow } from 'date-fns';
import { toast } from 'sonner';

type TimeFilter = 'all' | 'today' | 'week' | 'month' | 'year';
type SortOption = 'date' | 'xp';

export function Quests() {
  const { 
    quests, 
    addQuest, 
    completeQuest, 
    failQuest, 
    toggleSubtask, 
    deleteQuest, 
    reopenQuest, 
    updateQuest 
  } = useStore();

  const [isAdding, setIsAdding] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [view, setView] = useState<'active' | 'upcoming' | 'history'>('active');
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completingType, setCompletingType] = useState<'success' | 'failed' | null>(null);
  const [expandedSubtasksId, setExpandedSubtasksId] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSkills, setFilterSkills] = useState<SkillType[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('date');
  const [showFilters, setShowFilters] = useState(false);
  const [isTagsDropdownOpen, setIsTagsDropdownOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

  const allTags = Array.from(new Set(quests.filter(q => q.type !== 'habit').flatMap(q => q.tags || []))).sort();

  const isDueTodayOrEarlier = (dueDate: number) => {
    const due = new Date(dueDate);
    const today = new Date(now);
    today.setHours(23, 59, 59, 999);
    return due.getTime() <= today.getTime();
  };

  const formatDueDateCompact = (dueDate: number, hasTime?: boolean) => {
    const due = new Date(dueDate);
    const current = new Date(now);

    if (dueDate < now) {
      return { label: 'Überfällig', style: 'text-rose-400 bg-rose-500/15 border-rose-500/30' };
    }
    if (isSameDay(due, current)) {
      const timeStr = hasTime ? due.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
      return { 
        label: timeStr ? `Heute ${timeStr}` : 'Heute', 
        style: 'text-amber-400 bg-amber-500/15 border-amber-500/30' 
      };
    }
    if (isTomorrow(due)) {
      const timeStr = hasTime ? due.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
      return { 
        label: timeStr ? `Morgen ${timeStr}` : 'Morgen', 
        style: 'text-sky-400 bg-sky-500/15 border-sky-500/30' 
      };
    }
    return { 
      label: due.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }), 
      style: 'text-neutral-400 bg-neutral-800/80 border-neutral-700/60' 
    };
  };

  const filteredQuests = quests.filter(q => {
    if (q.type === 'habit') return false;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      q.title.toLowerCase().includes(searchLower) ||
      q.description.toLowerCase().includes(searchLower) ||
      (q.tags && q.tags.some(t => t.toLowerCase().includes(searchLower)));
    const matchesSkill = filterSkills.length === 0 || filterSkills.includes(q.skill);
    const matchesTags = filterTags.length === 0 || (q.tags && filterTags.every(t => q.tags!.includes(t)));
    
    let matchesTime = true;
    if (timeFilter !== 'all') {
      const dateToCompare = q.completedAt || q.dueDate || q.createdAt;
      if (dateToCompare) {
        const date = new Date(dateToCompare);
        const today = new Date(now);
        if (timeFilter === 'today') matchesTime = isSameDay(date, today);
        else if (timeFilter === 'week') matchesTime = isSameWeek(date, today, { weekStartsOn: 1 });
        else if (timeFilter === 'month') matchesTime = isSameMonth(date, today);
        else if (timeFilter === 'year') matchesTime = isSameYear(date, today);
      }
    }

    return matchesSearch && matchesSkill && matchesTags && matchesTime;
  });

  const sortQuests = (questsToSort: Quest[], viewType: 'active' | 'upcoming' | 'history') => {
    return [...questsToSort].sort((a, b) => {
      if (sortOption === 'xp') {
        const diff = b.xpReward - a.xpReward;
        if (diff !== 0) return diff;
      }
      if (viewType === 'history') {
        return (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt);
      } else {
        const dateA = a.dueDate || Number.MAX_SAFE_INTEGER;
        const dateB = b.dueDate || Number.MAX_SAFE_INTEGER;
        if (dateA !== dateB) return dateA - dateB;
        return b.createdAt - a.createdAt;
      }
    });
  };

  const activeQuests = sortQuests(filteredQuests.filter(q => !q.completed && (!q.dueDate || isDueTodayOrEarlier(q.dueDate))), 'active');
  const upcomingQuests = sortQuests(filteredQuests.filter(q => !q.completed && q.dueDate && !isDueTodayOrEarlier(q.dueDate)), 'upcoming');
  const completedQuests = sortQuests(filteredQuests.filter(q => q.completed), 'history');

  const totalActiveCount = quests.filter(q => q.type !== 'habit' && !q.completed && (!q.dueDate || isDueTodayOrEarlier(q.dueDate))).length;
  const totalUpcomingCount = quests.filter(q => q.type !== 'habit' && !q.completed && q.dueDate && !isDueTodayOrEarlier(q.dueDate)).length;
  const totalHistoryCount = quests.filter(q => q.type !== 'habit' && q.completed).length;

  const activeFilterCount = (filterSkills.length > 0 ? 1 : 0) + 
                            (timeFilter !== 'all' ? 1 : 0) + 
                            (filterTags.length > 0 ? 1 : 0);

  const resetAllFilters = () => {
    setFilterSkills([]);
    setTimeFilter('all');
    setFilterTags([]);
    setSearchQuery('');
  };

  const handleCompleteSuccess = (quest: Quest) => {
    if (completingId) return;
    setCompletingId(quest.id);
    setCompletingType('success');
    setTimeout(() => {
      completeQuest(quest.id, false);
      setCompletingId(null);
      setCompletingType(null);
      if (selectedQuestId === quest.id) setSelectedQuestId(null);
      toast.success(`"${quest.title}" erledigt! +${quest.xpReward} EP`);
    }, 400);
  };

  const handleCompleteFailed = (quest: Quest) => {
    if (completingId) return;
    setCompletingId(quest.id);
    setCompletingType('failed');
    setTimeout(() => {
      failQuest(quest.id);
      setCompletingId(null);
      setCompletingType(null);
      if (selectedQuestId === quest.id) setSelectedQuestId(null);
    }, 400);
  };

  const handleRepeat = (quest: Quest) => {
    const { id, completed, failed, createdAt, completedAt, subtasks, ...rest } = quest;
    const resetSubtasks = subtasks?.map(s => ({ ...s, completed: false, id: crypto.randomUUID() }));
    
    addQuest({
      ...rest,
      subtasks: resetSubtasks,
      dueDate: undefined,
      reminderTiming: 'none'
    });
    
    setView('active');
    toast.success(`"${quest.title}" als neue Quest übernommen`);
  };

  const handleToggleSubtask = (questId: string, subtaskId: string) => {
    toggleSubtask(questId, subtaskId);
    
    const quest = quests.find(q => q.id === questId);
    if (quest && quest.subtasks) {
      const updatedSubtasks = quest.subtasks.map(s => 
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
      );
      if (updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.completed)) {
        handleCompleteSuccess(quest);
      }
    }
  };

  const handleDelete = () => {
    if (selectedQuestId) {
      deleteQuest(selectedQuestId);
      setSelectedQuestId(null);
      setIsDeleting(false);
      toast.info('Quest gelöscht');
    }
  };

  const selectedQuest = quests.find(q => q.id === selectedQuestId);

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-12">
      {/* Top Header */}
      <header className="flex items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Quests</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
              {view === 'active' ? activeQuests.length : view === 'upcoming' ? upcomingQuests.length : completedQuests.length}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-neutral-400 mt-0.5">
            Komprimierte Übersicht deiner täglichen Aufgaben
          </p>
        </div>

        {(view === 'active' || view === 'upcoming') && (
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg shadow-amber-500/10 active:scale-95 transition-all text-xs sm:text-sm shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="font-semibold">Quest erstellen</span>
          </button>
        )}
      </header>

      {/* View Switcher Tabs (Segmented control) */}
      <div className="bg-neutral-900/90 p-1 rounded-xl border border-neutral-800 grid grid-cols-3 gap-1">
        <button
          onClick={() => setView('active')}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-all",
            view === 'active' 
              ? "bg-neutral-800 text-white shadow-sm" 
              : "text-neutral-400 hover:text-white hover:bg-neutral-800/40"
          )}
        >
          <Target className="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span>Aktiv</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-950/60 font-mono text-neutral-300">
            {totalActiveCount}
          </span>
        </button>

        <button
          onClick={() => setView('upcoming')}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-all",
            view === 'upcoming' 
              ? "bg-neutral-800 text-white shadow-sm" 
              : "text-neutral-400 hover:text-white hover:bg-neutral-800/40"
          )}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0 text-sky-400" />
          <span>Bevorstehend</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-950/60 font-mono text-neutral-300">
            {totalUpcomingCount}
          </span>
        </button>

        <button
          onClick={() => setView('history')}
          className={cn(
            "flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs sm:text-sm font-semibold transition-all",
            view === 'history' 
              ? "bg-neutral-800 text-white shadow-sm" 
              : "text-neutral-400 hover:text-white hover:bg-neutral-800/40"
          )}
        >
          <History className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span>Verlauf</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-950/60 font-mono text-neutral-300">
            {totalHistoryCount}
          </span>
        </button>
      </div>

      {/* Compact Search & Filter Control Bar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
            <input
              type="text"
              placeholder="Quest suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900/80 border border-neutral-800/80 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/80 transition-colors"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors shrink-0",
              showFilters || activeFilterCount > 0
                ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                : "bg-neutral-900/80 border-neutral-800/80 text-neutral-300 hover:bg-neutral-800"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-neutral-950 text-[10px] font-bold flex items-center justify-center ml-0.5">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={cn("w-3 h-3 transition-transform ml-0.5", showFilters && "rotate-180")} />
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
              {/* Skill Filter Chips */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Skill</span>
                  {filterSkills.length > 0 && (
                    <button 
                      onClick={() => setFilterSkills([])} 
                      className="text-[10px] text-amber-500 hover:text-amber-400 font-semibold"
                    >
                      Alle Skills
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'] as SkillType[]).map(skill => {
                    const isSelected = filterSkills.includes(skill);
                    return (
                      <button
                        key={skill}
                        onClick={() => {
                          setFilterSkills(prev => 
                            prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
                          );
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border",
                          isSelected
                            ? cn(SKILL_BG_COLORS[skill], SKILL_COLORS[skill], SKILL_BORDER_COLORS[skill])
                            : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800"
                        )}
                      >
                        {skill}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Filter & Sorting */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-neutral-800/60">
                <div>
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1.5">Zeitraum</span>
                  <div className="flex flex-wrap gap-1">
                    {(['all', 'today', 'week', 'month'] as TimeFilter[]).map(tf => (
                      <button
                        key={tf}
                        onClick={() => setTimeFilter(tf)}
                        className={cn(
                          "px-2 py-0.5 rounded-md text-xs font-medium transition-colors border",
                          timeFilter === tf 
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/40" 
                            : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                        )}
                      >
                        {tf === 'all' ? 'Alle' : tf === 'today' ? 'Heute' : tf === 'week' ? 'Woche' : 'Monat'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1.5">Sortierung</span>
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as SortOption)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-neutral-300 focus:outline-none focus:border-amber-500"
                  >
                    <option value="date">Nach Fälligkeitsdatum</option>
                    <option value="xp">Nach EP-Belohnung (höchste zuerst)</option>
                  </select>
                </div>
              </div>

              {/* Tags Filter (if tags exist) */}
              {allTags.length > 0 && (
                <div className="pt-2 border-t border-neutral-800/60">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1.5">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {allTags.map(tag => {
                      const isSelected = filterTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            setFilterTags(prev => 
                              prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                            );
                          }}
                          className={cn(
                            "px-2 py-0.5 rounded-md text-xs font-medium transition-colors border",
                            isSelected 
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/40" 
                              : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                          )}
                        >
                          #{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reset button if active */}
              {activeFilterCount > 0 && (
                <div className="pt-1 flex justify-end">
                  <button
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

      {/* Main Quests List Section */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {/* ACTIVE OR UPCOMING VIEW */}
          {(view === 'active' || view === 'upcoming') && (
            (view === 'active' ? activeQuests : upcomingQuests).length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12 px-4 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20"
              >
                {searchQuery || activeFilterCount > 0 ? (
                  <div className="space-y-2">
                    <p>Keine passenden Quests für die gewählten Filter gefunden.</p>
                    <button
                      onClick={resetAllFilters}
                      className="text-xs text-amber-500 hover:underline font-semibold"
                    >
                      Filter zurücksetzen
                    </button>
                  </div>
                ) : view === 'active' ? (
                  <div className="space-y-3">
                    <Sparkles className="w-8 h-8 text-amber-500/40 mx-auto" />
                    <p className="text-sm font-medium text-neutral-400">Keine aktiven Quests für heute!</p>
                    <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                      Alles erledigt oder Zeit für neue Ziele. Klicke oben auf "Quest erstellen".
                    </p>
                  </div>
                ) : (
                  <p className="text-sm font-medium">Keine bevorstehenden Quests geplant.</p>
                )}
              </motion.div>
            ) : (
              (view === 'active' ? activeQuests : upcomingQuests).map(quest => {
                const isCompleting = completingId === quest.id;
                const isFailedAction = completingType === 'failed' && isCompleting;
                const isSuccessAction = completingType === 'success' && isCompleting;
                const dueInfo = quest.dueDate ? formatDueDateCompact(quest.dueDate, quest.hasTime) : null;
                const completedSubtasksCount = quest.subtasks?.filter(s => s.completed).length || 0;
                const totalSubtasksCount = quest.subtasks?.length || 0;
                const isSubtasksExpanded = expandedSubtasksId === quest.id;

                return (
                  <motion.div
                    layout
                    key={quest.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className={cn(
                      "rounded-xl border transition-all duration-200 overflow-hidden",
                      isSuccessAction 
                        ? "bg-emerald-950/40 border-emerald-500/60 scale-[1.01]" 
                        : isFailedAction
                        ? "bg-rose-950/40 border-rose-500/60 scale-[0.99] opacity-75"
                        : "bg-neutral-900/90 hover:bg-neutral-850 border-neutral-800/90",
                      // Clean subtle left color accent
                      "border-l-[4px]",
                      SKILL_BORDER_COLORS[quest.skill]
                    )}
                  >
                    {/* Compact List Row */}
                    <div 
                      onClick={() => setSelectedQuestId(quest.id)}
                      className="px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3 cursor-pointer select-none"
                    >
                      {/* Left Check-off Action Buttons */}
                      <div 
                        className="flex items-center gap-1.5 shrink-0" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* 1. Erfolgreich abhaken Button */}
                        <button
                          type="button"
                          onClick={() => handleCompleteSuccess(quest)}
                          disabled={isCompleting}
                          title="Erfolgreich durchgeführt (+EP)"
                          aria-label="Quest erfolgreich erledigt"
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 active:scale-90 border",
                            isSuccessAction
                              ? "bg-emerald-500 text-neutral-950 border-emerald-400"
                              : "bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-500 border-emerald-500/20 hover:border-emerald-500/40"
                          )}
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </button>

                        {/* 2. Nicht durchgeführt abhaken Button */}
                        <button
                          type="button"
                          onClick={() => handleCompleteFailed(quest)}
                          disabled={isCompleting}
                          title="Nicht durchgeführt (0 EP)"
                          aria-label="Quest nicht durchgeführt"
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 active:scale-90 border",
                            isFailedAction
                              ? "bg-rose-500 text-white border-rose-400"
                              : "bg-neutral-800/60 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 border-neutral-700/60 hover:border-rose-500/30"
                          )}
                        >
                          <X className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      </div>

                      {/* Main Title & Compact Metadata Info */}
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className={cn(
                            "text-sm sm:text-base font-semibold truncate transition-colors",
                            isSuccessAction ? "text-emerald-400" : isFailedAction ? "text-rose-400 line-through" : "text-neutral-100"
                          )}>
                            {quest.title}
                          </h4>
                          {quest.recurrence && quest.recurrence !== 'none' && (
                            <span title={`Wiederholung: ${quest.recurrence}`} className="shrink-0 flex items-center">
                              <Repeat className="w-3 h-3 text-neutral-500" />
                            </span>
                          )}
                        </div>

                        {/* Single-line compact metadata row */}
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400 overflow-hidden">
                          {/* Skill label */}
                          <span className={cn("font-medium text-[11px] shrink-0", SKILL_COLORS[quest.skill])}>
                            {quest.skill}
                          </span>

                          <span className="text-neutral-600 shrink-0">•</span>

                          {/* XP */}
                          <span className="font-mono text-amber-400 font-semibold text-[11px] shrink-0">
                            +{quest.xpReward} EP
                          </span>

                          {/* Due Date Indicator */}
                          {dueInfo && (
                            <>
                              <span className="text-neutral-600 shrink-0">•</span>
                              <span className={cn("text-[10px] px-1.5 py-0.2 rounded font-medium border shrink-0", dueInfo.style)}>
                                {dueInfo.label}
                              </span>
                            </>
                          )}

                          {/* Subtasks pill if present */}
                          {totalSubtasksCount > 0 && (
                            <>
                              <span className="text-neutral-600 shrink-0">•</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedSubtasksId(isSubtasksExpanded ? null : quest.id);
                                }}
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700/80 transition-colors shrink-0"
                              >
                                <ListTodo className="w-2.5 h-2.5" />
                                <span>{completedSubtasksCount}/{totalSubtasksCount}</span>
                              </button>
                            </>
                          )}

                          {/* First tag preview if available */}
                          {quest.tags && quest.tags.length > 0 && (
                            <span className="hidden md:inline-block text-[10px] text-neutral-500 truncate shrink-0">
                              #{quest.tags[0]}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Detail Indicator */}
                      <div className="flex items-center gap-1 text-neutral-500 group-hover:text-neutral-300 shrink-0">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Expandable Subtasks Inline Section (if tapped) */}
                    <AnimatePresence>
                      {isSubtasksExpanded && quest.subtasks && quest.subtasks.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-4 pb-3 pt-1 border-t border-neutral-800/60 bg-neutral-950/40"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5">
                            <span>Teilaufgaben ({completedSubtasksCount}/{totalSubtasksCount})</span>
                            <span className="font-mono text-amber-500">
                              {Math.round((completedSubtasksCount / totalSubtasksCount) * 100)}%
                            </span>
                          </div>
                          <div className="space-y-1">
                            {quest.subtasks.map(subtask => (
                              <button
                                key={subtask.id}
                                type="button"
                                onClick={() => handleToggleSubtask(quest.id, subtask.id)}
                                className="w-full flex items-center gap-2 p-1.5 rounded-lg text-left text-xs text-neutral-300 hover:bg-neutral-850 transition-colors"
                              >
                                {subtask.completed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <div className="w-3.5 h-3.5 rounded-full border border-neutral-600 shrink-0" />
                                )}
                                <span className={cn(subtask.completed && "line-through text-neutral-500")}>
                                  {subtask.title}
                                </span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )
          )}

          {/* HISTORY VIEW (VERLAUF) */}
          {view === 'history' && (
            completedQuests.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12 px-4 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20"
              >
                {searchQuery || activeFilterCount > 0 ? (
                  <p>Keine passenden Einträge im Verlauf gefunden.</p>
                ) : (
                  <p>Noch keine Quests im Verlauf vorhanden.</p>
                )}
              </motion.div>
            ) : (
              completedQuests.map(quest => {
                const isFailed = quest.failed === true;
                const formattedDate = new Date(quest.completedAt || quest.createdAt).toLocaleDateString('de-DE', {
                  day: 'numeric',
                  month: 'short'
                });

                return (
                  <motion.div
                    layout
                    key={quest.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "rounded-xl border transition-colors flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3 cursor-pointer group",
                      "bg-neutral-900/60 hover:bg-neutral-850/80 border-neutral-800/80",
                      "border-l-[3px]",
                      SKILL_BORDER_COLORS[quest.skill]
                    )}
                    onClick={() => setSelectedQuestId(quest.id)}
                  >
                    {/* Status Icon on the left */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="shrink-0">
                        {isFailed ? (
                          <div 
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-500/15 border border-rose-500/30 text-rose-400"
                            title="Nicht durchgeführt (0 EP)"
                          >
                            <X className="w-4 h-4 stroke-[2.5]" />
                          </div>
                        ) : (
                          <div 
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                            title="Erfolgreich abgeschlossen"
                          >
                            <Check className="w-4 h-4 stroke-[2.5]" />
                          </div>
                        )}
                      </div>

                      {/* Title & Metadata */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className={cn(
                            "text-sm sm:text-base font-medium truncate",
                            isFailed ? "text-neutral-400 line-through" : "text-neutral-300 line-through"
                          )}>
                            {quest.title}
                          </h4>
                        </div>

                        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
                          <span className={cn("text-[11px] font-medium", SKILL_COLORS[quest.skill])}>
                            {quest.skill}
                          </span>
                          <span className="text-neutral-600">•</span>
                          {isFailed ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20">
                              Nicht durchgeführt
                            </span>
                          ) : (
                            <span className="font-mono text-emerald-400 font-semibold text-[11px]">
                              +{quest.xpReward} EP
                            </span>
                          )}
                          <span className="text-neutral-600">•</span>
                          <span className="text-[10px] text-neutral-500">
                            {formattedDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Reopen & Repeat Actions */}
                    <div 
                      className="flex items-center gap-1 shrink-0" 
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          reopenQuest(quest.id);
                          toast.info(`"${quest.title}" wiedereröffnet`);
                        }}
                        title="Quest wiedereröffnen"
                        className="p-1.5 text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRepeat(quest)}
                        title="Quest wiederholen"
                        className="p-1.5 text-neutral-400 hover:text-sky-400 hover:bg-neutral-800 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )
          )}
        </AnimatePresence>
      </div>

      {/* Quest Details Modal (When tapping any quest row) */}
      {selectedQuest && (
        <QuestDetailsModal 
          quest={selectedQuest} 
          onClose={() => setSelectedQuestId(null)} 
          onDeleteRequest={() => setIsDeleting(true)} 
          onEditRequest={() => {
            setEditingQuest(selectedQuest);
            setSelectedQuestId(null);
          }}
          onReopen={reopenQuest}
          onToggleSubtask={handleToggleSubtask}
        />
      )}

      {/* Create / Edit Quest Modal */}
      {(isAdding || editingQuest) && (
        <QuestModal 
          isOpen={isAdding || !!editingQuest} 
          onClose={() => {
            setIsAdding(false);
            setEditingQuest(null);
          }} 
          onSave={(questData) => {
            if (editingQuest) {
              updateQuest(editingQuest.id, questData);
              toast.success('Quest aktualisiert');
            } else {
              addQuest(questData);
              toast.success('Quest erstellt');
            }
          }} 
          initialQuest={editingQuest || undefined}
        />
      )}

      {/* Delete Confirmation Modal */}
      {isDeleting && (
        <DeleteConfirmationModal 
          onConfirm={handleDelete} 
          onCancel={() => setIsDeleting(false)} 
        />
      )}
    </div>
  );
}
