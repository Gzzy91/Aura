import { useStore } from '@/store/useStore';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Shield, Flame, Bell, Clock, Settings, Frown, Meh, Smile, Heart, Star, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, BookOpen, BarChart2, CheckCircle2, Target, ArrowUp, ArrowRight, ArrowDown, User as UserIcon } from 'lucide-react';
import { cn, SKILL_COLORS, SKILL_BG_COLORS, SKILL_BORDER_COLORS, SKILL_PROGRESS_COLORS } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, format, startOfWeek, endOfWeek, addMonths, subMonths, startOfDay, subDays, addWeeks, subWeeks, isSameWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { AnimatePresence, motion } from 'motion/react';
import { DiaryEntry, SkillType, Quest } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { DndContext, closestCenter, closestCorners, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal } from 'lucide-react';

function SortableWidget({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(className, isDragging && "opacity-50", "group")}>
      <div {...attributes} {...listeners} className="absolute top-3 right-3 p-1.5 cursor-grab active:cursor-grabbing z-20 text-neutral-500 hover:text-white bg-neutral-900/80 rounded-md opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity touch-none">
        <GripHorizontal className="w-4 h-4" />
      </div>
      {children}
    </div>
  );
}

const CHART_COLORS: Record<SkillType, string> = {
  Fitness: '#ef4444',
  Fokus: '#3b82f6',
  Disziplin: '#a855f7',
  Wissen: '#10b981',
  Soziales: '#ec4899',
};

