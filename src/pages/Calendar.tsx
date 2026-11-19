import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  isSameMonth,
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Target,
  Plus,
  Timer,
  Download,
  X,
  Star,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { Quest } from '@/types';
import { QuestDetailsModal } from '@/components/QuestDetailsModal';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';
import { QuestModal } from '@/components/QuestModal';
import { isQuestOverdueBadge } from '@/lib/questLifecycle';
import { downloadICS } from '@/lib/calendarSync';
import { toast } from 'sonner';

const MOOD_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Schlecht', color: 'text-rose-400' },
  2: { label: 'Geht so', color: 'text-orange-400' },
  3: { label: 'Gut', color: 'text-yellow-400' },
  4: { label: 'Sehr gut', color: 'text-pink-400' },
  5: { label: 'Exzellent', color: 'text-amber-400' },
};

export function Calendar() {
  const {
    quests,
    diaryEntries,
    addQuest,
    completeQuest,
    toggleSubtask,
    deleteQuest,
    reopenQuest,
    updateQuest,
  } = useStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [now, setNow] = useState(Date.now());
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Update every 30s instead of every 1s to avoid re-rendering 42 day cells every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleComplete = (id: string, isNegativeHabit: boolean = false) => {
    if (completingId) return;
    setCompletingId(id);
    setTimeout(() => {
      completeQuest(id, isNegativeHabit);
      setCompletingId(null);
      if (selectedQuestId === id) setSelectedQuestId(null);
    }, 300);
  };

  const handleToggleSubtask = (questId: string, subtaskId: string) => {
    toggleSubtask(questId, subtaskId);

    const quest = quests.find((q) => q.id === questId);
    if (quest && quest.subtasks) {
      const updatedSubtasks = quest.subtasks.map((s) =>
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
      );
      if (updatedSubtasks.length > 0 && updatedSubtasks.every((s) => s.completed)) {
        handleComplete(questId);
      }
    }
  };

  const formatTimeLeft = (quest: Quest) => {
    if (!quest.dueDate) return '';
    const diff = quest.dueDate - now;

    if (!quest.hasTime) {
      if (isQuestOverdueBadge(quest, now)) return 'Überfällig';
      const days = Math.floor((diff) / (1000 * 60 * 60 * 24));
      if (isSameDay(new Date(quest.dueDate), new Date(now))) return 'Heute fällig';
      if (days <= 1) return 'Morgen fällig';
      return `In ${days} Tagen`;
    }

    if (diff <= 0) return 'Überfällig';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}t ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return '< 1m';
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const jumpToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDay(today);
  };

  const getQuestsForDay = (day: Date) => {
    return quests.filter((q) => {
      const completedOnDay = q.completedAt && isSameDay(new Date(q.completedAt), day);
      const dueOnDay = q.dueDate && isSameDay(new Date(q.dueDate), day);
      const createdOnDay = !q.completed && !q.dueDate && isSameDay(new Date(q.createdAt), day);
      return completedOnDay || dueOnDay || createdOnDay;
    });
  };

  const getMoodForDay = (day: Date) => {
    return diaryEntries.find((e) => isSameDay(new Date(e.date), day)) || null;
  };

  const selectedDayQuests = selectedDay ? getQuestsForDay(selectedDay) : [];
  const selectedDayMood = selectedDay ? getMoodForDay(selectedDay) : null;
  const selectedQuest = quests.find((q) => q.id === selectedQuestId);

  const handleDelete = () => {
    if (selectedQuestId) {
      deleteQuest(selectedQuestId);
      setSelectedQuestId(null);
      setIsDeleting(false);
    }
  };

  const handleExportCalendar = () => {
    const activeQuestsWithDates = quests.filter((q) => !q.completed && q.dueDate);
    if (activeQuestsWithDates.length === 0) {
      toast.error('Keine aktiven Quests mit Fälligkeitsdatum gefunden.');
      return;
    }
    downloadICS(activeQuestsWithDates);
    toast.success('Kalenderdatei (.ics) wurde heruntergeladen.');
  };

  const isViewingCurrentMonth = isSameMonth(currentMonth, new Date());

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Kalender</h2>
          <p className="text-xs sm:text-sm text-neutral-400">Verfolge deine Quest-Historie, Planung &amp; Tagesstimmung</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleExportCalendar}
            className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-xl text-sm font-medium transition-colors text-neutral-300 hover:text-white min-h-[42px]"
            title="Kalender exportieren (.ics)"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>

          {(!isViewingCurrentMonth || (selectedDay && !isToday(selectedDay))) && (
            <button
              type="button"
              onClick={jumpToToday}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors min-h-[42px]"
            >
              Heute
            </button>
          )}

          <div className="flex flex-1 min-w-0 sm:flex-none items-center justify-between gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={prevMonth}
              className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-1.5 sm:px-4 font-bold flex-1 sm:flex-none sm:min-w-[150px] text-center text-xs sm:text-base capitalize truncate">
              {format(currentMonth, 'MMMM yyyy', { locale: de })}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
              aria-label="Nächster Monat"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden shadow-xl">
          <div className="grid grid-cols-7 border-b border-neutral-800">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
              <div
                key={day}
                className="py-3 text-center text-xs font-bold text-neutral-500 uppercase tracking-wider"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const questsOnDay = getQuestsForDay(day);
              const moodEntry = getMoodForDay(day);
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isSel = selectedDay && isSameDay(day, selectedDay);
              const isTodayDay = isToday(day);

              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    'h-14 sm:h-24 p-1 sm:p-2 border-r border-b border-neutral-800 transition-colors relative text-left flex flex-col justify-between',
                    !isCurrentMonth && 'opacity-30',
                    isSel
                      ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/60'
                      : 'hover:bg-neutral-800/40',
                    idx % 7 === 6 && 'border-r-0'
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={cn(
                        'text-xs sm:text-sm font-medium w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full tabular-nums',
                        isTodayDay ? 'bg-amber-500 text-neutral-950 font-bold' : 'text-neutral-300',
                        isSel && !isTodayDay && 'text-amber-400 font-bold'
                      )}
                    >
                      {format(day, 'd')}
                    </span>

                    {moodEntry && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-400 tabular-nums"
                        title={`Stimmung: ${moodEntry.mood}/5 Sterne`}
                      >
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="hidden sm:inline">{moodEntry.mood}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1 w-full">
                    <div className="flex flex-wrap gap-1 overflow-hidden">
                      {questsOnDay.slice(0, 3).map((q) => (
                        <div
                          key={q.id}
                          className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            q.completed
                              ? q.failed
                                ? 'bg-rose-400'
                                : 'bg-emerald-400'
                              : q.dueDate
                                ? 'bg-amber-400'
                                : 'bg-neutral-400'
                          )}
                        />
                      ))}
                    </div>
                    {questsOnDay.length > 0 && (
                      <span className="hidden sm:inline-block text-[10px] font-mono bg-neutral-950/80 px-1.5 py-0.5 rounded border border-neutral-800 text-neutral-400 tabular-nums">
                        {questsOnDay.length}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Day Details */}
        <div className="space-y-6">
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-4 sm:p-6 shadow-xl lg:sticky lg:top-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500 shrink-0">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-base sm:text-lg capitalize truncate">
                  {selectedDay
                    ? format(selectedDay, 'EEEE, d. MMMM', { locale: de })
                    : 'Wähle einen Tag'}
                </h3>
                <p className="text-xs text-neutral-400 tabular-nums">
                  {selectedDayQuests.length}{' '}
                  {selectedDayQuests.length === 1 ? 'Quest' : 'Quests'}
                  {selectedDayMood && (
                    <>
                      {' · '}
                      <span className={MOOD_LABELS[selectedDayMood.mood]?.color || 'text-amber-400'}>
                        {selectedDayMood.mood}/5 ★ ({MOOD_LABELS[selectedDayMood.mood]?.label})
                      </span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="p-2.5 bg-amber-500 text-neutral-950 rounded-xl hover:bg-amber-400 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0"
                title="Quest für diesen Tag hinzufügen"
                aria-label="Quest hinzufügen"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <AnimatePresence mode="popLayout">
                {selectedDayQuests.length === 0 ? (
                  <motion.div
                    key="empty-calendar-day"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-8 text-neutral-500 border border-dashed border-neutral-800 rounded-xl text-sm"
                  >
                    Keine Quests für diesen Tag gefunden.
                  </motion.div>
                ) : (
                  selectedDayQuests.map((quest) => (
                    <motion.div
                      key={quest.id}
                      layout
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => setSelectedQuestId(quest.id)}
                      className={cn(
                        'p-3.5 rounded-xl border transition-colors cursor-pointer',
                        quest.completed
                          ? quest.failed
                            ? 'bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40'
                            : 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40'
                          : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {quest.completed ? (
                          quest.failed ? (
                            <X className="w-5 h-5 text-rose-400 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                          )
                        ) : (
                          <Target className="w-5 h-5 text-amber-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4
                            className={cn(
                              'font-bold text-sm truncate',
                              quest.completed ? 'text-neutral-400 line-through' : 'text-white'
                            )}
                          >
                            {quest.title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500 mt-0.5 tabular-nums">
                            {quest.failed ? (
                              <span className="text-rose-400 font-semibold">Nicht durchgeführt</span>
                            ) : (
                              <span className="text-amber-500/80 font-semibold">
                                +{quest.xpReward} EP
                              </span>
                            )}
                            <span>·</span>
                            <span>{quest.skill}</span>
                            {!quest.completed &&
                              quest.dueDate &&
                              selectedDay &&
                              isSameDay(new Date(quest.dueDate), selectedDay) && (
                                <>
                                  <span>·</span>
                                  <span
                                    className={cn(
                                      'flex items-center gap-1 font-bold',
                                      isQuestOverdueBadge(quest, now) ? 'text-rose-400' : 'text-amber-400'
                                    )}
                                  >
                                    <Timer className="w-3 h-3" />
                                    {formatTimeLeft(quest)}
                                  </span>
                                </>
                              )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

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
          initialDate={selectedDay || new Date()}
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
