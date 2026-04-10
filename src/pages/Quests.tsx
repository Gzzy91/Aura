import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { CheckCircle2, Circle, Plus, History, Target, X, ListTodo, Trash2, Calendar, Bell, Clock, RotateCcw, Search, Timer, Repeat, MinusCircle, PlusCircle, ArrowUp, ArrowRight, ArrowDown, Filter, ArrowUpDown } from 'lucide-react';
import { SkillType, Quest, Subtask, ReminderTiming } from '@/types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, SKILL_COLORS, SKILL_BG_COLORS, SKILL_BORDER_COLORS } from '@/lib/utils';
import { QuestDetailsModal } from '@/components/QuestDetailsModal';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';
import { QuestModal } from '@/components/QuestModal';
import { isSameDay, isSameWeek, isSameMonth, isSameYear } from 'date-fns';

type TimeFilter = 'all' | 'today' | 'week' | 'month' | 'year';
type SortOption = 'date' | 'xp';

export function Quests() {
  const { quests, addQuest, completeQuest, toggleSubtask, deleteQuest, reopenQuest, updateQuest } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [view, setView] = useState<'active' | 'upcoming' | 'history'>('active');
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSkills, setFilterSkills] = useState<SkillType[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('date');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimeLeft = (dueDate: number) => {
    const diff = dueDate - now;
    if (diff <= 0) return "Überfällig";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) return `${days}t ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const allTags = Array.from(new Set(quests.filter(q => q.type !== 'habit').flatMap(q => q.tags || []))).sort();

  const filteredQuests = quests.filter(q => {
    if (q.type === 'habit') return false;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = q.title.toLowerCase().includes(searchLower) ||
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

  const isDueTodayOrEarlier = (dueDate: number) => {
    const due = new Date(dueDate);
    const today = new Date(now);
    today.setHours(23, 59, 59, 999);
    return due.getTime() <= today.getTime();
  };

  const sortQuests = (questsToSort: Quest[], viewType: 'active' | 'upcoming' | 'history') => {
    return [...questsToSort].sort((a, b) => {
      if (sortOption === 'xp') {
        const diff = b.xpReward - a.xpReward;
        if (diff !== 0) return diff;
      }
      // Default to date
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

  const handleRepeat = (quest: Quest) => {
    const { id, completed, createdAt, completedAt, subtasks, ...rest } = quest;
    const resetSubtasks = subtasks?.map(s => ({ ...s, completed: false, id: crypto.randomUUID() }));
    
    addQuest({
      ...rest,
      subtasks: resetSubtasks,
      dueDate: undefined, // Reset due date for repeated quests
      reminderTiming: 'none'
    });
    
    setView('active');
  };

  const handleComplete = (id: string, isNegativeHabit: boolean = false) => {
    if (completingId) return;
    setCompletingId(id);
    setTimeout(() => {
      completeQuest(id, isNegativeHabit);
      setCompletingId(null);
      if (selectedQuestId === id) setSelectedQuestId(null);
    }, 500);
  };

  const handleToggleSubtask = (questId: string, subtaskId: string) => {
    toggleSubtask(questId, subtaskId);
    
    const quest = quests.find(q => q.id === questId);
    if (quest && quest.subtasks) {
      const updatedSubtasks = quest.subtasks.map(s => 
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
      );
      if (updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.completed)) {
        handleComplete(questId);
      }
    }
  };

  const handleDelete = () => {
    if (selectedQuestId) {
      deleteQuest(selectedQuestId);
      setSelectedQuestId(null);
      setIsDeleting(false);
    }
  };

  const selectedQuest = quests.find(q => q.id === selectedQuestId);

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Quests</h2>
          <p className="text-neutral-400">Verwalte deine Aufgaben und deinen Verlauf</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
              <button
                onClick={() => setFilterSkills([])}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
                  filterSkills.length === 0 
                    ? "bg-neutral-800 text-white border-neutral-700" 
                    : "bg-transparent text-neutral-400 border-transparent hover:bg-neutral-800/50"
                )}
              >
                Alle
              </button>
              {(['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'] as SkillType[]).map(skill => (
                <button
                  key={skill}
                  onClick={() => {
                    setFilterSkills(prev => 
                      prev.includes(skill) 
                        ? prev.filter(s => s !== skill)
                        : [...prev, skill]
                    );
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
                    filterSkills.includes(skill) 
                      ? cn(SKILL_BG_COLORS[skill], SKILL_COLORS[skill], SKILL_BORDER_COLORS[skill])
                      : "bg-transparent text-neutral-400 border-transparent hover:bg-neutral-800/50"
                  )}
                >
                  {skill}
                </button>
              ))}
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
              <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Zeit:
              </span>
              <button
                onClick={() => setTimeFilter('all')}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                  timeFilter === 'all' ? "bg-amber-500/20 text-amber-500 border-amber-500/30" : "bg-neutral-800/50 text-neutral-400 border-neutral-700 hover:bg-neutral-800"
                )}
              >
                Alle
              </button>
              <button
                onClick={() => setTimeFilter('today')}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                  timeFilter === 'today' ? "bg-amber-500/20 text-amber-500 border-amber-500/30" : "bg-neutral-800/50 text-neutral-400 border-neutral-700 hover:bg-neutral-800"
                )}
              >
                Heute
              </button>
              <button
                onClick={() => setTimeFilter('week')}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                  timeFilter === 'week' ? "bg-amber-500/20 text-amber-500 border-amber-500/30" : "bg-neutral-800/50 text-neutral-400 border-neutral-700 hover:bg-neutral-800"
                )}
              >
                Diese Woche
              </button>
              <button
                onClick={() => setTimeFilter('month')}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                  timeFilter === 'month' ? "bg-amber-500/20 text-amber-500 border-amber-500/30" : "bg-neutral-800/50 text-neutral-400 border-neutral-700 hover:bg-neutral-800"
                )}
              >
                Dieser Monat
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
              <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider mr-1 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" /> Sortierung:
              </span>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-neutral-300 focus:outline-none focus:border-amber-500"
              >
                <option value="date">Nach Datum</option>
                <option value="xp">Nach EP-Belohnung</option>
              </select>
            </div>

            {allTags.length > 0 && (
              <div className="flex items-center gap-2 w-full overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
                <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider mr-1">Tags:</span>
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      setFilterTags(prev => 
                        prev.includes(tag) 
                          ? prev.filter(t => t !== tag)
                          : [...prev, tag]
                      );
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                      filterTags.includes(tag) 
                        ? "bg-amber-500/20 text-amber-500 border-amber-500/30"
                        : "bg-neutral-800/50 text-neutral-400 border-neutral-700 hover:bg-neutral-800"
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Quests suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div className="bg-neutral-900 p-1 rounded-lg grid grid-cols-2 lg:flex gap-1 border border-neutral-800 w-full lg:w-auto">
            <button
              onClick={() => setView('active')}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'active' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              <Target className="w-4 h-4 shrink-0" />
              Aktiv
            </button>
            <button
              onClick={() => setView('upcoming')}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'upcoming' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              <Calendar className="w-4 h-4 shrink-0" />
              Bevorstehend
            </button>
            <button
              onClick={() => setView('history')}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === 'history' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              <History className="w-4 h-4 shrink-0" />
              Verlauf
            </button>
          </div>
          {(view === 'active' || view === 'upcoming') && (
            <button 
              onClick={() => setIsAdding(!isAdding)}
              className="bg-amber-500 text-neutral-950 px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Neue Quest</span>
            </button>
          )}
        </div>
      </header>


      {view === 'active' || view === 'upcoming' ? (
        <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {(view === 'active' ? activeQuests : upcomingQuests).length === 0 && !isAdding && (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-center py-12 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl"
                >
                  {searchQuery 
                    ? `Keine Quests gefunden für "${searchQuery}"` 
                    : view === 'active' ? "Keine aktiven Quests. Zeit, sich Ziele zu setzen!" : "Keine bevorstehenden Quests."}
                </motion.div>
              )}
              {(view === 'active' ? activeQuests : upcomingQuests).map(quest => {
                const isCompleting = completingId === quest.id;
                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 20 }}
                    key={quest.id} 
                    className={cn(
                      "p-4 rounded-xl border flex flex-col gap-3 group transition-all cursor-pointer",
                      isCompleting 
                        ? "bg-green-500/10 border-green-500/50 scale-[1.02]" 
                        : cn("bg-neutral-900 border-l-4", SKILL_BORDER_COLORS[quest.skill])
                    )}
                    onClick={() => setSelectedQuestId(quest.id)}
                  >
                    <div className="flex items-center gap-4">
                      {quest.type === 'habit' ? (
                        <div className="flex flex-col gap-1">
                          {(quest.habitDirection === 'positive' || quest.habitDirection === 'both') && (
                            <button 
                              className={cn(
                                "transition-colors p-1 rounded-full hover:bg-green-500/20",
                                isCompleting ? "text-green-500" : "text-neutral-500 hover:text-green-500"
                              )}
                              onClick={(e) => { e.stopPropagation(); handleComplete(quest.id, false); }}
                              title="Positiv (+EP)"
                            >
                              <PlusCircle className="w-6 h-6" />
                            </button>
                          )}
                          {(quest.habitDirection === 'negative' || quest.habitDirection === 'both') && (
                            <button 
                              className={cn(
                                "transition-colors p-1 rounded-full hover:bg-red-500/20",
                                isCompleting ? "text-red-500" : "text-neutral-500 hover:text-red-500"
                              )}
                              onClick={(e) => { e.stopPropagation(); handleComplete(quest.id, true); }}
                              title="Negativ (-EP)"
                            >
                              <MinusCircle className="w-6 h-6" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <button 
                          className={cn(
                            "transition-colors",
                            isCompleting ? "text-green-500" : "text-neutral-500 group-hover:text-amber-500"
                          )}
                          onClick={(e) => { e.stopPropagation(); handleComplete(quest.id); }}
                        >
                          {isCompleting ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                        </button>
                      )}
                      <div className="flex-1">
                        <h4 className={cn(
                          "font-bold text-lg transition-colors",
                          isCompleting ? "text-green-400" : "text-white"
                        )}>{quest.title}</h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm mt-1">
                          {quest.type === 'habit' ? (
                            <span className={cn(
                              "font-mono transition-colors",
                              isCompleting ? "text-green-500" : "text-amber-500"
                            )}>
                              {quest.habitDirection === 'both' ? `±${quest.xpReward}` : quest.habitDirection === 'negative' ? `-${quest.xpReward}` : `+${quest.xpReward}`} EP
                            </span>
                          ) : (
                            <span className={cn(
                              "font-mono transition-colors",
                              isCompleting ? "text-green-500" : "text-amber-500"
                            )}>+{quest.xpReward} EP</span>
                          )}
                          <span className="text-neutral-500">•</span>
                          <span className={cn(
                            "transition-colors",
                            isCompleting ? "text-green-500/70" : SKILL_COLORS[quest.skill]
                          )}>{quest.skill}</span>
                          {quest.type === 'habit' && (
                            <>
                              <span className="text-neutral-500">•</span>
                              <span className="text-neutral-400 text-xs bg-neutral-800 px-2 py-0.5 rounded-full">Habit</span>
                            </>
                          )}
                        </div>
                        {quest.tags && quest.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {quest.tags.map(tag => (
                              <button 
                                key={tag} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                                }}
                                className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                                  filterTags.includes(tag)
                                    ? "bg-amber-500/20 text-amber-500 border-amber-500/30"
                                    : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-500"
                                )}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}
                        {quest.dueDate && (
                          <div className="flex flex-col gap-1.5 mt-2">
                            <div className={cn(
                              "flex items-center gap-2 text-xs",
                              (quest.dueDate - now < 86400000) ? "text-red-400" : "text-neutral-500"
                            )}>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>Fällig: {new Date(quest.dueDate).toLocaleString('de-DE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              {quest.reminderTiming !== 'none' && (
                                <div className="flex items-center gap-1">
                                  <span className="text-neutral-700">•</span>
                                  <Bell className="w-3 h-3" />
                                  <span>Erinnerung</span>
                                </div>
                              )}
                              {quest.recurrence && quest.recurrence !== 'none' && (
                                <div className="flex items-center gap-1 text-amber-500">
                                  <span className="text-neutral-700">•</span>
                                  <Repeat className="w-3 h-3" />
                                  <span>
                                    {quest.recurrence === 'daily' ? 'Täglich' : 
                                     quest.recurrence === 'weekly' ? 'Wöchentlich' : 
                                     'Monatlich'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className={cn(
                              "flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md w-fit",
                              quest.dueDate - now < 0 
                                ? "bg-red-500/10 text-red-500 border border-red-500/20" 
                                : quest.dueDate - now < 3600000 
                                ? "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                                : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                            )}>
                              <Timer className="w-3 h-3" />
                              <span>{formatTimeLeft(quest.dueDate)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {quest.subtasks && quest.subtasks.length > 0 && (
                      <div className="ml-10 space-y-2" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
                          <span>Fortschritt</span>
                          <span>{Math.round((quest.subtasks.filter(s => s.completed).length / quest.subtasks.length) * 100)}%</span>
                        </div>
                        <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-amber-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${(quest.subtasks.filter(s => s.completed).length / quest.subtasks.length) * 100}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-1 pt-1">
                          {quest.subtasks.map(s => (
                            <div 
                              key={s.id} 
                              onClick={() => handleToggleSubtask(quest.id, s.id)}
                              className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors py-1"
                            >
                              {s.completed ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4" />}
                              <span className={cn(s.completed && "line-through text-neutral-600")}>{s.title}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
      ) : view === 'history' ? (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {completedQuests.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-center py-12 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl"
              >
                {searchQuery 
                  ? `Keine abgeschlossenen Quests gefunden für "${searchQuery}"` 
                  : "Noch keine abgeschlossenen Quests. An die Arbeit, Held!"}
              </motion.div>
            ) : (
              completedQuests.map(quest => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={quest.id} 
                  onClick={() => setSelectedQuestId(quest.id)}
                  className={cn(
                    "bg-neutral-900 p-4 rounded-xl border-l-4 border-y border-r border-y-neutral-800 border-r-neutral-800 flex items-center gap-4 opacity-75 hover:opacity-100 transition-all cursor-pointer",
                    SKILL_BORDER_COLORS[quest.skill]
                  )}
                >
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                  <div className="flex-1">
                    <h4 className="font-bold text-lg line-through text-neutral-400">{quest.title}</h4>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm mt-1">
                      {quest.type === 'habit' ? (
                        <span className="text-neutral-500 font-mono">
                          {quest.habitDirection === 'both' ? `±${quest.xpReward}` : quest.habitDirection === 'negative' ? `-${quest.xpReward}` : `+${quest.xpReward}`} EP
                        </span>
                      ) : (
                        <span className="text-neutral-500 font-mono">+{quest.xpReward} EP</span>
                      )}
                      <span className="text-neutral-600">•</span>
                      <span className={cn(SKILL_COLORS[quest.skill], "opacity-70")}>{quest.skill}</span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-neutral-500">
                        {new Date(quest.completedAt || quest.createdAt).toLocaleDateString('de-DE', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      {quest.type === 'habit' && (
                        <>
                          <span className="text-neutral-600">•</span>
                          <span className="text-neutral-500 text-xs bg-neutral-800/50 px-2 py-0.5 rounded-full">Habit</span>
                        </>
                      )}
                    </div>
                    {quest.tags && quest.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {quest.tags.map(tag => (
                          <button 
                            key={tag} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                            }}
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
                              filterTags.includes(tag)
                                ? "bg-amber-500/20 text-amber-500 border-amber-500/30"
                                : "bg-neutral-800/50 text-neutral-500 border-neutral-800 hover:border-neutral-600"
                            )}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); reopenQuest(quest.id); }}
                        className="p-2 text-neutral-500 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
                        title="Quest wieder eröffnen"
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRepeat(quest); }}
                        className="p-2 text-neutral-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                        title="Quest wiederholen"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {completedQuests.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-center py-12 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl"
              >
                {searchQuery 
                  ? `Keine abgeschlossenen Quests gefunden für "${searchQuery}"` 
                  : "Noch keine Quests abgeschlossen. Bleib dran!"}
              </motion.div>
            ) : (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                <ul className="divide-y divide-neutral-800">
                  {completedQuests.map(quest => (
                    <li 
                      key={quest.id}
                      onClick={() => setSelectedQuestId(quest.id)}
                      className="p-4 hover:bg-neutral-800/50 transition-colors cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start sm:items-center gap-3 overflow-hidden">
                        <CheckCircle2 className={cn("w-5 h-5 shrink-0 mt-0.5 sm:mt-0", SKILL_COLORS[quest.skill])} />
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-neutral-300 line-through truncate">{quest.title}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                            <span className={cn("px-1.5 py-0.5 rounded bg-neutral-950 border border-neutral-800", SKILL_COLORS[quest.skill])}>
                              {quest.skill}
                            </span>
                            <span className="text-neutral-600">•</span>
                            <span className="text-neutral-500">
                              {new Date(quest.completedAt || quest.createdAt).toLocaleDateString('de-DE', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                            <span className="text-neutral-600">•</span>
                            <span className="font-mono text-amber-500">+{quest.xpReward} EP</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-end gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ml-8 sm:ml-0">
                        <button 
                          onClick={(e) => { e.stopPropagation(); reopenQuest(quest.id); }}
                          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-neutral-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
                          title="Quest wieder eröffnen"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span className="sm:hidden">Wiedereröffnen</span>
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleRepeat(quest); }}
                          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-neutral-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all"
                          title="Quest wiederholen"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="sm:hidden">Wiederholen</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

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
            } else {
              addQuest(questData);
            }
          }} 
          initialQuest={editingQuest || undefined}
        />
      )}

      {isDeleting && (
        <DeleteConfirmationModal 
          onConfirm={handleDelete} 
          onCancel={() => setIsDeleting(false)} 
        />
      )}
    </div>
  );
}
