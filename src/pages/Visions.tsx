import { useState } from 'react';
import { Compass, Plus, Target, CheckCircle2, Circle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { VisionModal } from '@/components/VisionModal';

export function Visions() {
  const { visions, quests, completeQuest } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVisionId, setEditingVisionId] = useState<string | null>(null);

  const calculateProgress = (visionId: string) => {
    const linkedQuests = quests.filter(q => q.visionId === visionId);
    if (linkedQuests.length === 0) return 0;
    const completed = linkedQuests.filter(q => q.completed).length;
    return Math.round((completed / linkedQuests.length) * 100);
  };

  const handleEdit = (id: string) => {
    setEditingVisionId(id);
    setIsModalOpen(true);
  };

  const activeVisions = visions.filter(v => !v.completed).sort((a,b) => b.createdAt - a.createdAt);
  const completedVisions = visions.filter(v => v.completed).sort((a,b) => (b.completedAt || 0) - (a.completedAt || 0));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Compass className="w-8 h-8 text-blue-500" />
            Lebensziele
          </h2>
          <p className="text-neutral-400">Dein Nordstern. Verknüpfe Quests, um diese Meisterwerke zu erreichen.</p>
        </div>
        <button
          onClick={() => {
            setEditingVisionId(null);
            setIsModalOpen(true);
          }}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Neues Ziel</span>
        </button>
      </header>

      {visions.length === 0 ? (
        <div className="text-center py-20 bg-neutral-900 border border-neutral-800 rounded-3xl">
          <Compass className="w-16 h-16 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Wohin geht die Reise?</h3>
          <p className="text-neutral-400 mb-6 max-w-md mx-auto">
            Gute Quests brauchen eine Richtung. Erstelle langfristige Lebensziele und verknüpfe tägliche Aufgaben mit ihnen.
          </p>
          <button
            onClick={() => {
              setEditingVisionId(null);
              setIsModalOpen(true);
            }}
            className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-3 rounded-xl font-medium transition-colors"
          >
            Erstes Lebensziel setzen
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {activeVisions.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {activeVisions.map(vision => {
                const progress = calculateProgress(vision.id);
                const linkedQuests = quests.filter(q => q.visionId === vision.id && !q.completed);
                return (
                  <div key={vision.id} className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
                    
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-2xl">
                          {vision.icon}
                        </div>
                        <div>
                          <h3 className="font-bold text-xl">{vision.title}</h3>
                          <p className="text-neutral-400 text-sm line-clamp-2">{vision.description}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleEdit(vision.id)}
                        className="text-neutral-500 hover:text-neutral-300 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        Bearbeiten
                      </button>
                    </div>

                    <div className="mb-6">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-neutral-400 font-medium tracking-wide">FORTSCHRITT</span>
                        <span className="font-bold text-blue-500">{progress}%</span>
                      </div>
                      <div className="h-3 w-full bg-neutral-800 border border-neutral-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out relative"
                          style={{ width: `${progress}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-neutral-500 tracking-wider uppercase mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Nächste Quests
                      </h4>
                      {linkedQuests.length > 0 ? (
                        <ul className="space-y-2">
                          {linkedQuests.slice(0, 3).map(quest => (
                            <li key={quest.id} className="flex items-center gap-3 p-3 rounded-xl bg-neutral-950/50 border border-neutral-800">
                              <button 
                                onClick={() => completeQuest(quest.id)}
                                className="text-neutral-500 hover:text-amber-500 transition-colors"
                              >
                                <Circle className="w-5 h-5" />
                              </button>
                              <span className="font-medium text-sm flex-1 truncate">{quest.title}</span>
                              <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md">
                                {quest.xpReward} EP
                              </span>
                            </li>
                          ))}
                          {linkedQuests.length > 3 && (
                            <li className="text-center text-xs text-neutral-500 pt-1 font-medium">
                              + {linkedQuests.length - 3} weitere Quests
                            </li>
                          )}
                        </ul>
                      ) : (
                        <div className="text-sm text-neutral-500 italic bg-neutral-950/50 p-4 rounded-xl border border-neutral-800 text-center">
                          Keine offenen Quests verknüpft.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completedVisions.length > 0 && (
             <div>
               <h3 className="text-lg font-bold text-neutral-400 mb-4 flex items-center gap-2">
                 <CheckCircle2 className="w-5 h-5" />
                 Erreichte Lebensziele
               </h3>
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                 {completedVisions.map(vision => (
                   <div key={vision.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex items-center gap-4 opacity-50 hover:opacity-100 transition-opacity">
                     <div className="text-3xl grayscale">{vision.icon}</div>
                     <div>
                       <h4 className="font-bold line-through">{vision.title}</h4>
                       {vision.completedAt && (
                         <p className="text-xs text-neutral-500">
                           {new Date(vision.completedAt).toLocaleDateString()}
                         </p>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
             </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <VisionModal 
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingVisionId(null);
          }}
          visionId={editingVisionId}
        />
      )}
    </div>
  );
}
