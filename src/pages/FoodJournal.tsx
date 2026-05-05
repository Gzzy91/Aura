import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { Utensils, Plus, Trash2, Calendar as CalendarIcon, ChevronRight, ChevronDown, Edit2, Info, Beef, Wheat, Droplets, PieChart as PieChartIcon } from 'lucide-react';
import { format, isSameDay, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FoodEntry } from '@/types';

const MEAL_TYPES = ['Frühstück', 'Mittagessen', 'Abendessen', 'Snack'] as const;

export function FoodJournal() {
  const { foodEntries, addFoodEntry, updateFoodEntry, deleteFoodEntry } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [type, setType] = useState<typeof MEAL_TYPES[number]>('Frühstück');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [expandedDays, setExpandedDays] = useState<string[]>([format(new Date(), 'yyyy-MM-dd')]);

  const toggleDay = (day: string) => {
    setExpandedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const resetForm = () => {
    setName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setType('Frühstück');
    setEditingId(null);
    setIsAdding(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !calories) {
      toast.error('Bitte Name und Kalorien angeben');
      return;
    }

    const entryData = {
      name,
      calories: parseInt(calories),
      protein: protein ? parseFloat(protein) : undefined,
      carbs: carbs ? parseFloat(carbs) : undefined,
      fat: fat ? parseFloat(fat) : undefined,
      type,
      date: new Date(date).getTime(),
    };

    if (editingId) {
      updateFoodEntry(editingId, entryData);
      toast.success('Eintrag aktualisiert');
    } else {
      addFoodEntry(entryData);
      toast.success('Eintrag hinzugefügt');
    }

    resetForm();
  };

  const handleEdit = (entry: FoodEntry) => {
    setEditingId(entry.id);
    setName(entry.name);
    setCalories(entry.calories.toString());
    setProtein(entry.protein?.toString() || '');
    setCarbs(entry.carbs?.toString() || '');
    setFat(entry.fat?.toString() || '');
    setType(entry.type);
    setDate(format(new Date(entry.date), 'yyyy-MM-dd'));
    setIsAdding(true);
  };

  const groupedEntries = useMemo(() => {
    const groups: Record<string, FoodEntry[]> = {};
    foodEntries.forEach(entry => {
      const day = format(new Date(entry.date), 'yyyy-MM-dd');
      if (!groups[day]) groups[day] = [];
      groups[day].push(entry);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [foodEntries]);

  const dailyTotals = useMemo(() => {
    const totals: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {};
    groupedEntries.forEach(([day, entries]) => {
      totals[day] = entries.reduce((acc, entry) => ({
        calories: acc.calories + entry.calories,
        protein: acc.protein + (entry.protein || 0),
        carbs: acc.carbs + (entry.carbs || 0),
        fat: acc.fat + (entry.fat || 0),
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    });
    return totals;
  }, [groupedEntries]);

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <Utensils className="w-8 h-8 text-amber-500" />
            Food Journal
          </h2>
          <p className="text-neutral-400 mt-1 uppercase tracking-widest text-[10px] font-bold">Ernährung & Energie</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-all transform hover:scale-105 active:scale-95"
        >
          {isAdding ? <ChevronDown className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          {isAdding ? 'Abbrechen' : 'Neuer Eintrag'}
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 mb-8 shadow-xl"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1 px-1">Was hast du gegessen?</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="z.B. Haferflocken mit Beeren"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1 px-1">Mahlzeit</label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as any)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500 appearance-none"
                      >
                        {MEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1 px-1">Datum</label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1 px-1 flex items-center gap-1">
                        <PieChartIcon className="w-3 h-3" /> Kalorien
                      </label>
                      <input
                        type="number"
                        value={calories}
                        onChange={(e) => setCalories(e.target.value)}
                        placeholder="kcal"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1 px-1 flex items-center gap-1">
                        <Beef className="w-3 h-3 text-red-500" /> Protein
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={protein}
                        onChange={(e) => setProtein(e.target.value)}
                        placeholder="g"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1 px-1 flex items-center gap-1">
                        <Wheat className="w-3 h-3 text-amber-500" /> Carbs
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={carbs}
                        onChange={(e) => setCarbs(e.target.value)}
                        placeholder="g"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1 px-1 flex items-center gap-1">
                        <Droplets className="w-3 h-3 text-blue-500" /> Fett
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={fat}
                        onChange={(e) => setFat(e.target.value)}
                        placeholder="g"
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-3 rounded-xl font-bold text-neutral-400 hover:text-white transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-neutral-200 transition-all flex items-center gap-2"
                >
                  {editingId ? 'Aktualisieren' : 'Speichern'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {groupedEntries.length === 0 ? (
          <div className="bg-neutral-900/50 border border-dashed border-neutral-800 rounded-3xl p-12 text-center">
            <Utensils className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
            <p className="text-neutral-500">Noch keine Mahlzeiten erfasst. Starte heute mit deinem ersten Eintrag!</p>
          </div>
        ) : (
          groupedEntries.map(([day, entries]) => {
            const totals = dailyTotals[day];
            const isExpanded = expandedDays.includes(day);
            const isToday = isSameDay(new Date(day), new Date());

            return (
              <div key={day} className="bg-neutral-950 border border-neutral-800 rounded-3xl overflow-hidden shadow-lg transition-all hover:border-neutral-700">
                <button
                  onClick={() => toggleDay(day)}
                  className="w-full text-left p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-900/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-3 rounded-xl",
                      isToday ? "bg-amber-500/20 text-amber-500" : "bg-neutral-800 text-neutral-400"
                    )}>
                      <CalendarIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        {isToday ? 'Heute' : format(new Date(day), 'EEEE, dd. MMMM', { locale: de })}
                      </h3>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">{entries.length} Einträge</span>
                        <div className="w-1 h-1 rounded-full bg-neutral-700" />
                        <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">{totals.calories} kcal</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-3">
                      <div className="text-center px-3 border-r border-neutral-800">
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter">Prot</div>
                        <div className="text-xs font-bold text-white">{totals.protein.toFixed(1)}g</div>
                      </div>
                      <div className="text-center px-3 border-r border-neutral-800">
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter">Carbs</div>
                        <div className="text-xs font-bold text-white">{totals.carbs.toFixed(1)}g</div>
                      </div>
                      <div className="text-center px-2">
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-tighter">Fat</div>
                        <div className="text-xs font-bold text-white">{totals.fat.toFixed(1)}g</div>
                      </div>
                    </div>
                    <ChevronDown className={cn("w-6 h-6 text-neutral-500 transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-neutral-800"
                    >
                      <div className="p-4 space-y-3">
                        {entries.map(entry => (
                          <div key={entry.id} className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between group hover:border-neutral-700 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="bg-neutral-800 w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold text-neutral-400">
                                {entry.type.charAt(0)}
                              </div>
                              <div>
                                <h4 className="font-bold text-white">{entry.name}</h4>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{entry.type}</span>
                                  <div className="w-1 h-1 rounded-full bg-neutral-700" />
                                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">{entry.calories} kcal</span>
                                  <div className="hidden sm:flex items-center gap-2">
                                     <div className="w-1 h-1 rounded-full bg-neutral-700" />
                                     <span className="text-[10px] font-medium text-neutral-500 italic">
                                       P: {entry.protein || 0}g • C: {entry.carbs || 0}g • F: {entry.fat || 0}g
                                     </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleEdit(entry)}
                                className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-white transition-colors"
                                title="Bearbeiten"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Eintrag löschen?')) {
                                    deleteFoodEntry(entry.id);
                                    toast.success('Eintrag gelöscht');
                                  }
                                }}
                                className="p-2 hover:bg-red-500/10 rounded-lg text-neutral-500 hover:text-red-500 transition-colors"
                                title="Löschen"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
