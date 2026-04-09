import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { Book, Plus, Trash2, Smile, Meh, Frown, Heart, Star, Calendar as CalendarIcon, ChevronRight, ChevronDown, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  const [mood, setMood] = useState(3);
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(false);

  const handleEdit = (entry: any) => {
    setEditingId(entry.id);
    setMood(entry.mood);
    setNotes(entry.notes);
    setProgress(entry.progress);
    setDate(format(new Date(entry.date), 'yyyy-MM-dd'));
    setIsNotesExpanded(!!entry.notes);
    setIsProgressExpanded(!!entry.progress);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim() && !progress.trim()) {
      toast.error('Bitte gib Notizen oder Fortschritte ein.');
      return;
    }

    const entryDate = new Date(date).getTime();

    if (editingId) {
      updateDiaryEntry(editingId, {
        mood,
        notes,
        progress,
        date: entryDate,
      });
      toast.success('Tagebucheintrag aktualisiert!');
    } else {
      addDiaryEntry({
        mood,
        notes,
        progress,
        date: entryDate,
        tags: [],
      });
      toast.success('Tagebucheintrag gespeichert!');
    }

    setMood(3);
    setNotes('');
    setProgress('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setIsNotesExpanded(false);
    setIsProgressExpanded(false);
    setIsAdding(false);
    setEditingId(null);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setMood(3);
    setNotes('');
    setProgress('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setIsNotesExpanded(false);
    setIsProgressExpanded(false);
  };

  return (
    <div className="space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tagebuch</h2>
          <p className="text-neutral-400">Dokumentiere dein Wohlbefinden und deine Erfolge</p>
        </div>
        <button
          onClick={isAdding ? handleCancel : () => setIsAdding(true)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
            isAdding 
              ? "bg-neutral-800 text-neutral-400 hover:text-neutral-200" 
              : "bg-amber-500 text-neutral-950 hover:bg-amber-400"
          )}
        >
          {isAdding ? 'Abbrechen' : <><Plus className="w-4 h-4" /> Neuer Eintrag</>}
        </button>
      </header>

      <AnimatePresence mode="wait">
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-amber-500">
                  {editingId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}
                </h3>
                <div className="flex items-center gap-3 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2">
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
                <label className="block text-sm font-bold text-neutral-400 uppercase tracking-widest mb-4">
                  Wie fühlst du dich heute?
                </label>
                <div className="flex justify-between gap-2">
                  {MOODS.map((m) => {
                    const Icon = m.icon;
                    const isActive = mood === m.value;
                    return (
                      <button
                        type="button"
                        key={m.value}
                        onClick={() => setMood(m.value)}
                        className={cn(
                          "flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-all",
                          isActive 
                            ? cn("border-amber-500/50", m.bg, m.color) 
                            : "border-neutral-800 bg-neutral-800/30 text-neutral-500 hover:border-neutral-700"
                        )}
                      >
                        <Icon className={cn("w-8 h-8", isActive ? m.color : "text-neutral-500")} />
                        <span className="text-xs font-bold hidden sm:block">{m.label}</span>
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
                    <label className="block text-sm font-bold text-neutral-400 uppercase tracking-widest cursor-pointer group-hover:text-neutral-300 transition-colors">
                      Notizen zum Wohlbefinden
                    </label>
                    {isNotesExpanded ? <ChevronDown className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors" /> : <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors" />}
                  </button>
                  <AnimatePresence>
                    {isNotesExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Wie war dein Tag? Was beschäftigt dich?"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-neutral-100 focus:outline-none focus:border-amber-500/50 min-h-[120px] resize-none mt-2"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setIsProgressExpanded(!isProgressExpanded)}
                    className="flex items-center justify-between w-full text-left group"
                  >
                    <label className="block text-sm font-bold text-neutral-400 uppercase tracking-widest cursor-pointer group-hover:text-neutral-300 transition-colors">
                      Heutige Fortschritte
                    </label>
                    {isProgressExpanded ? <ChevronDown className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors" /> : <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors" />}
                  </button>
                  <AnimatePresence>
                    {isProgressExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <textarea
                          value={progress}
                          onChange={(e) => setProgress(e.target.value)}
                          placeholder="Was hast du heute erreicht? Welche Erfolge gab es?"
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-neutral-100 focus:outline-none focus:border-amber-500/50 min-h-[120px] resize-none mt-2"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                {editingId && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-6 py-3 rounded-xl font-bold text-neutral-400 hover:text-neutral-200 transition-colors"
                  >
                    Abbrechen
                  </button>
                )}
                <button
                  type="submit"
                  className="bg-amber-500 text-neutral-950 px-8 py-3 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/10"
                >
                  {editingId ? 'Änderungen speichern' : 'Eintrag speichern'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Book className="w-5 h-5 text-amber-500" />
          Deine Einträge
        </h3>

        {diaryEntries.length === 0 ? (
          <div className="bg-neutral-900/50 border border-dashed border-neutral-800 rounded-2xl p-12 text-center">
            <Book className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
            <p className="text-neutral-500">Noch keine Einträge vorhanden. Starte heute mit deinem ersten Eintrag!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {diaryEntries.map((entry) => {
              const moodInfo = MOODS.find(m => m.value === entry.mood) || MOODS[2];
              const MoodIcon = moodInfo.icon;
              
              return (
                <motion.div
                  layout
                  key={entry.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden group"
                >
                  <div className="p-6 flex flex-col md:flex-row gap-6">
                    <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start gap-4 md:w-48 flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-3 rounded-xl", moodInfo.bg)}>
                          <MoodIcon className={cn("w-6 h-6", moodInfo.color)} />
                        </div>
                        <div className="md:hidden">
                          <div className="font-bold">{moodInfo.label}</div>
                          <div className="text-xs text-neutral-500">
                            {format(entry.date, 'dd. MMMM yyyy', { locale: de })}
                          </div>
                        </div>
                      </div>
                      <div className="hidden md:block">
                        <div className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-1">Datum</div>
                        <div className="font-mono text-sm">{format(entry.date, 'dd.MM.yyyy', { locale: de })}</div>
                        <div className="text-xs text-neutral-500 mt-1">{format(entry.date, 'EEEE', { locale: de })}</div>
                      </div>
                      <div className="flex gap-2 md:mt-auto">
                        <button
                          onClick={() => handleEdit(entry)}
                          className="p-2 text-neutral-600 hover:text-amber-500 transition-colors"
                          title="Eintrag bearbeiten"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteDiaryEntry(entry.id)}
                          className="p-2 text-neutral-600 hover:text-red-500 transition-colors"
                          title="Eintrag löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 space-y-4">
                      {entry.notes && (
                        <div>
                          <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <ChevronRight className="w-3 h-3 text-amber-500" />
                            Wohlbefinden
                          </div>
                          <p className="text-neutral-200 leading-relaxed whitespace-pre-wrap">{entry.notes}</p>
                        </div>
                      )}
                      {entry.progress && (
                        <div className="bg-neutral-950/50 p-4 rounded-xl border border-neutral-800/50">
                          <div className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Star className="w-3 h-3 text-amber-500" />
                            Fortschritt
                          </div>
                          <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap italic">{entry.progress}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
