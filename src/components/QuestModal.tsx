import { useState, useEffect } from 'react';
import { X, Plus, Calendar, Bell, Target, Save, Compass } from 'lucide-react';
import { SkillType, Subtask, ReminderTiming, Quest, Recurrence } from '@/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

interface QuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (quest: any) => void;
  initialDate?: Date;
  initialQuest?: Quest;
}

export function QuestModal({ isOpen, onClose, onSave, initialDate, initialQuest }: QuestModalProps) {
  const { visions } = useStore();
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newQuest, setNewQuest] = useState({
    title: '',
    description: '',
    skill: 'Fitness' as SkillType,
    xpReward: 5,
    type: 'daily' as 'daily' | 'habit',
    habitDirection: 'positive' as 'positive' | 'negative' | 'both',
    subtasks: [] as Subtask[],
    dueDate: '',
    dueTime: '',
    hasTime: false,
    reminderTiming: 'none' as ReminderTiming,
    recurrence: 'none' as Recurrence,
    recurrenceDays: [] as number[],
    tags: [] as string[],
    completedAtDate: '',
    completedAtTime: '',
    visionId: ''
  });

  useEffect(() => {
    if (initialQuest) {
      const dateObj = initialQuest.dueDate ? new Date(initialQuest.dueDate) : null;
      const dueDateStr = dateObj ? dateObj.toISOString().slice(0, 10) : '';
      const dueTimeStr = (dateObj && initialQuest.hasTime) ? dateObj.toISOString().slice(11, 16) : '';
      
      const completedDateObj = initialQuest.completedAt ? new Date(initialQuest.completedAt) : null;
      const completedAtDateStr = completedDateObj ? completedDateObj.toISOString().slice(0, 10) : '';
      const completedAtTimeStr = completedDateObj ? completedDateObj.toISOString().slice(11, 16) : '';

      setNewQuest({
        title: initialQuest.title,
        description: initialQuest.description,
        skill: initialQuest.skill,
        xpReward: initialQuest.xpReward,
        type: initialQuest.type,
        habitDirection: initialQuest.habitDirection || 'positive',
        subtasks: initialQuest.subtasks || [],
        dueDate: dueDateStr,
        dueTime: dueTimeStr,
        hasTime: initialQuest.hasTime || false,
        reminderTiming: initialQuest.reminderTiming || 'none',
        recurrence: initialQuest.recurrence || 'none',
        recurrenceDays: initialQuest.recurrenceDays || [],
        tags: initialQuest.tags || [],
        completedAtDate: completedAtDateStr,
        completedAtTime: completedAtTimeStr,
        visionId: initialQuest.visionId || ''
      });
    } else if (initialDate) {
      const year = initialDate.getFullYear();
      const month = String(initialDate.getMonth() + 1).padStart(2, '0');
      const day = String(initialDate.getDate()).padStart(2, '0');
      setNewQuest({
        title: '',
        description: '',
        skill: 'Fitness',
        xpReward: 5,
        type: 'daily',
        habitDirection: 'positive',
        subtasks: [],
        dueDate: `${year}-${month}-${day}`,
        dueTime: '',
        hasTime: false,
        reminderTiming: 'none',
        recurrence: 'none',
        recurrenceDays: [],
        tags: [],
        completedAtDate: '',
        completedAtTime: '',
        visionId: ''
      });
    } else {
      setNewQuest({
        title: '',
        description: '',
        skill: 'Fitness',
        xpReward: 5,
        type: 'daily',
        habitDirection: 'positive',
        subtasks: [],
        dueDate: '',
        dueTime: '',
        hasTime: false,
        reminderTiming: 'none',
        recurrence: 'none',
        recurrenceDays: [],
        tags: [],
        completedAtDate: '',
        completedAtTime: '',
        visionId: ''
      });
    }
  }, [initialDate, initialQuest, isOpen]);

  if (!isOpen) return null;

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const subtask: Subtask = {
      id: crypto.randomUUID(),
      title: newSubtaskTitle.trim(),
      completed: false
    };
    setNewQuest({ ...newQuest, subtasks: [...newQuest.subtasks, subtask] });
    setNewSubtaskTitle('');
  };

  const removeSubtask = (id: string) => {
    setNewQuest({ ...newQuest, subtasks: newQuest.subtasks.filter(s => s.id !== id) });
  };

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (!tag || newQuest.tags.includes(tag)) return;
    setNewQuest({ ...newQuest, tags: [...newQuest.tags, tag] });
    setNewTag('');
  };

  const removeTag = (tagToRemove: string) => {
    setNewQuest({ ...newQuest, tags: newQuest.tags.filter(t => t !== tagToRemove) });
  };

  const toggleDay = (day: number) => {
    setNewQuest(prev => ({
      ...prev,
      recurrenceDays: prev.recurrenceDays.includes(day)
        ? prev.recurrenceDays.filter(d => d !== day)
        : [...prev.recurrenceDays, day].sort()
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuest.title) return;
    
    let finalDueDate: number | undefined = undefined;
    if (newQuest.dueDate) {
      if (newQuest.hasTime && newQuest.dueTime) {
        finalDueDate = new Date(`${newQuest.dueDate}T${newQuest.dueTime}`).getTime();
      } else {
        // Just date, set to end of day or start of day? Let's use 23:59:59
        finalDueDate = new Date(`${newQuest.dueDate}T23:59:59`).getTime();
      }
    }

    let finalCompletedAt = initialQuest?.completedAt;
    if (initialQuest?.completed && newQuest.completedAtDate) {
      if (newQuest.completedAtTime) {
        finalCompletedAt = new Date(`${newQuest.completedAtDate}T${newQuest.completedAtTime}`).getTime();
      } else {
        finalCompletedAt = new Date(`${newQuest.completedAtDate}T12:00:00`).getTime();
      }
    }

    onSave({
      ...newQuest,
      dueDate: finalDueDate,
      hasTime: newQuest.hasTime,
      completedAt: finalCompletedAt
    });
    onClose();
  };

  const WEEKDAYS = [
    { label: 'Mo', value: 1 },
    { label: 'Di', value: 2 },
    { label: 'Mi', value: 3 },
    { label: 'Do', value: 4 },
    { label: 'Fr', value: 5 },
    { label: 'Sa', value: 6 },
    { label: 'So', value: 0 }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-28 md:pb-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl relative z-10 flex flex-col max-h-full overflow-hidden">
        <header className="flex-shrink-0 flex justify-between items-center p-6 border-b border-neutral-800">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-amber-500" />
            {initialQuest ? 'Quest bearbeiten' : 'Neue Quest erstellen'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="overflow-y-auto p-6 flex-1">
          <form id="quest-form" onSubmit={handleSubmit} className="space-y-4 pb-2">
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Quest-Titel</label>
              <input 
                type="text" 
                value={newQuest.title}
                onChange={e => setNewQuest({...newQuest, title: e.target.value})}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                placeholder="z.B. 5km laufen"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Beschreibung (Optional)</label>
              <textarea 
                value={newQuest.description}
                onChange={e => setNewQuest({...newQuest, description: e.target.value})}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500 resize-none h-20"
                placeholder="Details hinzufügen..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {newQuest.type === 'habit' && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Richtung</label>
                  <select 
                    value={newQuest.habitDirection}
                    onChange={e => setNewQuest({...newQuest, habitDirection: e.target.value as 'positive' | 'negative' | 'both'})}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="positive">Positiv (+EP)</option>
                    <option value="negative">Negativ (-EP)</option>
                    <option value="both">Beides (+/- EP)</option>
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Skill-Kategorie</label>
                <select 
                  value={newQuest.skill}
                  onChange={e => setNewQuest({...newQuest, skill: e.target.value as SkillType})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Fitness">Fitness</option>
                  <option value="Fokus">Fokus</option>
                  <option value="Disziplin">Disziplin</option>
                  <option value="Wissen">Wissen</option>
                  <option value="Soziales">Soziales</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">EP-Belohnung</label>
                <select 
                  value={newQuest.xpReward}
                  onChange={e => setNewQuest({...newQuest, xpReward: parseInt(e.target.value) || 10})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value={5}>5 EP (Trivial)</option>
                  <option value={10}>10 EP (Einfach)</option>
                  <option value={20}>20 EP (Normal)</option>
                  <option value={50}>50 EP (Herausfordernd)</option>
                  <option value={100}>100 EP (Schwer)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1 flex items-center gap-2">
                <Compass className="w-4 h-4" />
                Lebensziel (Optional)
              </label>
              <select 
                value={newQuest.visionId}
                onChange={e => setNewQuest({...newQuest, visionId: e.target.value})}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">Kein Ziel ausgewählt</option>
                {visions.filter(v => !v.completed).map(vision => (
                  <option key={vision.id} value={vision.id}>
                    {vision.icon} {vision.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-neutral-400 mb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Fälligkeitsdatum
                </label>
                <input 
                  type="date" 
                  value={newQuest.dueDate}
                  onChange={e => setNewQuest({...newQuest, dueDate: e.target.value})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={newQuest.type === 'habit'}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-neutral-400 mb-1">
                  Uhrzeit (Optional)
                </label>
                <input 
                  type="time" 
                  value={newQuest.dueTime}
                  onChange={e => setNewQuest({...newQuest, dueTime: e.target.value, hasTime: !!e.target.value})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={newQuest.type === 'habit' || !newQuest.dueDate}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-neutral-400 mb-1 flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Erinnerung
                </label>
                <select 
                  value={newQuest.reminderTiming}
                  onChange={e => setNewQuest({...newQuest, reminderTiming: e.target.value as ReminderTiming})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={newQuest.type === 'habit'}
                >
                  <option value="none">Keine</option>
                  <option value="0m">Zum Zeitpunkt</option>
                  <option value="1h">1 Stunde vorher</option>
                  <option value="2h">2 Stunden vorher</option>
                  <option value="1d">1 Tag vorher</option>
                  <option value="2d">2 Tage vorher</option>
                </select>
              </div>
            </div>
            {initialQuest?.completed && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-green-400 mb-1 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Abgeschlossen am
                  </label>
                  <input 
                    type="date" 
                    value={newQuest.completedAtDate}
                    onChange={e => setNewQuest({...newQuest, completedAtDate: e.target.value})}
                    className="w-full bg-neutral-950 border border-green-500/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-green-400 mb-1">
                    Uhrzeit
                  </label>
                  <input 
                    type="time" 
                    value={newQuest.completedAtTime}
                    onChange={e => setNewQuest({...newQuest, completedAtTime: e.target.value})}
                    className="w-full bg-neutral-950 border border-green-500/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Wiederholung</label>
                <select 
                  value={newQuest.recurrence}
                  onChange={e => setNewQuest({...newQuest, recurrence: e.target.value as Recurrence})}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={newQuest.type === 'habit'}
                >
                  <option value="none">Einmalig</option>
                  <option value="daily">Täglich</option>
                  <option value="weekly">Wöchentlich</option>
                  <option value="monthly">Monatlich</option>
                </select>
              </div>
              {newQuest.recurrence === 'weekly' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-neutral-400">Wochentage</label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={cn(
                          "w-10 h-10 rounded-lg border text-sm font-medium transition-all",
                          newQuest.recurrenceDays.includes(day.value)
                            ? "bg-amber-500 border-amber-500 text-neutral-950"
                            : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-600"
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {newQuest.recurrence === 'monthly' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-neutral-400">Tag des Monats</label>
                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={cn(
                          "w-10 h-10 rounded-lg border text-sm font-medium transition-all",
                          newQuest.recurrenceDays.includes(day)
                            ? "bg-amber-500 border-amber-500 text-neutral-950"
                            : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-600"
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-neutral-500">Hinweis: Bei Monaten mit weniger Tagen wird der letzte verfügbare Tag gewählt.</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-400">Teilaufgaben (Optional)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newSubtaskTitle}
                  onChange={e => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSubtask())}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                  placeholder="Teilaufgabe hinzufügen..."
                />
                <button 
                  type="button"
                  onClick={handleAddSubtask}
                  className="bg-neutral-800 text-white p-2 rounded-lg hover:bg-neutral-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              {newQuest.subtasks.length > 0 && (
                <div className="bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden">
                  {newQuest.subtasks.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 border-b border-neutral-800 last:border-0">
                      <span className="text-sm text-neutral-300">{s.title}</span>
                      <button 
                        type="button"
                        onClick={() => removeSubtask(s.id)}
                        className="text-neutral-600 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-400">Kategorien / Tags (Optional)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                  placeholder="Tag hinzufügen (z.B. 'Gesundheit', 'Arbeit')..."
                />
                <button 
                  type="button"
                  onClick={handleAddTag}
                  className="bg-neutral-800 text-white p-2 rounded-lg hover:bg-neutral-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              {newQuest.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {newQuest.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 bg-neutral-800 text-neutral-300 rounded-full text-sm">
                      {tag}
                      <button 
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-neutral-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </form>
        </div>

        <div className="flex-shrink-0 p-6 pt-4 border-t border-neutral-800 bg-neutral-900/95">
          <div className="flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 bg-neutral-800 text-white py-3 rounded-xl font-bold hover:bg-neutral-700 transition-colors"
            >
              Abbrechen
            </button>
            <button 
              form="quest-form"
              type="submit"
              className="flex-1 bg-amber-500 text-neutral-950 py-3 rounded-xl font-bold hover:bg-amber-400 transition-colors flex items-center justify-center gap-2"
            >
              {initialQuest ? <Save className="w-5 h-5" /> : null}
              {initialQuest ? 'Speichern' : 'Quest erstellen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
