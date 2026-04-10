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
  isSameMonth
} from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Target,
  Plus,
  Timer,
  Download,
  ArrowUp,
  ArrowRight,
  ArrowDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { Quest } from '@/types';
import { QuestDetailsModal } from '@/components/QuestDetailsModal';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';
import { QuestModal } from '@/components/QuestModal';
import { downloadICS } from '@/lib/calendarSync';
import { toast } from 'sonner';

export function Calendar() {
  const { quests, addQuest, completeQuest, toggleSubtask, deleteQuest, reopenQuest, updateQuest } = useStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null);
  const [now, setNow] = useState(Date.now());
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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

  const formatTimeLeft = (quest: Quest) => {
    if (!quest.dueDate) return "";
    const diff = quest.dueDate - now;
    
    if (!quest.hasTime) {
      if (diff < 0) return "Überfällig";
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days === 0) return "Heute fällig";
      if (days === 1) return "Morgen fällig";
      return `In ${days} Tagen`;
    }

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

  const getQuestsForDay = (day: Date) => {
    return quests.filter(q => {
      const completedOnDay = q.completedAt && isSameDay(new Date(q.completedAt), day);
      const dueOnDay = q.dueDate && isSameDay(new Date(q.dueDate), day);
      const createdOnDay = !q.completed && !q.dueDate && isSameDay(new Date(q.createdAt), day);
      return completedOnDay || dueOnDay || createdOnDay;
    });
  };

  const selectedDayQuests = selectedDay ? getQuestsForDay(selectedDay) : [];
  const selectedQuest = quests.find(q => q.id === selectedQuestId);

  const handleDelete = () => {
    if (selectedQuestId) {
      deleteQuest(selectedQuestId);
      setSelectedQuestId(null);
      setIsDeleting(false);
    }
  };

  const handleExportCalendar = () => {
    const activeQuestsWithDates = quests.filter(q => !q.completed && q.dueDate);
    if (activeQuestsWithDates.length === 0) {
      toast.error('Keine aktiven Quests mit Fälligkeitsdatum gefunden.');
      return;
    }
    downloadICS(activeQuestsWithDates);
    toast.success('Kalenderdatei (.ics) wurde heruntergeladen.');
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Kalender</h2>
          <p className="text-neutral-400">Verfolge deine Quest-Historie und Planung</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <button
            onClick={handleExportCalendar}
            className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 rounded-lg text-sm font-medium transition-colors text-neutral-300 hover:text-white"
            title="Kalender exportieren (.ics)"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportieren</span>
          </button>
          <div className="flex flex-1 sm:flex-none items-center justify-between gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800">
            <button 
              onClick={prevMonth}
              className="p-2 hover:bg-neutral-800 rounded-md text-neutral-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-2 sm:px-4 font-bold min-w-[120px] sm:min-w-[140px] text-center text-sm sm:text-base">
              {format(currentMonth, 'MMMM yyyy', { locale: de })}
            </span>
            <button 
              onClick={nextMonth}
              className="p-2 hover:bg-neutral-800 rounded-md text-neutral-400 hover:text-white transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden shadow-xl">
          <div className="grid grid-cols-7 border-b border-neutral-800">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
              <div key={day} className="py-3 text-center text-xs font-bold text-neutral-500 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => {
              const questsOnDay = getQuestsForDay(day);
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isSel = selectedDay && isSameDay(day, selectedDay);
              const isTodayDay = isToday(day);

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "h-24 p-2 border-r border-b border-neutral-800 transition-all relative group text-left flex flex-col gap-1",
                    !isCurrentMonth && "opacity-25",
                    isSel ? "bg-amber-500/5 ring-1 ring-inset ring-amber-500/50" : "hover:bg-neutral-800/50",
                    idx % 7 === 6 && "border-r-0"
                  )}
                >
                  <span className={cn(
                    "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                    isTodayDay ? "bg-amber-500 text-neutral-950 font-bold" : "text-neutral-400",
                    isSel && !isTodayDay && "text-amber-500"
                  )}>
                    {format(day, 'd')}
                  </span>
                  
                  <div className="flex flex-wrap gap-1 overflow-hidden">
                    {questsOnDay.slice(0, 3).map(q => (
                      <div 
                        key={q.id} 
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          q.completed ? "bg-green-500" : (q.dueDate ? "bg-red-500" : "bg-amber-500")
                        )}
                      />
                    ))}
                    {questsOnDay.length > 3 && (
                      <span className="text-[10px] text-neutral-600 font-bold">+{questsOnDay.length - 3}</span>
                    )}
                  </div>

                  {questsOnDay.length > 0 && (
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-400">
                        {questsOnDay.length} Quests
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day Details */}
        <div className="space-y-6">
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-6 shadow-xl sticky top-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">
                  {selectedDay ? format(selectedDay, 'EEEE, d. MMMM', { locale: de }) : 'Wähle einen Tag'}
                </h3>
                <p className="text-sm text-neutral-500">
                  {selectedDayQuests.length} {selectedDayQuests.length === 1 ? 'Quest' : 'Quests'} an diesem Tag
                </p>
              </div>
              <button 
                onClick={() => setIsAdding(true)}
                className="ml-auto p-2 bg-amber-500 text-neutral-950 rounded-lg hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/10"
                title="Quest für diesen Tag hinzufügen"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {selectedDayQuests.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-8 text-neutral-600 border border-dashed border-neutral-800 rounded-xl text-sm"
                  >
                    Keine Quests für diesen Tag gefunden.
                  </motion.div>
                ) : (
                  selectedDayQuests.map(quest => (
                    <motion.div
                      key={quest.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => setSelectedQuestId(quest.id)}
                      className={cn(
                        "p-3 rounded-xl border transition-all cursor-pointer group",
                        quest.completed 
                          ? "bg-green-500/5 border-green-500/20 hover:border-green-500/40" 
                          : "bg-neutral-950 border-neutral-800 hover:border-neutral-700"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {quest.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        ) : (
                          <Target className="w-5 h-5 text-amber-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className={cn(
                            "font-bold text-sm truncate",
                            quest.completed ? "text-neutral-400 line-through" : "text-white"
                          )}>
                            {quest.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[10px] text-neutral-500 mt-0.5">
                            <span className="text-amber-500/70">+{quest.xpReward} EP</span>
                            <span>•</span>
                            <span>{quest.skill}</span>
                            {quest.dueDate && isSameDay(new Date(quest.dueDate), selectedDay!) && (
                              <>
                                <span>•</span>
                                <span className={cn(
                                  "flex items-center gap-1 font-bold",
                                  quest.dueDate - now < 0 ? "text-red-400" : "text-amber-500"
                                )}>
                                  <Timer className="w-2.5 h-2.5" />
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
