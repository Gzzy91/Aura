import { CheckCircle2, Circle, X, ListTodo, Trash2, Calendar, Bell, Pencil, Repeat, Download, ExternalLink } from 'lucide-react';
import { Quest } from '@/types';
import { cn, SKILL_COLORS, SKILL_BORDER_COLORS } from '@/lib/utils';
import { downloadICS, getGoogleCalendarLink } from '@/lib/calendarSync';

interface QuestDetailsModalProps {
  quest: Quest;
  onClose: () => void;
  onDeleteRequest: () => void;
  onEditRequest?: () => void;
  onReopen?: (id: string) => void;
  onToggleSubtask?: (questId: string, subtaskId: string) => void;
}

export function QuestDetailsModal({ quest, onClose, onDeleteRequest, onEditRequest, onReopen, onToggleSubtask }: QuestDetailsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={cn("bg-neutral-900 border-y border-r border-l-4 rounded-2xl p-6 max-w-md w-full space-y-6 shadow-2xl border-y-neutral-800 border-r-neutral-800 max-h-[90vh] overflow-y-auto custom-scrollbar", SKILL_BORDER_COLORS[quest.skill])} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-bold text-white">{quest.title}</h3>
              {onEditRequest && (
                <button 
                  onClick={onEditRequest}
                  className="p-1.5 text-neutral-500 hover:text-amber-500 transition-colors"
                  title="Quest bearbeiten"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-neutral-400 text-sm mt-1">
              {quest.completed ? 'Abgeschlossen am ' : 'Erstellt am '}
              {new Date(quest.completedAt || quest.createdAt).toLocaleDateString('de-DE', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {quest.description && (
          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
            <p className="text-neutral-300 whitespace-pre-wrap">{quest.description}</p>
          </div>
        )}

        {quest.tags && quest.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quest.tags.map(tag => (
              <span key={tag} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">
                {tag}
              </span>
            ))}
          </div>
        )}

        {quest.subtasks && quest.subtasks.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
              <ListTodo className="w-4 h-4" />
              Teilaufgaben
            </h4>
            <div className="bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden">
              {quest.subtasks.map(s => (
                <div 
                  key={s.id} 
                  className={cn(
                    "flex items-center gap-3 p-3 border-b border-neutral-800 last:border-0",
                    !quest.completed && "cursor-pointer hover:bg-neutral-900 transition-colors"
                  )}
                  onClick={() => !quest.completed && onToggleSubtask?.(quest.id, s.id)}
                >
                  {s.completed ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-neutral-600" />}
                  <span className={cn("text-sm", s.completed ? "text-neutral-500 line-through" : "text-neutral-300")}>
                    {s.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 grid-cols-2">
          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center">
            <span className="text-sm text-neutral-500 mb-1">Skill</span>
            <span className={cn("font-bold text-lg", SKILL_COLORS[quest.skill])}>{quest.skill}</span>
          </div>
          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex flex-col items-center justify-center text-center">
            <span className="text-sm text-neutral-500 mb-1">{quest.completed ? 'EP verdient' : 'EP Belohnung'}</span>
            <span className="font-bold text-lg text-amber-500">+{quest.xpReward} EP</span>
          </div>
        </div>

        {quest.dueDate && (
          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Fällig am
              </span>
              <span className="text-white font-medium">
                {new Date(quest.dueDate).toLocaleDateString('de-DE', { 
                  month: 'short', 
                  day: 'numeric', 
                  ...(quest.hasTime ? { hour: '2-digit', minute: '2-digit' } : {}) 
                })}
              </span>
            </div>
            {quest.reminderTiming !== 'none' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500 flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Erinnerung
                </span>
                <span className="text-white font-medium">
                  {quest.reminderTiming === '1h' ? '1 Stunde vorher' : 
                   quest.reminderTiming === '2h' ? '2 Stunden vorher' :
                   quest.reminderTiming === '1d' ? '1 Tag vorher' :
                   quest.reminderTiming === '2d' ? '2 Tage vorher' : ''}
                </span>
              </div>
            )}
            {quest.recurrence && quest.recurrence !== 'none' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500 flex items-center gap-2">
                  <Repeat className="w-4 h-4" />
                  Wiederholung
                </span>
                <span className="text-amber-500 font-medium">
                  {quest.recurrence === 'daily' ? 'Täglich' : 
                   quest.recurrence === 'weekly' ? 'Wöchentlich' : 
                   'Monatlich'}
                </span>
              </div>
            )}
            
            {!quest.completed && (
              <div className="pt-3 mt-3 border-t border-neutral-800 flex flex-col gap-2">
                <a 
                  href={getGoogleCalendarLink(quest)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-300 hover:text-white transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Zu Google Kalender hinzufügen
                </a>
                {quest.dueDate && (
                  <button 
                    onClick={() => downloadICS([quest], `${quest.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`)}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-neutral-300 hover:text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Als .ics herunterladen (Apple/Outlook)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          {quest.completed && onReopen && (
            <button 
              onClick={() => { onReopen(quest.id); onClose(); }}
              className="flex-1 bg-amber-500 text-neutral-950 py-3 rounded-xl font-bold hover:bg-amber-400 transition-colors"
            >
              Wieder eröffnen
            </button>
          )}
          <button 
            onClick={onClose}
            className={cn(
              "flex-1 bg-neutral-800 text-white py-3 rounded-xl font-bold hover:bg-neutral-700 transition-colors",
              quest.completed && "flex-[0.5]"
            )}
          >
            Schließen
          </button>
          <button 
            onClick={onDeleteRequest}
            className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors"
            title="Quest löschen"
          >
            <Trash2 className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