const MOOD_ICONS: Record<number, any> = {
  1: { icon: Frown, color: 'text-red-500', bg: 'bg-red-500/10' },
  2: { icon: Meh, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  3: { icon: Smile, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  4: { icon: Heart, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  5: { icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10' },
};

import { AvatarVisual } from '@/components/AvatarVisual';

export function Dashboard({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const { stats, quests, diaryEntries, widgetOrder, updateWidgetOrder } = useStore();
  
  // Ensure all widgets are present in widgetOrder (for backwards compatibility with persisted state)
  useEffect(() => {
    const allWidgets = ['avatar', 'level', 'streak', 'chart', 'calendar', 'completed', 'today', 'reminders', 'settings'];
    const missingWidgets = allWidgets.filter(w => !widgetOrder.includes(w));
    if (missingWidgets.length > 0) {
      updateWidgetOrder([...widgetOrder, ...missingWidgets]);
    }
  }, [widgetOrder, updateWidgetOrder]);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [viewDate, setViewDate] = useState(new Date());
  const [chartDate, setChartDate] = useState(new Date());
  const [selectedEntry, setSelectedEntry] = useState<DiaryEntry | null>(null);

  // Calculate streak dynamically
  const activeDates = new Set<number>();
  quests.forEach(q => {
    if (q.completed && q.completedAt) {
      activeDates.add(startOfDay(new Date(q.completedAt)).getTime());
    }
    if (q.completions) {
      q.completions.forEach(c => {
        activeDates.add(startOfDay(new Date(c.date)).getTime());
      });
    }
  });
  diaryEntries.forEach(e => {
    if (e.date) {
      activeDates.add(startOfDay(new Date(e.date)).getTime());
    }
  });

  const sortedDates = Array.from(activeDates).sort((a, b) => b - a);
  let currentStreak = 0;

  if (sortedDates.length > 0) {
    const today = startOfDay(new Date());
    const yesterday = subDays(today, 1);
    let currentDate = today;

    if (sortedDates[0] === today.getTime()) {
      currentDate = today;
    } else if (sortedDates[0] === yesterday.getTime()) {
      currentDate = yesterday;
    } else {
      currentDate = new Date(0); // Reset to epoch if not active today or yesterday
    }

    if (currentDate.getTime() !== 0) {
      for (const date of sortedDates) {
        if (date === currentDate.getTime()) {
          currentStreak++;
          currentDate = subDays(currentDate, 1);
        } else if (date < currentDate.getTime()) {
          break;
        }
      }
    }
  }

  // Calendar logic
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  
  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      toast.error('Dein Browser unterstützt keine Desktop-Benachrichtigungen.');
      return;
    }

    if (Notification.permission === 'denied') {
      toast.error(
        'Benachrichtigungen sind blockiert. Klicke auf das Schloss-Symbol in der Adressleiste deines Browsers, wähle "Benachrichtigungen" und setze sie auf "Zulassen". Lade die Seite danach neu.',
        { duration: 6000 }
      );
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      toast.success('Benachrichtigungen aktiviert!');
    } else if (result === 'denied') {
      toast.error(
        'Benachrichtigungen wurden blockiert. Klicke auf das Schloss-Symbol in der Adressleiste deines Browsers, wähle "Benachrichtigungen" und setze sie auf "Zulassen". Lade die Seite danach neu.',
        { duration: 6000 }
      );
    }
  };

  const progress = (stats.xp / stats.xpToNextLevel) * 100;

  const upcomingReminders = quests
    .filter(q => !q.completed && q.dueDate)
    .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0))
    .slice(0, 3);

  const todayCompletedQuests = useMemo(() => {
    const today = new Date();
    const completed: Quest[] = [];
    
    quests.forEach(q => {
      if (q.completed && q.completedAt && isSameDay(new Date(q.completedAt), today)) {
        completed.push(q);
      }
      if (q.completions) {
        q.completions.forEach((c, index) => {
          if (isSameDay(new Date(c.date), today)) {
            completed.push({
              ...q,
              id: `${q.id}-completion-${index}`,
              habitDirection: c.direction,
              completedAt: c.date,
              completed: true
            });
          }
        });
      }
    });
    
    return completed;
  }, [quests]);

  const groupedCompletedQuests = useMemo(() => {
    return todayCompletedQuests.reduce((acc, quest) => {
      if (!acc[quest.skill]) acc[quest.skill] = [];
      acc[quest.skill].push(quest);
      return acc;
    }, {} as Record<SkillType, Quest[]>);
  }, [todayCompletedQuests]);

  const nextMonth = () => setViewDate(addMonths(viewDate, 1));
  const prevMonth = () => setViewDate(subMonths(viewDate, 1));

  const nextWeek = () => setChartDate(addWeeks(chartDate, 1));
  const prevWeek = () => setChartDate(subWeeks(chartDate, 1));

  // Calculate weekly XP data
  const weeklyXpData = useMemo(() => {
    const start = startOfWeek(chartDate, { weekStartsOn: 1 });
    const end = endOfWeek(chartDate, { weekStartsOn: 1 });
    
    const days = eachDayOfInterval({ start, end });
    
    return days.map(day => {
      const dayData: any = {
        name: format(day, 'EEEEEE', { locale: de }),
        fullDate: format(day, 'dd.MM.yyyy'),
        Fitness: 0,
        Fokus: 0,
        Disziplin: 0,
        Wissen: 0,
        Soziales: 0,
      };

      quests.forEach(q => {
        if (q.completed && q.completedAt && isSameDay(new Date(q.completedAt), day)) {
          if (q.type === 'habit' && q.habitDirection === 'negative') {
            dayData[q.skill] -= q.xpReward;
          } else {
            dayData[q.skill] += q.xpReward;
          }
        }
        if (q.completions) {
          q.completions.forEach(c => {
            if (isSameDay(new Date(c.date), day)) {
              if (c.direction === 'negative') {
                dayData[q.skill] -= q.xpReward;
              } else {
                dayData[q.skill] += q.xpReward;
              }
            }
          });
        }
      });

      return dayData;
    });
  }, [quests, chartDate]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + entry.value, 0);
      return (
        <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl shadow-xl">
          <p className="font-bold text-white mb-2">{payload[0].payload.fullDate}</p>
          {payload.map((entry: any, index: number) => (
            entry.value !== 0 && (
              <div key={index} className="flex items-center justify-between gap-4 text-sm mb-1">
                <span style={{ color: entry.color }}>{entry.name}</span>
                <span className={cn("font-mono font-bold", entry.value > 0 ? "text-white" : "text-red-500")}>{entry.value} EP</span>
              </div>
            )
          ))}
          {total !== 0 && (
            <div className="mt-2 pt-2 border-t border-neutral-800 flex justify-between gap-4 text-sm font-bold">
              <span className="text-neutral-400">Gesamt</span>
              <span className={cn("font-mono", total > 0 ? "text-amber-500" : "text-red-500")}>{total} EP</span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = widgetOrder.indexOf(active.id as string);
      const newIndex = widgetOrder.indexOf(over.id as string);
      updateWidgetOrder(arrayMove(widgetOrder, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Charakterstatus</h2>
          <p className="text-neutral-400">Dein aktueller Fortschritt</p>
        </div>
        {permission !== 'granted' && (
          <button 
            onClick={requestPermission}
            className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-amber-500 hover:border-amber-500/50 transition-all"
          >
            <Bell className="w-4 h-4" />
            Benachrichtigungen aktivieren
          </button>
        )}
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={widgetOrder.filter(id => id !== 'skills')} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {widgetOrder.filter(id => id !== 'skills').map(id => {
              switch (id) {
                case 'avatar':
                  return (
                    <SortableWidget key="avatar" id="avatar" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 flex flex-col items-center justify-center text-center h-full relative group/avatar">
                        <AvatarVisual level={stats.level} size="md" className="mb-4" />
                        <div className="mt-2">
                          <div className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1">Dein Held</div>
                          <div className="text-lg font-black text-white">Level {stats.level}</div>
                        </div>
                        <button 
                          onClick={() => setActiveTab('avatar')}
                          className="absolute inset-0 bg-amber-500/0 hover:bg-amber-500/5 transition-colors rounded-2xl flex items-center justify-center group"
                        >
                          <div className="bg-amber-500 text-neutral-950 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                            <Settings className="w-5 h-5" />
                          </div>
                        </button>
                      </div>
                    </SortableWidget>
                  );
                case 'level':
                  return (
                    <SortableWidget key="level" id="level" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 flex flex-col items-center justify-center text-center relative overflow-hidden h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                          <Shield className="w-32 h-32" />
                        </div>
                        <div className="relative z-10 w-full">
                          <div className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-2">Aktuelles Level</div>
                          <div className="text-7xl font-black mb-4">{stats.level}</div>
                          <div className="w-full max-w-md mx-auto space-y-2">
                            <div className="flex justify-between text-sm text-neutral-400 font-mono">
                              <span>{stats.xp} EP</span>
                              <span>{stats.xpToNextLevel} EP</span>
                            </div>
                            <ProgressBar progress={progress} colorClass="bg-amber-500" className="h-3" />
                          </div>
                        </div>
                      </div>
                    </SortableWidget>
                  );
                case 'streak':
                  return (
                    <SortableWidget key="streak" id="streak" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 flex flex-col items-center justify-center text-center h-full">
                        <Flame className="w-12 h-12 text-orange-500 mb-4" />
                        <div className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1">Tägliche Serie</div>
                        <div className="text-4xl font-black text-orange-500">{currentStreak}</div>
                        <div className="text-sm text-neutral-500 mt-2">Tage aktiv</div>
                      </div>
                    </SortableWidget>
                  );
                case 'chart':
                  return (
                    <SortableWidget key="chart" id="chart" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-bold flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-amber-500" />
                            Wöchentliche XP Übersicht
                          </h3>
                          <div className="text-sm font-bold text-neutral-400 uppercase tracking-widest text-center">
                            {format(startOfWeek(chartDate, { weekStartsOn: 1 }), 'dd.MM.')} - {format(endOfWeek(chartDate, { weekStartsOn: 1 }), 'dd.MM.yyyy')}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 h-[300px] w-full -ml-2">
                          <button 
                            onClick={prevWeek}
                            className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors z-10"
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </button>
                          <div className="flex-1 h-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyXpData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                              <XAxis 
                                dataKey="name" 
                                stroke="#737373" 
                                fontSize={12} 
                                tickLine={false} 
                                axisLine={false} 
                                interval={0}
                              />
                              <YAxis 
                                stroke="#737373" 
                                fontSize={12} 
                                tickLine={false} 
                                axisLine={false} 
                                tickFormatter={(value) => `${value}`}
                                domain={[0, 100]}
                              />
                              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#262626', opacity: 0.4 }} />
                              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                              <Bar dataKey="Fitness" stackId="a" fill={CHART_COLORS.Fitness} radius={[0, 0, 4, 4]} />
                              <Bar dataKey="Fokus" stackId="a" fill={CHART_COLORS.Fokus} />
                              <Bar dataKey="Disziplin" stackId="a" fill={CHART_COLORS.Disziplin} />
                              <Bar dataKey="Wissen" stackId="a" fill={CHART_COLORS.Wissen} />
                              <Bar dataKey="Soziales" stackId="a" fill={CHART_COLORS.Soziales} radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                          </div>
                          <button 
                            onClick={nextWeek}
                            className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors z-10"
                          >
                            <ChevronRight className="w-6 h-6" />
                          </button>
                        </div>
                      </div>
                    </SortableWidget>
                  );
                case 'calendar':
                  return (
                    <SortableWidget key="calendar" id="calendar" className="col-span-1 md:col-span-2 lg:col-span-2">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-bold flex items-center gap-2">
                            <CalendarIcon className="w-5 h-5 text-amber-500" />
                            Stimmungs-Kalender
                          </h3>
                          <div className="text-sm font-bold text-neutral-400 uppercase tracking-widest text-center">
                            {format(viewDate, 'MMMM yyyy', { locale: de })}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 -ml-2">
                          <button 
                            onClick={prevMonth}
                            className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors z-10"
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="grid grid-cols-7 gap-2">
                          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                            <div key={day} className="text-center text-[10px] font-bold text-neutral-500 uppercase tracking-tighter pb-2">
                              {day}
                            </div>
                          ))}
                          {calendarDays.map((day, i) => {
                            const entry = diaryEntries.find(e => isSameDay(new Date(e.date), day));
                            const isCurrentMonth = day.getMonth() === viewDate.getMonth();
                            const isToday = isSameDay(day, new Date());
                            const isCurrentWeek = isSameWeek(day, new Date(), { weekStartsOn: 1 });
                            const mood = entry ? MOOD_ICONS[entry.mood] : null;
                            const MoodIcon = mood?.icon;

                            return (
                              <button 
                                key={i} 
                                disabled={!entry}
                                onClick={() => entry && setSelectedEntry(entry)}
                                className={cn(
                                  "aspect-square rounded-lg border flex flex-col items-center justify-center relative transition-all",
                                  isCurrentMonth ? "bg-neutral-950/50 border-neutral-800" : "bg-transparent border-transparent opacity-20",
                                  isCurrentWeek && !isToday && "bg-neutral-800/40 border-neutral-700",
                                  isToday && "border-amber-500/50 ring-1 ring-amber-500/20 bg-amber-500/5",
                                  entry ? "hover:border-amber-500/30 cursor-pointer" : "cursor-default"
                                )}
                              >
                                <span className={cn(
                                  "text-[10px] absolute top-1 left-1 font-mono",
                                  isToday ? "text-amber-500 font-bold" : "text-neutral-600"
                                )}>
                                  {format(day, 'd')}
                                </span>
                                {MoodIcon && (
                                  <div className={cn("p-1.5 rounded-full", mood.bg)}>
                                    <MoodIcon className={cn("w-4 h-4", mood.color)} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                            </div>
                          </div>
                          <button 
                            onClick={nextMonth}
                            className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors z-10"
                          >
                            <ChevronRight className="w-6 h-6" />
                          </button>
                        </div>
                        
                        <div className="mt-6 flex flex-wrap gap-4 justify-center border-t border-neutral-800 pt-4">
                          {Object.entries(MOOD_ICONS).map(([val, info]) => {
                            const Icon = info.icon;
                            return (
                              <div key={val} className="flex items-center gap-1.5">
                                <Icon className={cn("w-3.5 h-3.5", info.color)} />
                                <span className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
                                  {val === '1' ? 'Schlecht' : val === '2' ? 'Geht so' : val === '3' ? 'Gut' : val === '4' ? 'Sehr gut' : 'Exzellent'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </SortableWidget>
                  );
                case 'today':
                  return (
                    <SortableWidget key="today" id="today" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                          Heute erledigt
                        </h3>
                        {Object.keys(groupedCompletedQuests).length === 0 ? (
                          <p className="text-sm text-neutral-500 italic">Noch keine Quests heute abgeschlossen.</p>
                        ) : (
                          <div className="space-y-4">
                            {(Object.entries(groupedCompletedQuests) as [SkillType, Quest[]][]).map(([skill, skillQuests]) => (
                              <div key={skill} className="space-y-2">
                                <div className={cn("text-xs font-bold uppercase tracking-wider", SKILL_COLORS[skill])}>
                                  {skill}
                                </div>
                                <div className="space-y-2">
                                  {skillQuests.map(quest => (
                                    <div key={quest.id} className={cn("flex items-center gap-3 bg-neutral-950 p-3 rounded-xl border-l-4 border-y border-r border-y-neutral-800 border-r-neutral-800", SKILL_BORDER_COLORS[skill])}>
                                      <CheckCircle2 className={cn("w-4 h-4", SKILL_COLORS[skill])} />
                                      <div className="flex flex-col">
                                        <span className="text-sm text-neutral-300 font-medium flex items-center gap-2">
                                          {quest.title}
                                        </span>
                                      </div>
                                      <span className="ml-auto text-xs font-mono text-neutral-500">
                                        {quest.type === 'habit' && quest.habitDirection === 'negative' ? `-${quest.xpReward}` : `+${quest.xpReward}`} EP
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </SortableWidget>
                  );
                case 'reminders':
                  return upcomingReminders.length > 0 ? (
                    <SortableWidget key="reminders" id="reminders" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                          <Bell className="w-5 h-5 text-amber-500" />
                          Anstehende Erinnerungen
                        </h3>
                        <div className="space-y-3">
                          {upcomingReminders.map(quest => {
                            const isDueSoon = (quest.dueDate || 0) - Date.now() < 86400000;
                            return (
                              <div key={quest.id} className={cn("bg-neutral-950 p-4 rounded-xl border-l-4 border-y border-r border-y-neutral-800 border-r-neutral-800 flex items-center justify-between", SKILL_BORDER_COLORS[quest.skill])}>
                                <div>
                                  <div className="font-bold text-white flex items-center gap-2">
                                    {quest.title}
                                  </div>
                                  <div className={cn(
                                    "text-xs flex items-center gap-1 mt-1",
                                    isDueSoon ? "text-red-400" : "text-neutral-500"
                                  )}>
                                    <Clock className="w-3 h-3" />
                                    <span>Fällig: {new Date(quest.dueDate!).toLocaleString('de-DE', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      ...(quest.hasTime ? { hour: '2-digit', minute: '2-digit' } : {}) 
                                    })}</span>
                                  </div>
                                </div>
                                <div className={cn("text-xs font-mono px-2 py-1 rounded", SKILL_COLORS[quest.skill], SKILL_BG_COLORS[quest.skill])}>
                                  {quest.skill}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </SortableWidget>
                  ) : null;
                case 'settings':
                  return (
                    <SortableWidget key="settings" id="settings" className="col-span-1">
                      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 h-full">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                          <Settings className="w-5 h-5 text-neutral-400" />
                          Benachrichtigungen
                        </h3>
                        <div className="flex flex-col gap-4">
                          <div className="space-y-1">
                            <div className="text-sm font-medium">Desktop-Benachrichtigungen</div>
                            <div className="text-xs text-neutral-500">
                              {permission === 'granted' 
                                ? 'Aktiviert - Du erhältst Push-Nachrichten.' 
                                : permission === 'denied' 
                                ? 'Blockiert - Bitte in den Browser-Einstellungen ändern.' 
                                : 'Nicht konfiguriert - In-App-Hinweise sind aktiv.'}
                            </div>
                          </div>
                          {permission !== 'granted' ? (
                            <button 
                              onClick={requestPermission}
                              className="bg-amber-500 text-neutral-950 px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-400 transition-colors w-full"
                            >
                              {permission === 'denied' ? 'Aktivieren' : 'Erlauben'}
                            </button>
                          ) : (
                            <button 
                              onClick={() => {
                                toast('Test-Benachrichtigung', {
                                  description: 'So sehen deine Erinnerungen aus!',
                                  icon: <Bell className="w-4 h-4 text-amber-500" />,
                                });
                                if ('Notification' in window && Notification.permission === 'granted') {
                                  new Notification('Test-Benachrichtigung', {
                                    body: 'So sehen deine Erinnerungen aus!',
                                    icon: '/favicon.ico'
                                  });
                                }
                              }}
                              className="bg-neutral-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-neutral-700 transition-colors w-full flex items-center justify-center gap-2"
                            >
                              <Bell className="w-4 h-4" />
                              Testen
                            </button>
                          )}
                        </div>
                      </div>
                    </SortableWidget>
                  );
                default:
                  return null;
              }
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Entry Detail Modal */}
      <AnimatePresence>
        {selectedEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEntry(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-xl", MOOD_ICONS[selectedEntry.mood].bg)}>
                    {(() => {
                      const Icon = MOOD_ICONS[selectedEntry.mood].icon;
                      return <Icon className={cn("w-6 h-6", MOOD_ICONS[selectedEntry.mood].color)} />;
                    })()}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Tagebucheintrag</h3>
                    <p className="text-xs text-neutral-500">{format(selectedEntry.date, 'dd. MMMM yyyy', { locale: de })}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedEntry(null)}
                  className="p-2 hover:bg-neutral-800 rounded-xl text-neutral-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {selectedEntry.notes && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
                      <BookOpen className="w-3 h-3 text-amber-500" />
                      Wohlbefinden
                    </div>
                    <p className="text-neutral-200 leading-relaxed whitespace-pre-wrap text-sm">{selectedEntry.notes}</p>
                  </div>
                )}
                
                {selectedEntry.progress && (
                  <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                    <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Star className="w-3 h-3 text-amber-500" />
                      Fortschritt
                    </div>
                    <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap italic text-sm">{selectedEntry.progress}</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-neutral-800 bg-neutral-900/50">
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-colors"
                >
                  Schließen
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

