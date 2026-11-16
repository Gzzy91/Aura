import { useState } from 'react';
import { Compass, Plus, Target, CheckCircle2, Circle, Edit2 } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { VisionModal } from '@/components/VisionModal';
import { QuestModal } from '@/components/QuestModal';
import { toast } from 'sonner';

export function Visions() {
  const { visions, quests, completeQuest, addQuest } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVisionId, setEditingVisionId] = useState<string | null>(null);
  const [questForVisionId, setQuestForVisionId] = useState<string | null>(null);

  const getVisionStats = (visionId: string) => {
    const allLinked = quests.filter((q) => q.visionId === visionId);
    const completedCount = allLinked.filter((q) => q.completed && !q.failed).length;
    const progress =
      allLinked.length === 0 ? 0 : Math.round((completedCount / allLinked.length) * 100);
    return {
      totalCount: allLinked.length,
      completedCount,
      openQuests: allLinked.filter((q) => !q.completed),
      progress,
    };
  };

  const handleEdit = (id: string) => {
    setEditingVisionId(id);
    setIsModalOpen(true);
  };

  const activeVisions = visions
    .filter((v) => !v.completed)
    .sort((a, b) => b.createdAt - a.createdAt);
  const completedVisions = visions
    .filter((v) => v.completed)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-8 flex justify-between items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Compass className="w-8 h-8 text-blue-500" />
            Lebensziele
          </h2>
          <p className="text-neutral-400">
            Dein Nordstern. Verknüpfe tägliche Quests, um große Ziele planbar zu erreichen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingVisionId(null);
            setIsModalOpen(true);
          }}
          className="bg-blue-500 hover:bg-blue-400 text-neutral-950 px-4 py-2.5 rounded-xl font-bold transition-colors flex items-center gap-2 min-h-[44px] shrink-0"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Neues Ziel</span>
        </button>
      </header>

      {visions.length === 0 ? (
        <div className="text-center py-20 bg-neutral-900 border border-neutral-800 rounded-3xl px-4">
          <Compass className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Wohin geht die Reise?</h3>
          <p className="text-neutral-400 mb-6 max-w-md mx-auto text-sm">
            Gute Quests brauchen eine Richtung. Erstelle langfristige Lebensziele und verknüpfe
            tägliche Aufgaben mit ihnen.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingVisionId(null);
              setIsModalOpen(true);
            }}
            className="bg-blue-500 hover:bg-blue-400 text-neutral-950 px-6 py-3 rounded-xl font-bold transition-colors min-h-[44px]"
          >
            Erstes Lebensziel setzen
          </button>
        </div>
      ) : (
        <div className="space-y-12">
          {activeVisions.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {activeVisions.map((vision) => {
                const { totalCount, completedCount, openQuests, progress } = getVisionStats(
                  vision.id
                );
                return (
                  <div
                    key={vision.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 flex flex-col justify-between gap-6"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-3 mb-5">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-12 h-12 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-2xl shrink-0">
                            {vision.icon}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-xl text-white truncate">
                              {vision.title}
                            </h3>
                            <p className="text-neutral-400 text-sm line-clamp-2 mt-0.5">
                              {vision.description}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEdit(vision.id)}
                          className="text-neutral-400 hover:text-white px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 min-h-[36px]"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Bearbeiten</span>
                        </button>
                      </div>

                      <div className="mb-6">
                        <div className="flex justify-between items-center text-xs mb-2">
                          <span className="text-neutral-400 font-bold uppercase tracking-wider">
                            Fortschritt{' '}
                            <span className="text-neutral-500 font-mono tabular-nums ml-1">
                              ({completedCount}/{totalCount} Quests)
                            </span>
                          </span>
                          <span className="font-mono font-bold text-blue-400 tabular-nums">
                            {progress}%
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-neutral-950 border border-neutral-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-bold text-neutral-400 tracking-wider uppercase flex items-center gap-2">
                            <Target className="w-4 h-4 text-blue-400" />
                            Offene Quests ({openQuests.length})
                          </h4>
                          <button
                            type="button"
                            onClick={() => setQuestForVisionId(vision.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Quest verknüpfen
                          </button>
                        </div>

                        {openQuests.length > 0 ? (
                          <ul className="space-y-2">
                            {openQuests.slice(0, 3).map((quest) => (
                              <li
                                key={quest.id}
                                className="flex items-center gap-3 p-3 rounded-xl bg-neutral-950 border border-neutral-800"
                              >
                                <button
                                  type="button"
                                  onClick={() => completeQuest(quest.id)}
                                  className="text-neutral-500 hover:text-amber-500 transition-colors p-0.5"
                                  aria-label={`Quest ${quest.title} abschließen`}
                                >
                                  <Circle className="w-5 h-5" />
                                </button>
                                <span className="font-medium text-sm flex-1 truncate text-neutral-100">
                                  {quest.title}
                                </span>
                                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md tabular-nums">
                                  +{quest.xpReward} EP
                                </span>
                              </li>
                            ))}
                            {openQuests.length > 3 && (
                              <li className="text-center text-xs text-neutral-500 pt-1 font-medium tabular-nums">
                                + {openQuests.length - 3} weitere offene Quests
                              </li>
                            )}
                          </ul>
                        ) : (
                          <div className="text-sm text-neutral-500 bg-neutral-950/60 p-4 rounded-xl border border-dashed border-neutral-800 text-center">
                            Keine offenen Quests verknüpft. Erstelle direkt eine Quest für dieses Ziel.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completedVisions.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-neutral-300 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Erreichte Lebensziele
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {completedVisions.map((vision) => (
                  <button
                    type="button"
                    key={vision.id}
                    onClick={() => handleEdit(vision.id)}
                    className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-4 flex items-center gap-4 text-left opacity-75 hover:opacity-100 transition-opacity"
                  >
                    <div className="text-3xl shrink-0">{vision.icon}</div>
                    <div className="min-w-0">
                      <h4 className="font-bold line-through text-neutral-300 truncate">
                        {vision.title}
                      </h4>
                      {vision.completedAt && (
                        <p className="text-xs text-neutral-500 tabular-nums mt-0.5">
                          Erreicht am {new Date(vision.completedAt).toLocaleDateString('de-DE')}
                        </p>
                      )}
                    </div>
                  </button>
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

      {questForVisionId && (
        <QuestModal
          isOpen={!!questForVisionId}
          initialVisionId={questForVisionId}
          initialDate={new Date()}
          onClose={() => setQuestForVisionId(null)}
          onSave={(questData) => {
            addQuest(questData);
            toast.success('Quest mit Lebensziel verknüpft');
          }}
        />
      )}
    </div>
  );
}
