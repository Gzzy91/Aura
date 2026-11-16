import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import {
  Shield,
  Sword,
  User as UserIcon,
  Crown,
  Shirt,
  Lock,
  CheckCircle2,
  Gem,
  Footprints,
  Activity,
  Wand,
  Flame,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Equipment, Quest, Skin, UserStats } from '@/types';
import { AvatarVisual, getAvatarTier } from '@/components/AvatarVisual';
import { ProgressBar } from '@/components/ui/ProgressBar';

type EquipmentCategory = 'head' | 'body' | 'legs' | 'feet' | 'weapon' | 'shield' | 'accessory';

interface UnlockEvaluation {
  unlocked: boolean;
  progress: number;
  progressText: string;
}

interface DynamicEquipment extends Equipment {
  evaluate: (stats: UserStats, quests: Quest[]) => UnlockEvaluation;
}

interface DynamicSkin extends Skin {
  evaluate: (stats: UserStats, quests: Quest[]) => UnlockEvaluation;
}

const getCompletedQuestsCount = (quests: Quest[], skill?: string) =>
  quests.filter(
    (q) =>
      q.completed &&
      !q.failed &&
      q.type !== 'habit' &&
      (!skill || q.skill === skill)
  ).length;

const EQUIPMENT: DynamicEquipment[] = [
  {
    id: 'leather-pants',
    name: 'Lederhosen',
    description: 'Bequem und flexibel für tägliche Routinen.',
    bonus: 'Starter-Ausrüstung · +5 Ausdauer-Basis',
    unlockCondition: 'Von Beginn an verfügbar',
    category: 'legs',
    rarity: 'common',
    icon: 'Activity',
    unlocked: true,
    evaluate: () => ({ unlocked: true, progress: 100, progressText: 'Freigeschaltet' }),
  },
  {
    id: 'leather-boots',
    name: 'Lederstiefel',
    description: 'Robuste Stiefel für den Einstieg in deine Quests.',
    bonus: 'Starter-Ausrüstung · +2 Tempo',
    unlockCondition: 'Von Beginn an verfügbar',
    category: 'feet',
    rarity: 'common',
    icon: 'Footprints',
    unlocked: true,
    evaluate: () => ({ unlocked: true, progress: 100, progressText: 'Freigeschaltet' }),
  },
  {
    id: 'wooden-sword',
    name: 'Übungsklinge',
    description: 'Solides Trainingsgerät für die ersten Herausforderungen.',
    bonus: 'Starter-Ausrüstung · Fokus-Start',
    unlockCondition: 'Von Beginn an verfügbar',
    category: 'weapon',
    rarity: 'common',
    icon: 'Sword',
    unlocked: true,
    evaluate: () => ({ unlocked: true, progress: 100, progressText: 'Freigeschaltet' }),
  },
  {
    id: 'wooden-shield',
    name: 'Eichenschild',
    description: 'Schützt deine Fokus-Phasen vor Ablenkungen.',
    bonus: 'Starter-Ausrüstung · Fokus-Schutz',
    unlockCondition: 'Von Beginn an verfügbar',
    category: 'shield',
    rarity: 'common',
    icon: 'Shield',
    unlocked: true,
    evaluate: () => ({ unlocked: true, progress: 100, progressText: 'Freigeschaltet' }),
  },
  {
    id: 'iron-helmet',
    name: 'Eisenhelm',
    description: 'Ein geschmiedeter Helm für mentale Standhaftigkeit.',
    bonus: 'Meilenstein Level 5',
    unlockCondition: 'Erreiche Level 5',
    category: 'head',
    rarity: 'uncommon',
    icon: 'Crown',
    unlocked: false,
    evaluate: (stats) => ({
      unlocked: stats.level >= 5,
      progress: Math.min(100, Math.round((stats.level / 5) * 100)),
      progressText: `Level ${Math.min(stats.level, 5)} / 5`,
    }),
  },
  {
    id: 'steel-plate',
    name: 'Stahlbrustplatte',
    description: 'Schwere Rüstung für anhaltende Trainingsdisziplin.',
    bonus: 'Meilenstein 10 Fitness-Quests',
    unlockCondition: 'Schließe 10 Fitness-Quests ab',
    category: 'body',
    rarity: 'uncommon',
    icon: 'Shirt',
    unlocked: false,
    evaluate: (_stats, quests) => {
      const count = getCompletedQuestsCount(quests, 'Fitness');
      return {
        unlocked: count >= 10,
        progress: Math.min(100, Math.round((count / 10) * 100)),
        progressText: `${Math.min(count, 10)} / 10 Fitness-Quests`,
      };
    },
  },
  {
    id: 'focus-ring',
    name: 'Ring des Fokus',
    description: 'Zeichen tiefer, ungestörter Konzentration.',
    bonus: 'Meilenstein Fokus Level 5',
    unlockCondition: 'Erreiche Level 5 in Fokus',
    category: 'accessory',
    rarity: 'rare',
    icon: 'Gem',
    unlocked: false,
    evaluate: (stats) => {
      const lv = stats.skills.Fokus?.level || 1;
      return {
        unlocked: lv >= 5,
        progress: Math.min(100, Math.round((lv / 5) * 100)),
        progressText: `Fokus Level ${Math.min(lv, 5)} / 5`,
      };
    },
  },
  {
    id: 'magic-wand',
    name: 'Stab der Weisheit',
    description: 'Ein Artefakt für kontinuierliches Lernen und Reflexion.',
    bonus: 'Meilenstein Wissen Level 8',
    unlockCondition: 'Erreiche Level 8 in Wissen',
    category: 'weapon',
    rarity: 'epic',
    icon: 'Wand',
    unlocked: false,
    evaluate: (stats) => {
      const lv = stats.skills.Wissen?.level || 1;
      return {
        unlocked: lv >= 8,
        progress: Math.min(100, Math.round((lv / 8) * 100)),
        progressText: `Wissen Level ${Math.min(lv, 8)} / 8`,
      };
    },
  },
  {
    id: 'winged-boots',
    name: 'Geflügelte Stiefel',
    description: 'Für außergewöhnliche Beständigkeit über viele Tage.',
    bonus: 'Meilenstein 50 Quests',
    unlockCondition: 'Schließe 50 Quests ab',
    category: 'feet',
    rarity: 'epic',
    icon: 'Footprints',
    unlocked: false,
    evaluate: (_stats, quests) => {
      const count = getCompletedQuestsCount(quests);
      return {
        unlocked: count >= 50,
        progress: Math.min(100, Math.round((count / 50) * 100)),
        progressText: `${Math.min(count, 50)} / 50 Quests`,
      };
    },
  },
  {
    id: 'flame-sword',
    name: 'Flammenschwert',
    description: 'Symbol höchster körperlicher und mentaler Energie.',
    bonus: 'Meilenstein Fitness Level 15',
    unlockCondition: 'Erreiche Level 15 in Fitness',
    category: 'weapon',
    rarity: 'legendary',
    icon: 'Flame',
    unlocked: false,
    evaluate: (stats) => {
      const lv = stats.skills.Fitness?.level || 1;
      return {
        unlocked: lv >= 15,
        progress: Math.min(100, Math.round((lv / 15) * 100)),
        progressText: `Fitness Level ${Math.min(lv, 15)} / 15`,
      };
    },
  },
  {
    id: 'golden-crown',
    name: 'Goldene Krone',
    description: 'Ein Symbol für langfristige Meisterschaft.',
    bonus: 'Meilenstein Gesamt-Level 25',
    unlockCondition: 'Erreiche Level 25',
    category: 'head',
    rarity: 'legendary',
    icon: 'Crown',
    unlocked: false,
    evaluate: (stats) => ({
      unlocked: stats.level >= 25,
      progress: Math.min(100, Math.round((stats.level / 25) * 100)),
      progressText: `Level ${Math.min(stats.level, 25)} / 25`,
    }),
  },
];

