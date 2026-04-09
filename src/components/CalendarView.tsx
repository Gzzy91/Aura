import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Quest } from '@/types';
import { cn, SKILL_COLORS, SKILL_BG_COLORS, SKILL_PROGRESS_COLORS } from '@/lib/utils';

interface CalendarViewProps {
  quests: Quest[];
  onQuestClick: (quest: Quest) => void;
}

export function CalendarView({ quests, onQuestClick }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const days = [];
  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);

  // Adjust startDay for Monday as first day of week (0 = Sunday in JS, we want 0 = Monday)
  const adjustedStartDay = (startDay + 6) % 7;

  for (let i = 0; i < adjustedStartDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= totalDays; i++) {
    days.push(i);
  }

  const getQuestsForDay = (day: number) => {
    return quests.filter(q => {
      if (!q.completed || !q.completedAt) return false;
      const date = new Date(q.completedAt);
      return date.getDate() === day && date.getMonth() === month && date.getFullYear() === year;
    });
  };

  const monthName = currentDate.toLocaleString('de-DE', { month: 'long' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-neutral-900 p-4 rounded-2xl border border-neutral-800">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          {monthName} <span className="text-neutral-500 font-normal">{year}</span>
        </h3>
        <div className="flex gap-2">
          <button onClick={prevMonth} className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={nextMonth} className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400 hover:text-white">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
          <div key={day} className="text-center text-xs font-bold text-neutral-500 uppercase py-2">
            {day}
          </div>
        ))}
        {days.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} className="aspect-square" />;
          
          const questsOnDay = getQuestsForDay(day);
          const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
          
          return (
            <div 
              key={day} 
              className={cn(
                "aspect-square rounded-xl border p-2 flex flex-col items-center justify-between relative group transition-all",
                isToday ? "border-amber-500/50 bg-amber-500/5" : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700",
                questsOnDay.length > 0 && "cursor-pointer"
              )}
            >
              <span className={cn(
                "text-sm font-medium",
                isToday ? "text-amber-500" : "text-neutral-400"
              )}>{day}</span>
              
              {questsOnDay.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center">
                  {questsOnDay.slice(0, 3).map((q, i) => (
                    <div key={q.id} className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]", SKILL_PROGRESS_COLORS[q.skill])} />
                  ))}
                  {questsOnDay.length > 3 && (
                    <span className="text-[8px] text-neutral-500 font-bold">+{questsOnDay.length - 3}</span>
                  )}
                </div>
              )}

              {questsOnDay.length > 0 && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900/90 rounded-xl flex items-center justify-center p-1 z-10">
                  <div className="text-[10px] text-center space-y-1">
                    <p className="font-bold text-white">{questsOnDay.length} Quests</p>
                    <button 
                      onClick={() => onQuestClick(questsOnDay[0])}
                      className="text-amber-500 hover:underline"
                    >
                      Details
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6">
        <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Aktivitäten in diesem Monat
        </h4>
        <div className="space-y-3">
          {quests.filter(q => {
            if (!q.completed || !q.completedAt) return false;
            const date = new Date(q.completedAt);
            return date.getMonth() === month && date.getFullYear() === year;
          }).length === 0 ? (
            <p className="text-neutral-500 text-sm italic">Keine abgeschlossenen Quests in diesem Monat.</p>
          ) : (
            quests
              .filter(q => {
                if (!q.completed || !q.completedAt) return false;
                const date = new Date(q.completedAt);
                return date.getMonth() === month && date.getFullYear() === year;
              })
              .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
              .slice(0, 5)
              .map(q => (
                <div 
                  key={q.id} 
                  onClick={() => onQuestClick(q)}
                  className="flex items-center justify-between p-3 bg-neutral-950 rounded-xl border border-neutral-800 hover:border-neutral-700 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", SKILL_BG_COLORS[q.skill], SKILL_COLORS[q.skill])}>
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white group-hover:text-amber-500 transition-colors">{q.title}</p>
                      <p className="text-xs text-neutral-500">
                        {new Date(q.completedAt!).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} • {q.skill}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-amber-500">+{q.xpReward} EP</span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
