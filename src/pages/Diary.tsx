import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import {
  Book,
  Plus,
  Trash2,
  Smile,
  Meh,
  Frown,
  Heart,
  Star,
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronDown,
  Edit2,
  Filter,
  X,
} from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn, parseLocalDateInput } from '@/lib/utils';
import { toast } from 'sonner';
import { DiaryEntry } from '@/types';
import { DeleteConfirmationModal } from '@/components/DeleteConfirmationModal';

const MOODS = [
  { value: 1, icon: Frown, label: 'Schlecht', color: 'text-red-500', bg: 'bg-red-500/10' },
  { value: 2, icon: Meh, label: 'Geht so', color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { value: 3, icon: Smile, label: 'Gut', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  { value: 4, icon: Heart, label: 'Sehr gut', color: 'text-pink-500', bg: 'bg-pink-500/10' },
  { value: 5, icon: Star, label: 'Exzellent', color: 'text-amber-500', bg: 'bg-amber-500/10' },
];

export function Diary() {
  const { diaryEntries, addDiaryEntry, updateDiaryEntry, deleteDiaryEntry } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiaryEntry | null>(null);

  const [mood, setMood] = useState(3);
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isNotesExpanded, setIsNotesExpanded] = useState(true);
  const [isProgressExpanded, setIsProgressExpanded] = useState(true);

  const [filterMood, setFilterMood] = useState<number | null>(null);
  const [filterDate, setFilterDate] = useState<string>('');

  const filteredEntries = useMemo(() => {
    const parsedFilterMs = filterDate ? parseLocalDateInput(filterDate) : null;
    return [...diaryEntries]
      .sort((a, b) => b.date - a.date)
      .filter((entry) => {
        if (filterMood !== null && entry.mood !== filterMood) return false;
        if (parsedFilterMs !== null && !isSameDay(new Date(entry.date), new Date(parsedFilterMs))) {
          return false;
        }
        return true;
      });
  }, [diaryEntries, filterMood, filterDate]);

  const openNewForm = () => {
    setEditingId(null);
    setMood(3);
    setNotes('');
    setProgress('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setIsNotesExpanded(true);
    setIsProgressExpanded(true);
    setIsAdding(true);
  };

  const handleEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id);
    setMood(entry.mood);
    setNotes(entry.notes);
    setProgress(entry.progress);
    setDate(format(new Date(entry.date), 'yyyy-MM-dd'));
    setIsNotesExpanded(true);
    setIsProgressExpanded(true);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entryDate = parseLocalDateInput(date);

    if (editingId) {
      updateDiaryEntry(editingId, {
        mood,
        notes: notes.trim(),
        progress: progress.trim(),
        date: entryDate,
      });
      toast.success('Tagebucheintrag aktualisiert!');
    } else {
      addDiaryEntry({
        mood,
        notes: notes.trim(),
        progress: progress.trim(),
        date: entryDate,
        tags: [],
      });
      toast.success('Tagebucheintrag gespeichert!');
    }

    handleCancel();
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setMood(3);
    setNotes('');
    setProgress('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setIsNotesExpanded(true);
    setIsProgressExpanded(true);
  };

  const hasActiveFilter = filterMood !== null || Boolean(filterDate);

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5 sm:gap-3">
            <Book className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500 shrink-0" />
            Tagebuch
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Dokumentiere dein Wohlbefinden, Reflexionen und tägliche Erfolge
          </p>
        </div>
        <button
          type="button"
          onClick={isAdding ? handleCancel : openNewForm}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors min-h-[44px]',
            isAdding
              ? 'bg-neutral-800 text-neutral-300 hover:text-white'
              : 'bg-amber-500 text-neutral-950 hover:bg-amber-400'
          )}
        >
          {isAdding ? (
            'Abbrechen'
          ) : (
            <>
              <Plus className="w-4 h-4" /> Neuer Eintrag
            </>
          )}
        </button>
      </header>

      <AnimatePresence mode="wait">
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-6 shadow-xl"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-amber-500">
                  {editingId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
                </h3>
                <div className="flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 min-h-[44px]">
                  <CalendarIcon className="w-4 h-4 text-neutral-500" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-transparent text-sm font-mono text-neutral-200 focus:outline-none"
                    max={format(new Date(), 'yyyy-MM-dd')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">
                  Wie fühlst du dich?
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {MOODS.map((m) => {
                    const Icon = m.icon;
                    const isActive = mood === m.value;
                    return (
                      <button
                        type="button"
                        key={m.value}
                        onClick={() => setMood(m.value)}
                        className={cn(
                          'flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border transition-all min-h-[64px]',
                          isActive
                            ? cn('border-amber-500/60', m.bg, m.color)
                            : 'border-neutral-800 bg-neutral-950/60 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300'
                        )}
                      >
                        <Icon className={cn('w-6 h-6', isActive ? m.color : 'text-neutral-500')} />
                        <span className="text-[11px] font-bold hidden sm:block">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setIsNotesExpanded(!isNotesExpanded)}
                    className="flex items-center justify-between w-full text-left group"
                  >
                    <span className="block text-xs font-bold text-neutral-400 uppercase tracking-wider group-hover:text-neutral-200 transition-colors">
                      Notizen zum Wohlbefinden (Optional)
                    </span>
                    {isNotesExpanded ? (
                      <ChevronDown className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-neutral-500" />
                    )}
                  </button>
                  {isNotesExpanded && (
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Wie war dein Tag? Was beschäftigt dich?"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-neutral-100 focus:outline-none focus:border-amber-500/60 min-h-[120px] resize-none"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setIsProgressExpanded(!isProgressExpanded)}
                    className="flex items-center justify-between w-full text-left group"
                  >
                    <span className="block text-xs font-bold text-neutral-400 uppercase tracking-wider group-hover:text-neutral-200 transition-colors">
                      Heutige Fortschritte (Optional)
                    </span>
                    {isProgressExpanded ? (
                      <ChevronDown className="w-4 h-4 text-neutral-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-neutral-500" />
                    )}
                  </button>
                  {isProgressExpanded && (
                    <textarea
                      value={progress}
                      onChange={(e) => setProgress(e.target.value)}
                      placeholder="Was hast du heute erreicht? Welche Erfolge gab es?"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-neutral-100 focus:outline-none focus:border-amber-500/60 min-h-[120px] resize-none"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-5 py-3 rounded-xl font-bold text-neutral-400 hover:text-neutral-200 transition-colors min-h-[44px]"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 text-neutral-950 px-7 py-3 rounded-xl font-bold hover:bg-amber-400 transition-colors min-h-[44px]"
                >
                  {editingId ? 'Änderungen speichern' : 'Eintrag speichern'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Book className="w-5 h-5 text-amber-500" />
            Deine Einträge
            <span className="text-xs font-mono text-neutral-500 ml-1 tabular-nums">
              ({filteredEntries.length})
            </span>
          </h3>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl p-1">
              <Filter className="w-4 h-4 text-neutral-500 ml-2 mr-1" />
              {MOODS.map((m) => {
                const Icon = m.icon;
                const isActive = filterMood === m.value;
                return (
                  <button
                    type="button"
                    key={`filter-${m.value}`}
                    onClick={() => setFilterMood(isActive ? null : m.value)}
                    className={cn(
                      'p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center',
                      isActive ? m.bg : 'hover:bg-neutral-800'
                    )}
                    title={m.label}
                    aria-label={`Nach Stimmung ${m.label} filtern`}
                  >
                    <Icon className={cn('w-4 h-4', isActive ? m.color : 'text-neutral-500')} />
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-xl px-2.5 py-1 min-h-[44px] w-full sm:w-auto">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="bg-transparent text-sm font-mono text-neutral-300 focus:outline-none py-1 flex-1 min-w-0"
                aria-label="Nach Datum filtern"
              />
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="p-1.5 hover:bg-neutral-800 rounded-md text-neutral-400 hover:text-white transition-colors"
                  aria-label="Datumsfilter löschen"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setFilterMood(null);
                  setFilterDate('');
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-amber-400 transition-colors min-h-[44px]"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="bg-neutral-900/50 border border-dashed border-neutral-800 rounded-2xl p-12 text-center space-y-3">
            <Book className="w-12 h-12 text-neutral-700 mx-auto" />
            <p className="text-neutral-400 text-sm">
              {diaryEntries.length === 0
                ? 'Noch keine Einträge vorhanden. Starte heute mit deinem ersten Eintrag!'
                : 'Keine Einträge für diese Filter gefunden.'}
            </p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setFilterMood(null);
                  setFilterDate('');
                }}
                className="text-xs font-bold text-amber-500 hover:text-amber-400"
              >
                Alle Einträge anzeigen
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredEntries.map((entry) => {
              const moodInfo = MOODS.find((m) => m.value === entry.mood) || MOODS[2];
              const MoodIcon = moodInfo.icon;

              return (
                <motion.div
                  layout
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden"
                >
                  <div className="p-4 sm:p-6 flex flex-col md:flex-row gap-4 sm:gap-5">
                    <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start gap-4 md:w-44 flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <div className={cn('p-3 rounded-xl', moodInfo.bg)}>
                          <MoodIcon className={cn('w-6 h-6', moodInfo.color)} />
                        </div>
                        <div>
                          <div className="font-bold text-sm text-white">{moodInfo.label}</div>
                          <div className="text-xs text-neutral-400 tabular-nums md:hidden">
                            {format(entry.date, 'dd. MMMM yyyy', { locale: de })}
                          </div>
                        </div>
                      </div>
                      <div className="hidden md:block">
                        <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">
                          Datum
                        </div>
                        <div className="font-mono text-sm tabular-nums text-neutral-200">
                          {format(entry.date, 'dd.MM.yyyy', { locale: de })}
                        </div>
                        <div className="text-xs text-neutral-500 mt-0.5 capitalize">
                          {format(entry.date, 'EEEE', { locale: de })}
                        </div>
                      </div>
                      <div className="flex gap-1 md:mt-auto">
                        <button
                          type="button"
                          onClick={() => handleEdit(entry)}
                          className="p-2 text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 rounded-lg transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                          title="Eintrag bearbeiten"
                          aria-label="Eintrag bearbeiten"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(entry)}
                          className="p-2 text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
                          title="Eintrag löschen"
                          aria-label="Eintrag löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 space-y-4">
                      {entry.notes ? (
                        <div>
                          <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <ChevronRight className="w-3.5 h-3.5 text-amber-500" />
                            Wohlbefinden
                          </div>
                          <p className="text-neutral-200 leading-relaxed whitespace-pre-wrap text-sm">
                            {entry.notes}
                          </p>
                        </div>
                      ) : null}
                      {entry.progress ? (
                        <div className="bg-neutral-950/60 p-4 rounded-xl border border-neutral-800/80">
                          <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <Star className="w-3.5 h-3.5 text-amber-500" />
                            Fortschritt
                          </div>
                          <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap text-sm">
                            {entry.progress}
                          </p>
                        </div>
                      ) : null}
                      {!entry.notes && !entry.progress && (
                        <p className="text-xs text-neutral-500 italic">
                          Stimmungs-Check-in ({entry.mood}/5 Sterne) ohne zusätzliche Notizen.
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteConfirmationModal
          title="Tagebucheintrag löschen?"
          description={`Möchtest du den Eintrag vom ${format(deleteTarget.date, 'dd.MM.yyyy', {
            locale: de,
          })} wirklich unwiderruflich löschen?`}
          onConfirm={() => {
            deleteDiaryEntry(deleteTarget.id);
            toast.success('Tagebucheintrag gelöscht');
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
