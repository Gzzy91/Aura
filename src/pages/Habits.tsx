import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Plus, Target, Trash2, Edit2, Search, MinusCircle, PlusCircle, History, CheckCircle2, ArrowUp, ArrowRight, ArrowDown } from 'lucide-react';
import { SkillType, Quest } from '@/types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, SKILL_COLORS, SKILL_BORDER_COLORS } from '@/lib/utils';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';
import { QuestModal } from '@/components/QuestModal';
import { HabitHistoryModal } from '@/components/HabitHistoryModal';
import { isSameDay } from 'date-fns';
import { triggerHabitPositiveConfetti } from '@/lib/confetti';

export function Habits() {
  const { quests, addQuest, completeQuest, deleteQuest, updateQuest, removeHabitCompletion } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Quest | null>(null);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [historyHabit, setHistoryHabit] = useState<Quest | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSkills, setFilterSkills] = useState<SkillType[]>([]);
  const [showTodayPositiveOnly, setShowTodayPositiveOnly] = useState(false);

  const habits = quests.filter(q => q.type === 'habit');

  const filteredHabits = habits.filter(q => {
    if (showTodayPositiveOnly) {
      const hasPositiveToday = q.completions?.some(c => 
        c.direction === 'positive' && isSameDay(new Date(c.date), new Date())
      );
      if (!hasPositiveToday) return false;
    }

    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = q.title.toLowerCase().includes(searchLower) ||
                          q.description.toLowerCase().includes(searchLower) ||
                          (q.tags && q.tags.some(t => t.toLowerCase().includes(searchLower)));
    const matchesSkill = filterSkills.length === 0 || filterSkills.includes(q.skill);
    return matchesSearch && matchesSkill;
  });

  const handleComplete = (id: string, isNegativeHabit: boolean = false) => {
    if (completingId) return;
    setCompletingId(id);
    
    if (!isNegativeHabit) {
      triggerHabitPositiveConfetti();
    }

    setTimeout(() => {
      completeQuest(id, isNegativeHabit);
      setCompletingId(null);
    }, 500);
  };

  const handleDelete = () => {
    if (selectedHabitId) {
      deleteQuest(selectedHabitId);
      setSelectedHabitId(null);
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gewohnheiten</h2>
          <p className="text-neutral-400">Baue gute Gewohnheiten auf und breche schlechte</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
            <button
              onClick={() => setFilterSkills([])}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-colors",
                filterSkills.length === 0 ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
              )}
            >
              Alle
            </button>
            {(Object.keys(SKILL_COLORS) as SkillType[]).map(skill => (
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
                  "px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition-colors",
                  filterSkills.includes(skill) ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
                )}
              >
                {skill}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input 
              type="text" 
              placeholder="Suchen..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="bg-neutral-900 p-1 rounded-lg flex gap-1 border border-neutral-800 w-full sm:w-auto">
            <button
              onClick={() => setShowTodayPositiveOnly(false)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${!showTodayPositiveOnly ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              <Target className="w-4 h-4" />
              Alle
            </button>
            <button
              onClick={() => setShowTodayPositiveOnly(true)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${showTodayPositiveOnly ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Heute Positiv
            </button>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-amber-500 text-neutral-950 px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Neuer Habit</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredHabits.length === 0 && !isAdding && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="col-span-full text-center py-12 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl"
            >
              {searchQuery 
                ? `Keine Habits gefunden für "${searchQuery}"` 
                : "Keine Habits vorhanden. Erstelle deinen ersten Habit!"}
            </motion.div>
          )}
          {filteredHabits.map(habit => {
            const isCompleting = completingId === habit.id;
            return (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                key={habit.id} 
                className={cn(
                  "p-5 rounded-xl border flex flex-col gap-4 group transition-all relative overflow-hidden",
                  isCompleting 
                    ? "bg-neutral-800/50 border-neutral-700 scale-[1.02]" 
                    : cn("bg-neutral-900 border-l-4", SKILL_BORDER_COLORS[habit.skill])
                )}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-bold text-lg text-white mb-1">{habit.title}</h4>
                    {habit.description && (
                      <p className="text-sm text-neutral-400 line-clamp-2 mb-2">{habit.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-sm">
                      {habit.priority && (
                        <>
                          <span className={cn(
                            "flex items-center gap-1 font-bold",
                            habit.priority === 'high' ? "text-red-500" :
                            habit.priority === 'medium' ? "text-amber-500" :
                            "text-blue-500"
                          )}>
                            {habit.priority === 'high' ? <ArrowUp className="w-3 h-3" /> :
                             habit.priority === 'medium' ? <ArrowRight className="w-3 h-3" /> :
                             <ArrowDown className="w-3 h-3" />}
                            {habit.priority === 'high' ? 'Hoch' :
                             habit.priority === 'medium' ? 'Mittel' :
                             'Niedrig'}
                          </span>
                          <span className="text-neutral-500">•</span>
                        </>
                      )}
                      <span className="font-mono text-amber-500">
                        {habit.habitDirection === 'both' ? `±${habit.xpReward}` : habit.habitDirection === 'negative' ? `-${habit.xpReward}` : `+${habit.xpReward}`} EP
                      </span>
                      <span className="text-neutral-500">•</span>
                      <span className={SKILL_COLORS[habit.skill]}>{habit.skill}</span>
                    </div>
                    {habit.tags && habit.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {habit.tags.map(tag => (
                          <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2">
                    <button 
                      onClick={() => setHistoryHabit(habit)}
                      className="p-1.5 bg-neutral-800 text-neutral-400 hover:text-white rounded-md transition-colors"
                      title="Historie"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setEditingHabit(habit)}
                      className="p-1.5 bg-neutral-800 text-neutral-400 hover:text-white rounded-md transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedHabitId(habit.id);
                        setIsDeleting(true);
                      }}
                      className="p-1.5 bg-neutral-800 text-neutral-400 hover:text-red-500 rounded-md transition-colors"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4 mt-auto pt-4 border-t border-neutral-800/50">
                  {(habit.habitDirection === 'positive' || habit.habitDirection === 'both') && (
                    <button 
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all flex-1 justify-center",
                        isCompleting ? "bg-green-500/20 text-green-500" : "bg-neutral-800 text-neutral-300 hover:bg-green-500/20 hover:text-green-500"
                      )}
                      onClick={() => handleComplete(habit.id, false)}
                    >
                      <PlusCircle className="w-5 h-5" />
                      <span>Positiv</span>
                    </button>
                  )}
                  {(habit.habitDirection === 'negative' || habit.habitDirection === 'both') && (
                    <button 
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all flex-1 justify-center",
                        isCompleting ? "bg-red-500/20 text-red-500" : "bg-neutral-800 text-neutral-300 hover:bg-red-500/20 hover:text-red-500"
                      )}
                      onClick={() => handleComplete(habit.id, true)}
                    >
                      <MinusCircle className="w-5 h-5" />
                      <span>Negativ</span>
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

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
            } else {
              addQuest({ ...habitData, type: 'habit' });
            }
          }} 
          initialQuest={editingHabit || {
            title: '',
            description: '',
            skill: 'Fitness',
            xpReward: 5,
            type: 'habit',
            habitDirection: 'positive',
            subtasks: [],
            tags: []
          } as any}
        />
      )}

      {isDeleting && (
        <DeleteConfirmationModal 
          onConfirm={handleDelete} 
          onCancel={() => setIsDeleting(false)} 
        />
      )}

      {historyHabit && (
        <HabitHistoryModal
          habit={historyHabit}
          onClose={() => setHistoryHabit(null)}
          onRemoveCompletion={(index) => {
            removeHabitCompletion(historyHabit.id, index);
            // Update the local state so the modal reflects the change immediately
            setHistoryHabit(prev => {
              if (!prev) return null;
              const newCompletions = [...(prev.completions || [])];
              newCompletions.splice(index, 1);
              return { ...prev, completions: newCompletions };
            });
          }}
        />
      )}
    </div>
  );
}
