import { useState, useEffect } from 'react';
import { X, Save, Trash2, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Vision } from '@/types';
import { toast } from 'sonner';

interface VisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  visionId: string | null;
}

const EMOJI_OPTIONS = ['🚀', '💪', '🧠', '💼', '🧘‍♂️', '🏖️', '🏆', '📚', '💰', '🏡', '🎨', '❤️'];

export function VisionModal({ isOpen, onClose, visionId }: VisionModalProps) {
  const { visions, addVision, updateVision, deleteVision } = useStore();
  
  const [vision, setVision] = useState<Partial<Vision>>({
    title: '',
    description: '',
    icon: '🚀',
    completed: false
  });

  useEffect(() => {
    if (visionId) {
      const existing = visions.find(v => v.id === visionId);
      if (existing) setVision(existing);
    } else {
      setVision({
        title: '',
        description: '',
        icon: '🚀',
        completed: false
      });
    }
  }, [visionId, visions]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vision.title) return;

    if (visionId) {
      updateVision(visionId, vision as Vision);
      toast.success('Lebensziel aktualisiert');
    } else {
      addVision(vision as Omit<Vision, 'id' | 'createdAt' | 'completed'>);
      toast.success('Neues Lebensziel gesetzt', { icon: vision.icon });
    }
    onClose();
  };

  const handleDelete = () => {
    if (visionId && confirm('Möchtest du dieses Ziel wirklich verwerfen?')) {
      deleteVision(visionId);
      toast.success('Lebensziel verworfen');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 overflow-y-auto">
      <div className="flex min-h-full items-end sm:items-center justify-center p-4 sm:p-6 pb-24 sm:pb-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl relative">
          <header className="flex justify-between items-center p-6 border-b border-neutral-800">
            <h3 className="text-xl font-bold flex items-center gap-2">
              {visionId ? 'Ziel anpassen' : 'Neues Lebensziel'}
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-2">Symbol</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setVision({ ...vision, icon: emoji })}
                  className={`w-12 h-12 rounded-xl text-2xl flex items-center justify-center transition-all ${
                    vision.icon === emoji ? 'bg-blue-500/20 border border-blue-500 scale-110' : 'bg-neutral-800 border border-transparent hover:bg-neutral-700'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-2">Titel</label>
            <input
              type="text"
              required
              value={vision.title}
              onChange={e => setVision({ ...vision, title: e.target.value })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
              placeholder="z.B. Einen Marathon laufen"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-2">Beschreibung</label>
            <textarea
              required
              value={vision.description}
              onChange={e => setVision({ ...vision, description: e.target.value })}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px] resize-none"
              placeholder="Warum ist dir dieses Ziel wichtig?"
            />
          </div>

          {visionId && (
            <label className="flex items-center gap-3 p-4 bg-neutral-950/50 border border-neutral-800 rounded-xl cursor-pointer hover:bg-neutral-800 transition-colors">
              <input
                type="checkbox"
                checked={vision.completed}
                onChange={e => setVision({ 
                  ...vision, 
                  completed: e.target.checked,
                  completedAt: e.target.checked ? Date.now() : undefined
                })}
                className="w-5 h-5 rounded border-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-900 bg-neutral-900"
              />
              <span className="font-medium flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-neutral-400" />
                Ziel als "Erreicht" markieren
              </span>
            </label>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all"
            >
              <Save className="w-5 h-5" />
              Speichern
            </button>
            {visionId && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-500 rounded-xl transition-colors border border-transparent hover:border-red-500/50"
                title="Ziel verwerfen"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
