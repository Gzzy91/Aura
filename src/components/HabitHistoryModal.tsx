import { useState, useMemo, useEffect } from 'react';
import { X, Trash2, History, TrendingUp, PlusCircle, MinusCircle, Check } from 'lucide-react';
import { Quest } from '@/types';
import { cn, SKILL_COLORS, SKILL_BORDER_COLORS } from '@/lib/utils';
import { getHabitCurrentStreak, getHabitTodayStats, getHabitTotals } from '@/lib/habits';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';

interface HabitHistoryModalProps {
  habit: Quest;
  onClose: () => void;
  onRemoveCompletion: (index: number) => void;
  onAddCompletion?: (isNegative: boolean, customDateMs?: number) => void;
}

export function HabitHistoryModal({
  habit,
  onClose,
  onRemoveCompletion,
  onAddCompletion,
}: HabitHistoryModalProps) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'positive' | 'negative'>('all');
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  useEffect(() => {
    if (pendingDeleteIndex === null) return;
    const timer = setTimeout(() => setPendingDeleteIndex(null), 3000);
    return () => clearTimeout(timer);
  }, [pendingDeleteIndex]);

  const completions = habit.completions || [];
  const todayStats = useMemo(() => getHabitTodayStats(habit), [habit]);
  const totals = useMemo(() => getHabitTotals(habit), [habit]);
  const streak = useMemo(() => getHabitCurrentStreak(habit), [habit]);

  const sortedCompletions = useMemo(() => {
    return completions
      .map((c, i) => ({ ...c, originalIndex: i }))
      .filter((c) => {
        if (directionFilter !== 'all' && c.direction !== directionFilter) return false;
        if (selectedDay && !isSameDay(new Date(c.date), selectedDay)) return false;
        return true;
      })
      .sort((a, b) => b.date - a.date);
  }, [completions, directionFilter, selectedDay]);

  const today = startOfDay(new Date());
  const startDate = startOfWeek(subDays(today, 84), { weekStartsOn: 1 });
  const endDate = endOfWeek(today, { weekStartsOn: 1 });
  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: startDate, end: endDate }),
    [startDate.getTime(), endDate.getTime()]
  );

  const getDayCounts = (date: Date) => {
    let pos = 0;
    let neg = 0;
    for (const c of completions) {
      if (isSameDay(new Date(c.date), date)) {
        if (c.direction === 'negative') neg += 1;
        else pos += 1;
      }
    }
    return { pos, neg, score: pos - neg };
  };

  const getColorClass = (score: number, isFuture: boolean) => {
    if (isFuture) return 'bg-neutral-900/30 border border-neutral-800/30';
    if (score === 0) return 'bg-neutral-800/90 hover:bg-neutral-700';
    if (score > 0) {
      if (score === 1) return 'bg-emerald-500/40 hover:bg-emerald-500/55';
      if (score === 2) return 'bg-emerald-500/70 hover:bg-emerald-500/85';
      return 'bg-emerald-500 hover:bg-emerald-400';
    }
    if (score === -1) return 'bg-rose-500/40 hover:bg-rose-500/55';
    if (score === -2) return 'bg-rose-500/70 hover:bg-rose-500/85';
    return 'bg-rose-500 hover:bg-rose-400';
  };

  const selectedDayCounts = selectedDay ? getDayCounts(selectedDay) : null;
  const allowPositive = habit.habitDirection === 'positive' || habit.habitDirection === 'both' || !habit.habitDirection;
  const allowNegative = habit.habitDirection === 'negative' || habit.habitDirection === 'both';

  const handleBackfill = (isNegative: boolean) => {
    if (!onAddCompletion || !selectedDay) return;
    const noon = new Date(selectedDay);
    noon.setHours(12, 0, 0, 0);
    const targetMs = isSameDay(selectedDay, new Date()) ? Date.now() : noon.getTime();
    onAddCompletion(isNegative, targetMs);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 pb-20 sm:pb-6"
      onClick={onClose}
    >
      <div
        className={cn(
          'bg-neutral-900 border rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden',
          SKILL_BORDER_COLORS[habit.skill]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-neutral-400 text-xs font-medium mb-1">
              <History className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Habit-Historie</span>
              <span aria-hidden="true">·</span>
              <span className={cn('font-semibold', SKILL_COLORS[habit.skill])}>{habit.skill}</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white truncate">{habit.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* KPI Summary Strip */}
        <div className="grid grid-cols-4 gap-2 shrink-0">
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-2 text-center">
            <div className="text-[11px] text-neutral-400">Heute</div>
            <div className="text-sm font-bold text-white tabular-nums mt-0.5">
              {allowPositive && allowNegative
                ? `+${todayStats.positiveToday} / -${todayStats.negativeToday}`
                : allowNegative
                ? `-${todayStats.negativeToday}`
                : `${todayStats.positiveToday}×`}
            </div>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-2 text-center">
            <div className="text-[11px] text-neutral-400">
              {habit.habitDirection === 'negative' ? 'Sauber' : 'Serie'}
            </div>
            <div className="text-sm font-bold text-amber-400 tabular-nums mt-0.5">
              {streak} {streak === 1 ? 'Tag' : 'Tage'}
            </div>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-2 text-center">
            <div className="text-[11px] text-neutral-400">Positiv</div>
            <div className="text-sm font-bold text-emerald-400 tabular-nums mt-0.5">
              {totals.totalPositive}
            </div>
          </div>
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-2 text-center">
            <div className="text-[11px] text-neutral-400">Negativ</div>
            <div className="text-sm font-bold text-rose-400 tabular-nums mt-0.5">
              {totals.totalNegative}
            </div>
          </div>
        </div>

        {/* Interactive 12-Week Heatmap */}
        <div className="space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-neutral-300">
              <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
              <span>Aktivität (12 Wochen · Tag antippen)</span>
            </div>
            {selectedDay && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="text-amber-400 hover:text-amber-300 font-semibold"
              >
                Filter aufheben
              </button>
            )}
          </div>
          <div className="bg-neutral-950 p-3 sm:p-3.5 rounded-xl border border-neutral-800 overflow-x-auto scrollbar-hide">
            <div className="flex items-start gap-2 min-w-max">
              <div className="grid grid-rows-7 gap-1.5 text-[9px] text-neutral-500 font-medium leading-none pt-0.5 pr-1 select-none">
                <span className="h-3 flex items-center">Mo</span>
                <span className="h-3 flex items-center opacity-0">Di</span>
                <span className="h-3 flex items-center">Mi</span>
                <span className="h-3 flex items-center opacity-0">Do</span>
                <span className="h-3 flex items-center">Fr</span>
                <span className="h-3 flex items-center opacity-0">Sa</span>
                <span className="h-3 flex items-center">So</span>
              </div>
              <div className="grid grid-rows-7 grid-flow-col gap-1.5">
                {calendarDays.map((day) => {
                  const { score } = getDayCounts(day);
                  const isFuture = day > today;
                  const isTodayCell = isSameDay(day, today);
                  const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      disabled={isFuture}
                      onClick={() =>
                        setSelectedDay((prev) => (prev && isSameDay(prev, day) ? null : day))
                      }
                      className={cn(
                        'w-3 h-3 rounded-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400',
                        getColorClass(score, isFuture),
                        isTodayCell && !isSelected && 'ring-1 ring-amber-400/70',
                        isSelected && 'ring-2 ring-white scale-125',
                        isFuture && 'cursor-default'
                      )}
                      title={`${format(day, 'dd. MMM yyyy', { locale: de })}: ${score > 0 ? '+' : ''}${score}`}
                      aria-label={`${format(day, 'dd. MMM yyyy', { locale: de })}`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between items-center mt-2.5 text-[10px] text-neutral-500 font-medium">
              <span>Weniger</span>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                <div className="w-2.5 h-2.5 rounded-sm bg-rose-500/40" />
                <div className="w-2.5 h-2.5 rounded-sm bg-neutral-800" />
                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40" />
                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              </div>
              <span>Mehr</span>
            </div>
          </div>

          {selectedDay && selectedDayCounts && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs">
              <div className="text-neutral-300">
                <span className="font-semibold text-white">
                  {format(selectedDay, 'dd. MMM yyyy', { locale: de })}
                </span>
                <span className="text-neutral-500 mx-1.5">·</span>
                <span className="tabular-nums text-emerald-400">+{selectedDayCounts.pos}</span>
                <span className="text-neutral-600 mx-1">/</span>
                <span className="tabular-nums text-rose-400">-{selectedDayCounts.neg}</span>
              </div>
              {onAddCompletion && (
                <div className="flex items-center gap-1.5">
                  {allowPositive && (
                    <button
                      type="button"
                      onClick={() => handleBackfill(false)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-semibold transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Nachtragen</span>
                    </button>
                  )}
                  {allowNegative && (
                    <button
                      type="button"
                      onClick={() => handleBackfill(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 font-semibold transition-colors"
                    >
                      <MinusCircle className="w-3.5 h-3.5" />
                      <span>Negativ</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Direction Filter Bar */}
        {completions.length > 0 && allowPositive && allowNegative && (
          <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 shrink-0">
            {[
              { id: 'all' as const, label: 'Alle' },
              { id: 'positive' as const, label: 'Positiv' },
              { id: 'negative' as const, label: 'Negativ' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDirectionFilter(tab.id)}
                className={cn(
                  'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors',
                  directionFilter === tab.id
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-white'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Log Entries List */}
        <div className="bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden flex-1 min-h-0 flex flex-col">
          {sortedCompletions.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">
              {selectedDay
                ? `Keine Einträge am ${format(selectedDay, 'dd. MMM yyyy', { locale: de })}.`
                : 'Noch keine Einträge vorhanden.'}
            </div>
          ) : (
            <div className="divide-y divide-neutral-800/80 overflow-y-auto">
              {sortedCompletions.map((completion) => {
                const isConfirming = pendingDeleteIndex === completion.originalIndex;
                return (
                  <div
                    key={`${completion.date}-${completion.originalIndex}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900/70 transition-colors gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-white font-medium text-sm tabular-nums">
                        {format(new Date(completion.date), 'dd. MMM yyyy, HH:mm', { locale: de })} Uhr
                      </div>
                      <div
                        className={cn(
                          'text-xs font-semibold mt-0.5 tabular-nums',
                          completion.direction === 'positive' ? 'text-emerald-400' : 'text-rose-400'
                        )}
                      >
                        {completion.direction === 'positive'
                          ? `+${habit.xpReward} EP · Positiv`
                          : `-${habit.xpReward} EP · Negativ`}
                      </div>
                    </div>

                    {isConfirming ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingDeleteIndex(null);
                          onRemoveCompletion(completion.originalIndex);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 text-xs font-semibold flex items-center gap-1 shrink-0 min-h-[36px]"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Löschen</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteIndex(completion.originalIndex)}
                        className="p-2 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0"
                        title="Eintrag löschen"
                        aria-label="Eintrag löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full bg-neutral-800 text-white py-3 rounded-xl font-bold hover:bg-neutral-700 transition-colors shrink-0 min-h-[44px]"
        >
          Schließen
        </button>
      </div>
    </div>
  );
}
