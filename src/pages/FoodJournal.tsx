import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import {
  Utensils,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  ChevronDown,
  Edit2,
  Beef,
  Wheat,
  Droplets,
  PieChart as PieChartIcon,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn, parseLocalDateInput } from '@/lib/utils';
import { toast } from 'sonner';
import { FoodEntry } from '@/types';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';

const MEAL_TYPES = ['Frühstück', 'Mittagessen', 'Abendessen', 'Snack'] as const;

export function FoodJournal() {
  const { foodEntries, addFoodEntry, updateFoodEntry, deleteFoodEntry } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FoodEntry | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [type, setType] = useState<(typeof MEAL_TYPES)[number]>('Frühstück');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [expandedDays, setExpandedDays] = useState<string[]>([format(new Date(), 'yyyy-MM-dd')]);

  const toggleDay = (day: string) => {
    setExpandedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const resetForm = () => {
    setName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setType('Frühstück');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setEditingId(null);
    setIsAdding(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !calories) {
      toast.error('Bitte Name und Kalorien angeben');
      return;
    }

    const entryData = {
      name: name.trim(),
      calories: parseInt(calories, 10) || 0,
      protein: protein ? parseFloat(protein) : undefined,
      carbs: carbs ? parseFloat(carbs) : undefined,
      fat: fat ? parseFloat(fat) : undefined,
      type,
      date: parseLocalDateInput(date),
    };

    if (editingId) {
      updateFoodEntry(editingId, entryData);
      toast.success('Eintrag aktualisiert');
    } else {
      addFoodEntry(entryData);
      if (!expandedDays.includes(date)) {
        setExpandedDays((prev) => [...prev, date]);
      }
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleApplyPreset = (preset: FoodEntry) => {
    setName(preset.name);
    setCalories(preset.calories.toString());
    setProtein(preset.protein?.toString() || '');
    setCarbs(preset.carbs?.toString() || '');
    setFat(preset.fat?.toString() || '');
    setType(preset.type);
  };

  const frequentMeals = useMemo(() => {
    const map = new Map<string, { count: number; latest: FoodEntry }>();
    foodEntries.forEach((entry) => {
      const key = entry.name.trim().toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (entry.date >= existing.latest.date) existing.latest = entry;
      } else {
        map.set(key, { count: 1, latest: entry });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || b.latest.date - a.latest.date)
      .slice(0, 6)
      .map((item) => item.latest);
  }, [foodEntries]);

  const groupedEntries = useMemo(() => {
    const groups: Record<string, FoodEntry[]> = {};
    foodEntries.forEach((entry) => {
      const day = format(new Date(entry.date), 'yyyy-MM-dd');
      if (!groups[day]) groups[day] = [];
      groups[day].push(entry);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [foodEntries]);

  const dailyTotals = useMemo(() => {
    const totals: Record<
      string,
      { calories: number; protein: number; carbs: number; fat: number }
    > = {};
    groupedEntries.forEach(([day, entries]) => {
      totals[day] = entries.reduce(
        (acc, entry) => ({
          calories: acc.calories + entry.calories,
          protein: acc.protein + (entry.protein || 0),
          carbs: acc.carbs + (entry.carbs || 0),
          fat: acc.fat + (entry.fat || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
    });
    return totals;
  }, [groupedEntries]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayStats = dailyTotals[todayKey] || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const todayCount = groupedEntries.find(([d]) => d === todayKey)?.[1].length || 0;
  const macroTotalGrams = todayStats.protein + todayStats.carbs + todayStats.fat;

  return (
    <div className="max-w-5xl mx-auto pb-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2.5 sm:gap-3 tracking-tight">
            <Utensils className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
            Food Journal
          </h2>
          <p className="text-neutral-400 mt-1 text-xs sm:text-sm">
            Ernährung, Makros &amp; Energie im Überblick
          </p>
        </div>
        <button
          type="button"
          onClick={() => (isAdding ? resetForm() : setIsAdding(true))}
          className={cn(
            'font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[44px]',
            isAdding
              ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
              : 'bg-amber-500 hover:bg-amber-400 text-neutral-950'
          )}
        >
          {isAdding ? (
            <>
              <ChevronDown className="w-5 h-5" />
              Abbrechen
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              Neuer Eintrag
            </>
          )}
        </button>
      </header>

      {/* Today's Nutrition Overview Strip */}
      <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Heute im Überblick
          </span>
          <span className="text-xs text-neutral-500 tabular-nums">
            {todayCount} {todayCount === 1 ? 'Mahlzeit' : 'Mahlzeiten'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <PieChartIcon className="w-3.5 h-3.5 text-amber-500" />
              Kalorien
            </div>
            <div className="mt-1 text-2xl font-black text-white tabular-nums">
              {todayStats.calories} <span className="text-xs font-bold text-neutral-500">kcal</span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Beef className="w-3.5 h-3.5 text-rose-400" />
              Protein
            </div>
            <div className="mt-1 text-2xl font-black text-rose-400 tabular-nums">
              {todayStats.protein.toFixed(0)} <span className="text-xs font-bold text-neutral-500">g</span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Wheat className="w-3.5 h-3.5 text-amber-400" />
              Carbs
            </div>
            <div className="mt-1 text-2xl font-black text-amber-400 tabular-nums">
              {todayStats.carbs.toFixed(0)} <span className="text-xs font-bold text-neutral-500">g</span>
            </div>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-sky-400" />
              Fett
            </div>
            <div className="mt-1 text-2xl font-black text-sky-400 tabular-nums">
              {todayStats.fat.toFixed(0)} <span className="text-xs font-bold text-neutral-500">g</span>
            </div>
          </div>
        </div>

        {macroTotalGrams > 0 && (
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-neutral-950 overflow-hidden flex">
              <div
                className="bg-rose-400 transition-all"
                style={{ width: `${(todayStats.protein / macroTotalGrams) * 100}%` }}
                title={`Protein ${Math.round((todayStats.protein / macroTotalGrams) * 100)}%`}
              />
              <div
                className="bg-amber-400 transition-all"
                style={{ width: `${(todayStats.carbs / macroTotalGrams) * 100}%` }}
                title={`Carbs ${Math.round((todayStats.carbs / macroTotalGrams) * 100)}%`}
              />
              <div
                className="bg-sky-400 transition-all"
                style={{ width: `${(todayStats.fat / macroTotalGrams) * 100}%` }}
                title={`Fett ${Math.round((todayStats.fat / macroTotalGrams) * 100)}%`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-neutral-400 tabular-nums">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                Protein {Math.round((todayStats.protein / macroTotalGrams) * 100)}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Carbs {Math.round((todayStats.carbs / macroTotalGrams) * 100)}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                Fett {Math.round((todayStats.fat / macroTotalGrams) * 100)}%
              </span>
            </div>
          </div>
        )}
      </section>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-4 sm:p-6 shadow-xl"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Quick Fill from Frequent Meals */}
              {!editingId && frequentMeals.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Schnell-Auswahl aus deinem Verlauf
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {frequentMeals.map((meal) => (
                      <button
                        key={meal.id}
                        type="button"
                        onClick={() => handleApplyPreset(meal)}
                        className="px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 hover:border-amber-500/50 text-xs font-medium text-neutral-200 hover:text-amber-400 transition-colors flex items-center gap-2 min-h-[36px]"
                      >
                        <span className="truncate max-w-[160px]">{meal.name}</span>
                        <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
                          {meal.calories} kcal
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5 px-1">
                      Was hast du gegessen?
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="z.B. Haferflocken mit Beeren"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5 px-1">
                        Mahlzeit
                      </label>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as (typeof MEAL_TYPES)[number])}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                      >
                        {MEAL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5 px-1">
                        Datum
                      </label>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5 px-1 flex items-center gap-1">
                      <PieChartIcon className="w-3 h-3" /> Kalorien
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={calories}
                      onChange={(e) => setCalories(e.target.value)}
                      placeholder="kcal"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5 px-1 flex items-center gap-1">
                      <Beef className="w-3 h-3 text-rose-400" /> Protein
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={protein}
                      onChange={(e) => setProtein(e.target.value)}
                      placeholder="g"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5 px-1 flex items-center gap-1">
                      <Wheat className="w-3 h-3 text-amber-400" /> Carbs
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={carbs}
                      onChange={(e) => setCarbs(e.target.value)}
                      placeholder="g"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5 px-1 flex items-center gap-1">
                      <Droplets className="w-3 h-3 text-sky-400" /> Fett
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={fat}
                      onChange={(e) => setFat(e.target.value)}
                      placeholder="g"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-3 rounded-xl font-bold text-neutral-400 hover:text-white transition-colors min-h-[44px]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-neutral-950 px-7 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 min-h-[44px]"
                >
                  {editingId ? 'Aktualisieren' : 'Speichern'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {groupedEntries.length === 0 ? (
          <div className="bg-neutral-900/50 border border-dashed border-neutral-800 rounded-3xl p-12 text-center">
            <Utensils className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
            <p className="text-neutral-400">
              Noch keine Mahlzeiten erfasst. Starte heute mit deinem ersten Eintrag!
            </p>
          </div>
        ) : (
          groupedEntries.map(([day, entries]) => {
            const totals = dailyTotals[day];
            const isExpanded = expandedDays.includes(day);
            const dayDate = new Date(parseLocalDateInput(day));
            const isToday = isSameDay(dayDate, new Date());

            return (
              <div
                key={day}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden transition-colors hover:border-neutral-700"
              >
                <button
                  type="button"
                  onClick={() => toggleDay(day)}
                  className="w-full text-left p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-800/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        'p-3 rounded-xl shrink-0',
                        isToday ? 'bg-amber-500/15 text-amber-400' : 'bg-neutral-800 text-neutral-400'
                      )}
                    >
                      <CalendarIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white capitalize">
                        {isToday ? 'Heute' : format(dayDate, 'EEEE, dd. MMMM', { locale: de })}
                      </h3>
                      <div className="flex items-center gap-3 mt-0.5 text-xs">
                        <span className="font-semibold text-neutral-400 tabular-nums">
                          {entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'}
                        </span>
                        <span className="text-neutral-700">·</span>
                        <span className="font-bold text-amber-400 tabular-nums">
                          {totals.calories} kcal
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-4">
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      <div className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800">
                        <span className="text-neutral-500 mr-1">P</span>
                        <strong className="text-rose-400">{totals.protein.toFixed(0)}g</strong>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800">
                        <span className="text-neutral-500 mr-1">C</span>
                        <strong className="text-amber-400">{totals.carbs.toFixed(0)}g</strong>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800">
                        <span className="text-neutral-500 mr-1">F</span>
                        <strong className="text-sky-400">{totals.fat.toFixed(0)}g</strong>
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-5 h-5 text-neutral-500 transition-transform shrink-0',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-neutral-800 overflow-hidden"
                    >
                      <div className="p-4 space-y-2.5 bg-neutral-950/40">
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 flex items-center justify-between gap-3 hover:border-neutral-700 transition-colors"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="bg-neutral-900 border border-neutral-800 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-neutral-300 shrink-0">
                                {entry.type.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold text-white text-sm truncate">
                                  {entry.name}
                                </h4>
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 text-xs">
                                  <span className="font-semibold text-sky-400">{entry.type}</span>
                                  <span className="text-neutral-700">·</span>
                                  <span className="font-bold text-amber-400 tabular-nums">
                                    {entry.calories} kcal
                                  </span>
                                  {(entry.protein || entry.carbs || entry.fat) ? (
                                    <>
                                      <span className="text-neutral-700 hidden sm:inline">·</span>
                                      <span className="text-neutral-400 text-[11px] tabular-nums hidden sm:inline">
                                        P: {entry.protein || 0}g · C: {entry.carbs || 0}g · F:{' '}
                                        {entry.fat || 0}g
                                      </span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleEdit(entry)}
                                className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                                title="Bearbeiten"
                                aria-label={`${entry.name} bearbeiten`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(entry)}
                                className="p-2 hover:bg-rose-500/10 rounded-lg text-neutral-400 hover:text-rose-400 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                                title="Löschen"
                                aria-label={`${entry.name} löschen`}
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

      {deleteTarget && (
        <DeleteConfirmationModal
          title="Mahlzeit löschen?"
          description={`Möchtest du "${deleteTarget.name}" (${deleteTarget.calories} kcal) wirklich aus deinem Food Journal entfernen?`}
          onConfirm={() => {
            deleteFoodEntry(deleteTarget.id);
            toast.success('Eintrag gelöscht');
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