const SKINS: DynamicSkin[] = [
  {
    id: 'default',
    name: 'Standard',
    description: 'Klares, klassisches Aura-Emblem.',
    bonus: 'Standard-Erscheinungsbild',
    unlockCondition: 'Von Beginn an verfügbar',
    rarity: 'common',
    previewColor: 'bg-neutral-500',
    unlocked: true,
    evaluate: () => ({ unlocked: true, progress: 100, progressText: 'Freigeschaltet' }),
  },
  {
    id: 'shadow',
    name: 'Schattenläufer',
    description: 'Tiefes Indigo für ruhige, fokussierte Arbeit.',
    bonus: 'Fokus-Meilenstein',
    unlockCondition: 'Erreiche Level 5 in Fokus',
    rarity: 'rare',
    previewColor: 'bg-indigo-600',
    unlocked: false,
    evaluate: (stats) => {
      const lv = stats.skills.Fokus?.level || 1;
      return {
        unlocked: lv >= 5,
        progress: Math.min(100, Math.round((lv / 5) * 100)),
        progressText: `Fokus Level ${Math.min(lv, 5)} / 5`,
      };
    },
  },
  {
    id: 'paladin',
    name: 'Lichtritter',
    description: 'Goldener Akzent für beständige Disziplin.',
    bonus: 'Disziplin-Meilenstein',
    unlockCondition: 'Erreiche Level 5 in Disziplin',
    rarity: 'rare',
    previewColor: 'bg-amber-500',
    unlocked: false,
    evaluate: (stats) => {
      const lv = stats.skills.Disziplin?.level || 1;
      return {
        unlocked: lv >= 5,
        progress: Math.min(100, Math.round((lv / 5) * 100)),
        progressText: `Disziplin Level ${Math.min(lv, 5)} / 5`,
      };
    },
  },
  {
    id: 'fire-mage',
    name: 'Flammenwächter',
    description: 'Kraftvolles Rot für hohe Trainingsintensität.',
    bonus: 'Fitness-Meilenstein',
    unlockCondition: 'Erreiche Level 10 in Fitness',
    rarity: 'epic',
    previewColor: 'bg-red-600',
    unlocked: false,
    evaluate: (stats) => {
      const lv = stats.skills.Fitness?.level || 1;
      return {
        unlocked: lv >= 10,
        progress: Math.min(100, Math.round((lv / 10) * 100)),
        progressText: `Fitness Level ${Math.min(lv, 10)} / 10`,
      };
    },
  },
  {
    id: 'nature-spirit',
    name: 'Naturgeist',
    description: 'Smaragdgrün für Balance und soziale Verbundenheit.',
    bonus: 'Soziales-Meilenstein',
    unlockCondition: 'Erreiche Level 10 in Soziales',
    rarity: 'epic',
    previewColor: 'bg-emerald-500',
    unlocked: false,
    evaluate: (stats) => {
      const lv = stats.skills.Soziales?.level || 1;
      return {
        unlocked: lv >= 10,
        progress: Math.min(100, Math.round((lv / 10) * 100)),
        progressText: `Soziales Level ${Math.min(lv, 10)} / 10`,
      };
    },
  },
  {
    id: 'cyber-ninja',
    name: 'Cyber-Platin',
    description: 'Cyan-Akzent für höchste Meisterschaft.',
    bonus: 'Gesamt-Meilenstein',
    unlockCondition: 'Erreiche Level 20',
    rarity: 'legendary',
    previewColor: 'bg-cyan-400',
    unlocked: false,
    evaluate: (stats) => ({
      unlocked: stats.level >= 20,
      progress: Math.min(100, Math.round((stats.level / 20) * 100)),
      progressText: `Level ${Math.min(stats.level, 20)} / 20`,
    }),
  },
];

