import { X, Trash2, History, TrendingUp } from 'lucide-react';
import { Quest } from '@/types';
import { cn, SKILL_BORDER_COLORS } from '@/lib/utils';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';

interface HabitHistoryModalProps {
  habit: Quest;
  onClose: () => void;
  onRemoveCompletion: (index: number) => void;
}

export function HabitHistoryModal({ habit, onClose, onRemoveCompletion }: HabitHistoryModalProps) {
  const completions = habit.completions || [];
  
  // Sort completions by date descending
  const sortedCompletions = [...completions].map((c, i) => ({ ...c, originalIndex: i })).sort((a, b) => b.date - a.date);

  // Heatmap Data Generation
  const today = startOfDay(new Date());
  // Show about 12 weeks (84 days)
  const startDate = startOfWeek(subDays(today, 84), { weekStartsOn: 1 });
  const endDate = endOfWeek(today, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getDayScore = (date: Date) => {
    return completions.reduce((score, c) => {
      if (isSameDay(new Date(c.date), date)) {
        return score + (c.direction === 'positive' ? 1 : -1);
      }
      return score;
    }, 0);
  };

  const getColorClass = (score: number, isFuture: boolean) => {
    if (isFuture) return "bg-neutral-900/30 border border-neutral-800/30";
    if (score === 0) return "bg-neutral-800";
    if (score > 0) {
      if (score === 1) return "bg-green-500/40";
      if (score === 2) return "bg-green-500/70";
      return "bg-green-500";
    }
    if (score < 0) {
      if (score === -1) return "bg-red-500/40";
      if (score === -2) return "bg-red-500/70";
      return "bg-red-500";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={cn("bg-neutral-900 border-y border-r border-l-4 rounded-2xl p-6 max-w-md w-full space-y-6 shadow-2xl border-y-neutral-800 border-r-neutral-800 flex flex-col max-h-[90vh]", SKILL_BORDER_COLORS[habit.skill])} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start shrink-0">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-neutral-400" />
              <h3 className="text-2xl font-bold text-white">Historie</h3>
            </div>
            <p className="text-neutral-400 text-sm mt-1">
              {habit.title}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-2 shrink-0">
          <div className="flex items-center gap-2 text-sm font-bold text-neutral-300 mb-2">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <span>Aktivität (Letzte 12 Wochen)</span>
          </div>
          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 overflow-x-auto scrollbar-hide">
            <div className="grid grid-rows-7 grid-flow-col gap-1.5 min-w-max">
              {calendarDays.map((day, i) => {
                const score = getDayScore(day);
                const isFuture = day > today;
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "w-3 h-3 rounded-sm transition-colors",
                      getColorClass(score, isFuture)
                    )}
                    title={`${format(day, 'dd. MMM yyyy', { locale: de })}: ${score > 0 ? '+' : ''}${score} Aktionen`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between items-center mt-3 text-[10px] text-neutral-500 font-medium">
              <span>Weniger</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-sm bg-red-500" />
                <div className="w-3 h-3 rounded-sm bg-red-500/40" />
                <div className="w-3 h-3 rounded-sm bg-neutral-800" />
                <div className="w-3 h-3 rounded-sm bg-green-500/40" />
                <div className="w-3 h-3 rounded-sm bg-green-500" />
              </div>
              <span>Mehr</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden flex-1 min-h-0 flex flex-col">
          {sortedCompletions.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">
              Noch keine Einträge vorhanden.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800 overflow-y-auto">
              {sortedCompletions.map((completion) => (
                <div key={`${completion.date}-${completion.originalIndex}`} className="flex items-center justify-between p-4 hover:bg-neutral-900 transition-colors">
                  <div>
                    <div className="text-white font-medium text-sm">
                      {format(new Date(completion.date), 'dd. MMMM yyyy, HH:mm', { locale: de })} Uhr
                    </div>
                    <div className={cn(
                      "text-xs font-bold mt-1",
                      completion.direction === 'positive' ? "text-green-500" : "text-red-500"
                    )}>
                      {completion.direction === 'positive' ? `+${habit.xpReward} EP` : `-${habit.xpReward} EP`}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveCompletion(completion.originalIndex)}
                    className="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Eintrag löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={onClose}
          className="w-full bg-neutral-800 text-white py-3 rounded-xl font-bold hover:bg-neutral-700 transition-colors shrink-0"
        >
          Schließen
        </button>
      </div>
    </div>
  );
}