const RARITY_STYLES = {
  common: { text: 'text-neutral-400', badge: 'text-neutral-400 border-neutral-800 bg-neutral-900', label: 'Standard' },
  uncommon: { text: 'text-emerald-400', badge: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', label: 'Ungewöhnlich' },
  rare: { text: 'text-sky-400', badge: 'text-sky-400 border-sky-500/30 bg-sky-500/10', label: 'Selten' },
  epic: { text: 'text-purple-400', badge: 'text-purple-400 border-purple-500/30 bg-purple-500/10', label: 'Episch' },
  legendary: { text: 'text-amber-400', badge: 'text-amber-400 border-amber-500/30 bg-amber-500/10', label: 'Legendär' },
};

const CATEGORIES: { id: EquipmentCategory; icon: React.ElementType; label: string }[] = [
  { id: 'head', icon: Crown, label: 'Kopf' },
  { id: 'body', icon: Shirt, label: 'Körper' },
  { id: 'legs', icon: Activity, label: 'Beine' },
  { id: 'feet', icon: Footprints, label: 'Füße' },
  { id: 'weapon', icon: Sword, label: 'Waffe' },
  { id: 'shield', icon: Shield, label: 'Schild' },
  { id: 'accessory', icon: Gem, label: 'Accessoire' },
];

function getCategoryIcon(cat: EquipmentCategory, className = 'w-5 h-5') {
  switch (cat) {
    case 'head':
      return <Crown className={className} />;
    case 'body':
      return <Shirt className={className} />;
    case 'legs':
      return <Activity className={className} />;
    case 'feet':
      return <Footprints className={className} />;
    case 'weapon':
      return <Sword className={className} />;
    case 'shield':
      return <Shield className={className} />;
    case 'accessory':
      return <Gem className={className} />;
  }
}

export function Avatar() {
  const { stats, quests, equipItem, setActiveSkin } = useStore();
  const [activeCategory, setActiveCategory] = useState<EquipmentCategory>('weapon');
  const [inspectedItem, setInspectedItem] = useState<{
    kind: 'skin' | 'equipment';
    id: string;
  }>({ kind: 'skin', id: stats.activeSkinId || 'default' });

  const equippedItems: Record<EquipmentCategory, string | null> = {
    head: null,
    body: null,
    legs: null,
    feet: null,
    weapon: null,
    shield: null,
    accessory: null,
    ...(stats.equippedItems || {}),
  };

  const evaluatedSkins = useMemo(
    () =>
      SKINS.map((skin) => ({
        ...skin,
        eval: skin.evaluate(stats, quests),
      })),
    [stats, quests]
  );

  const evaluatedEquipment = useMemo(
    () =>
      EQUIPMENT.map((item) => ({
        ...item,
        eval: item.evaluate(stats, quests),
      })),
    [stats, quests]
  );

  const unlockedSkinsCount = evaluatedSkins.filter((s) => s.eval.unlocked).length;
  const unlockedEquipmentCount = evaluatedEquipment.filter((e) => e.eval.unlocked).length;
  const tier = getAvatarTier(stats.level);

  const selectedDetail = useMemo(() => {
    if (inspectedItem.kind === 'skin') {
      const found = evaluatedSkins.find((s) => s.id === inspectedItem.id) || evaluatedSkins[0];
      return { kind: 'skin' as const, item: found };
    }
    const found =
      evaluatedEquipment.find((e) => e.id === inspectedItem.id) || evaluatedEquipment[0];
    return { kind: 'equipment' as const, item: found };
  }, [inspectedItem, evaluatedSkins, evaluatedEquipment]);

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Avatar &amp; Meilensteine
          </h2>
          <p className="text-sm text-neutral-400">
            Schalte neue Designs und Ausrüstung über deine Level &amp; Quests frei
          </p>
        </div>
        <div className="text-xs font-mono text-neutral-400 tabular-nums">
          {unlockedSkinsCount}/{SKINS.length} Designs · {unlockedEquipmentCount}/{EQUIPMENT.length} Ausrüstung
        </div>
      </header>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left: Avatar Showcase & Equipped Loadout */}
        <div className="lg:col-span-5 bg-neutral-900 rounded-2xl border border-neutral-800 p-6 flex flex-col items-center gap-6">
          <div className="pt-4 pb-2 flex flex-col items-center text-center">
            <AvatarVisual
              level={stats.level}
              size="xl"
              skinId={stats.activeSkinId || 'default'}
            />
            <h3 className="text-xl font-bold text-white mt-5">
              {tier.name}-Rang · Level {stats.level}
            </h3>
            <p className="text-xs text-neutral-400 mt-1 font-mono tabular-nums">
              {stats.xp} / {stats.xpToNextLevel} EP bis zum nächsten Level
            </p>
          </div>

          {/* Clean 7-Slot Equipped Loadout */}
          <div className="w-full pt-4 border-t border-neutral-800 space-y-2.5">
            <div className="text-xs font-semibold text-neutral-400">
              Ausgerüstete Slots
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => {
                const itemId = equippedItems[cat.id];
                const eq = itemId ? evaluatedEquipment.find((e) => e.id === itemId) : null;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat.id);
                      if (eq) {
                        setInspectedItem({ kind: 'equipment', id: eq.id });
                      }
                    }}
                    className={cn(
                      'flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-colors',
                      activeCategory === cat.id
                        ? 'bg-neutral-800/80 border-amber-500/40'
                        : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        eq
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-neutral-900 text-neutral-600'
                      )}
                    >
                      {getCategoryIcon(cat.id, 'w-4 h-4')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-neutral-500">{cat.label}</div>
                      <div
                        className={cn(
                          'text-xs font-semibold truncate',
                          eq ? 'text-white' : 'text-neutral-600'
                        )}
                      >
                        {eq ? eq.name : 'Leer'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Skins, Equipment & Inspector */}
        <div className="lg:col-span-7 space-y-5">
          {/* Inspector Panel (Touch & Desktop friendly, zero clipping) */}
          <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-neutral-400">
                  <span className={cn('font-semibold', RARITY_STYLES[selectedDetail.item.rarity].text)}>
                    {RARITY_STYLES[selectedDetail.item.rarity].label}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {selectedDetail.kind === 'skin' ? 'Design' : 'Ausrüstung'}
                  </span>
                </div>
                <h4 className="text-lg font-bold text-white mt-0.5">
                  {selectedDetail.item.name}
                </h4>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  {selectedDetail.item.description}
                </p>
              </div>

              {selectedDetail.item.eval.unlocked ? (
                selectedDetail.kind === 'skin' ? (
                  <button
                    type="button"
                    onClick={() => setActiveSkin(selectedDetail.item.id)}
                    disabled={stats.activeSkinId === selectedDetail.item.id}
                    className={cn(
                      'px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 whitespace-nowrap',
                      stats.activeSkinId === selectedDetail.item.id
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500 hover:bg-amber-400 text-neutral-950'
                    )}
                  >
                    {stats.activeSkinId === selectedDetail.item.id ? 'Aktiv' : 'Aktivieren'}
                  </button>
                ) : (
                  (() => {
                    const eq = selectedDetail.item as DynamicEquipment & { eval: UnlockEvaluation };
                    const isEquipped = equippedItems[eq.category] === eq.id;
                    return (
                      <button
                        type="button"
                        onClick={() => equipItem(eq.category, isEquipped ? null : eq.id)}
                        className={cn(
                          'px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 whitespace-nowrap',
                          isEquipped
                            ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
                            : 'bg-amber-500 hover:bg-amber-400 text-neutral-950'
                        )}
                      >
                        {isEquipped ? 'Ablegen' : 'Ausrüsten'}
                      </button>
                    );
                  })()
                )
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 shrink-0">
                  <Lock className="w-3.5 h-3.5" />
                  Gesperrt
                </span>
              )}
            </div>

            <div className="pt-3 border-t border-neutral-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-400">{selectedDetail.item.unlockCondition}</span>
                <span className="font-mono font-semibold text-neutral-300 tabular-nums">
                  {selectedDetail.item.eval.progressText}
                </span>
              </div>
              <ProgressBar
                progress={selectedDetail.item.eval.progress}
                colorClass={selectedDetail.item.eval.unlocked ? 'bg-emerald-500' : 'bg-amber-500'}
                className="h-1.5"
              />
            </div>
          </div>

          {/* Skins Grid */}
          <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
            <h3 className="text-base font-bold mb-3.5 flex items-center gap-2 text-white">
              <UserIcon className="w-4 h-4 text-amber-500" />
              Emblem-Designs
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {evaluatedSkins.map((skin) => {
                const isActive = stats.activeSkinId === skin.id;
                const isInspected =
                  inspectedItem.kind === 'skin' && inspectedItem.id === skin.id;
                return (
                  <button
                    key={skin.id}
                    type="button"
                    onClick={() => {
                      setInspectedItem({ kind: 'skin', id: skin.id });
                      if (skin.eval.unlocked) setActiveSkin(skin.id);
                    }}
                    className={cn(
                      'p-3 rounded-xl border flex flex-col items-center justify-center gap-2 relative transition-all min-h-[76px]',
                      isActive
                        ? 'border-amber-500 bg-amber-500/10'
                        : isInspected
                          ? 'border-neutral-600 bg-neutral-800/70'
                          : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700',
                      !skin.eval.unlocked && 'opacity-60'
                    )}
                  >
                    <div className={cn('w-7 h-7 rounded-full', skin.previewColor)} />
                    <span className="text-[11px] font-medium text-neutral-300 truncate w-full text-center">
                      {skin.name}
                    </span>
                    {!skin.eval.unlocked && (
                      <Lock className="w-3.5 h-3.5 text-neutral-400 absolute top-2 right-2" />
                    )}
                    {isActive && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 absolute top-2 right-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Equipment Section */}
          <section className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold flex items-center gap-2 text-white">
                <Sword className="w-4 h-4 text-amber-500" />
                Ausrüstung
              </h3>
              {equippedItems[activeCategory] && (
                <button
                  type="button"
                  onClick={() => equipItem(activeCategory, null)}
                  className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  Slot leeren
                </button>
              )}
            </div>

            <div className="grid grid-cols-7 gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  title={cat.label}
                  aria-label={cat.label}
                  className={cn(
                    'py-2 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 text-[10px] font-medium',
                    activeCategory === cat.id
                      ? 'bg-neutral-800 text-amber-400'
                      : 'text-neutral-500 hover:text-neutral-200'
                  )}
                >
                  <cat.icon className="w-4 h-4" />
                  <span className="hidden sm:inline truncate max-w-full px-1">{cat.label}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {evaluatedEquipment
                .filter((e) => e.category === activeCategory)
                .map((item) => {
                  const isEquipped = equippedItems[activeCategory] === item.id;
                  const isInspected =
                    inspectedItem.kind === 'equipment' && inspectedItem.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setInspectedItem({ kind: 'equipment', id: item.id });
                        if (item.eval.unlocked) {
                          equipItem(activeCategory, isEquipped ? null : item.id);
                        }
                      }}
                      className={cn(
                        'p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 relative transition-all text-center min-h-[104px]',
                        isEquipped
                          ? 'border-amber-500 bg-amber-500/10'
                          : isInspected
                            ? 'border-neutral-600 bg-neutral-800/70'
                            : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700',
                        !item.eval.unlocked && 'opacity-65'
                      )}
                    >
                      <div className={cn('p-2.5 rounded-lg border', RARITY_STYLES[item.rarity].badge)}>
                        {getCategoryIcon(item.category, 'w-5 h-5')}
                      </div>
                      <span className="text-xs font-semibold text-neutral-200 truncate w-full">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-neutral-500 truncate w-full">
                        {item.eval.progressText}
                      </span>

                      {!item.eval.unlocked && (
                        <Lock className="w-3.5 h-3.5 text-neutral-400 absolute top-2.5 right-2.5" />
                      )}
                      {isEquipped && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 absolute top-2.5 right-2.5" />
                      )}
                    </button>
                  );
                })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
