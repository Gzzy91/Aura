import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  Sword, 
  User as UserIcon, 
  Crown, 
  Shirt, 
  Info,
  Lock,
  CheckCircle2,
  Gem,
  Footprints,
  Activity,
  Wand,
  Flame
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Equipment, Skin } from '@/types';

const EQUIPMENT: Equipment[] = [
  {
    id: 'iron-helmet',
    name: 'Eisenhelm',
    description: 'Ein solider Helm aus geschmiedetem Eisen.',
    bonus: '+5 Fokus-Resistenz',
    unlockCondition: 'Erreiche Level 5',
    category: 'head',
    rarity: 'common',
    icon: 'Crown',
    unlocked: true,
  },
  {
    id: 'steel-plate',
    name: 'Stahlbrustplatte',
    description: 'Schwere Rüstung für maximalen Schutz.',
    bonus: '+10 Disziplin',
    unlockCondition: 'Schließe 10 Fitness-Quests ab',
    category: 'body',
    rarity: 'uncommon',
    icon: 'Shirt',
    unlocked: true,
  },
  {
    id: 'leather-pants',
    name: 'Lederhosen',
    description: 'Bequem und flexibel für lange Reisen.',
    bonus: '+5 Fitness',
    unlockCondition: 'Starter-Ausrüstung',
    category: 'legs',
    rarity: 'common',
    icon: 'Activity',
    unlocked: true,
  },
  {
    id: 'leather-boots',
    name: 'Lederstiefel',
    description: 'Einfache Stiefel für den Alltag.',
    bonus: '+2 Ausdauer',
    unlockCondition: 'Starter-Ausrüstung',
    category: 'feet',
    rarity: 'common',
    icon: 'Footprints',
    unlocked: true,
  },
  {
    id: 'wooden-sword',
    name: 'Holzschwert',
    description: 'Ein einfaches Übungsschwert.',
    bonus: '+2 Fitness-EP Gewinn',
    unlockCondition: 'Starter-Ausrüstung',
    category: 'weapon',
    rarity: 'common',
    icon: 'Sword',
    unlocked: true,
  },
  {
    id: 'wooden-shield',
    name: 'Holzschild',
    description: 'Ein stabiler Schild aus Eichenholz.',
    bonus: '+3 Fokus',
    unlockCondition: 'Starter-Ausrüstung',
    category: 'shield',
    rarity: 'common',
    icon: 'Shield',
    unlocked: true,
  },
  {
    id: 'focus-ring',
    name: 'Ring des Fokus',
    description: 'Ein magischer Ring, der die Konzentration stärkt.',
    bonus: '+15% Fokus-EP',
    unlockCondition: 'Erreiche Level 15 in Fokus',
    category: 'accessory',
    rarity: 'rare',
    icon: 'Gem',
    unlocked: false,
  },
  {
    id: 'golden-crown',
    name: 'Goldene Krone',
    description: 'Ein Symbol für wahre Meisterschaft.',
    bonus: '+20% EP-Bonus auf alle Quests',
    unlockCondition: 'Erreiche Level 50',
    category: 'head',
    rarity: 'legendary',
    icon: 'Crown',
    unlocked: false,
  },
  {
    id: 'flame-sword',
    name: 'Flammenschwert',
    description: 'Eine Klinge, die in ewigem Feuer brennt.',
    bonus: '+50% Fitness-EP',
    unlockCondition: 'Erreiche Level 30 in Fitness',
    category: 'weapon',
    rarity: 'legendary',
    icon: 'Flame',
    unlocked: false,
  },
  {
    id: 'winged-boots',
    name: 'Geflügelte Stiefel',
    description: 'Stiefel, die dich wie auf Wolken laufen lassen.',
    bonus: '+25% Bewegungsgeschwindigkeit',
    unlockCondition: 'Schließe 50 Quests ab',
    category: 'feet',
    rarity: 'epic',
    icon: 'Footprints',
    unlocked: false,
  },
  {
    id: 'magic-wand',
    name: 'Zauberstab der Weisheit',
    description: 'Ein antiker Stab voller Wissen.',
    bonus: '+30% Wissen-EP',
    unlockCondition: 'Erreiche Level 20 in Wissen',
    category: 'weapon',
    rarity: 'epic',
    icon: 'Wand',
    unlocked: false,
  }
];

const SKINS: Skin[] = [
  {
    id: 'default',
    name: 'Standard',
    description: 'Dein ursprüngliches Erscheinungsbild.',
    bonus: 'Keine Boni',
    unlockCondition: 'Von Beginn an verfügbar',
    rarity: 'common',
    previewColor: 'bg-neutral-500',
    unlocked: true,
  },
  {
    id: 'shadow',
    name: 'Schattenläufer',
    description: 'Verschmilz mit der Dunkelheit.',
    bonus: '+15% Fokus-EP',
    unlockCondition: 'Erreiche Level 10 in Fokus',
    rarity: 'rare',
    previewColor: 'bg-indigo-900',
    unlocked: false,
  },
  {
    id: 'paladin',
    name: 'Lichtritter',
    description: 'Ein strahlender Verfechter der Disziplin.',
    bonus: '+15% Disziplin-EP',
    unlockCondition: 'Erreiche Level 10 in Disziplin',
    rarity: 'rare',
    previewColor: 'bg-amber-500',
    unlocked: false,
  },
  {
    id: 'fire-mage',
    name: 'Feuermagier',
    description: 'Meister der Flammen und Zerstörung.',
    bonus: '+20% Fitness-EP',
    unlockCondition: 'Erreiche Level 20 in Fitness',
    rarity: 'epic',
    previewColor: 'bg-red-600',
    unlocked: false,
  },
  {
    id: 'nature-spirit',
    name: 'Naturgeist',
    description: 'Eins mit dem Wald und den Tieren.',
    bonus: '+20% Soziales-EP',
    unlockCondition: 'Erreiche Level 20 in Soziales',
    rarity: 'epic',
    previewColor: 'bg-emerald-500',
    unlocked: false,
  },
  {
    id: 'cyber-ninja',
    name: 'Cyber-Ninja',
    description: 'Technologisch verbesserter Assassine.',
    bonus: '+25% auf alle EP',
    unlockCondition: 'Erreiche Level 40',
    rarity: 'legendary',
    previewColor: 'bg-cyan-400',
    unlocked: false,
  }
];

const RARITY_COLORS = {
  common: 'text-neutral-400 border-neutral-800 bg-neutral-900/50',
  uncommon: 'text-emerald-400 border-emerald-900/30 bg-emerald-950/20',
  rare: 'text-blue-400 border-blue-900/30 bg-blue-950/20',
  epic: 'text-purple-400 border-purple-900/30 bg-purple-950/20',
  legendary: 'text-amber-400 border-amber-900/30 bg-amber-950/20',
};

interface TooltipProps {
  item: Equipment | Skin;
  children: React.ReactNode;
}

function Tooltip({ item, children }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div 
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-50 w-64 pointer-events-none"
          >
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-4 overflow-hidden">
              {/* Rarity Header */}
              <div className={cn(
                "text-[10px] uppercase tracking-widest font-bold mb-2",
                'rarity' in item ? RARITY_COLORS[item.rarity].split(' ')[0] : ''
              )}>
                {item.rarity}
              </div>
              
              <h4 className="text-white font-bold text-lg mb-1">{item.name}</h4>
              <p className="text-neutral-400 text-sm mb-3 leading-relaxed">
                {item.description}
              </p>
              
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <div className="mt-1 p-1 rounded-md bg-amber-500/10 text-amber-500">
                    <Sword className="w-3 h-3" />
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-500 uppercase font-bold">Bonus</div>
                    <div className="text-xs text-amber-200">{item.bonus}</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <div className="mt-1 p-1 rounded-md bg-blue-500/10 text-blue-500">
                    <Lock className="w-3 h-3" />
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-500 uppercase font-bold">Freischaltung</div>
                    <div className="text-xs text-blue-200">{item.unlockCondition}</div>
                  </div>
                </div>
              </div>

              {/* Decorative corner */}
              <div className={cn(
                "absolute -top-6 -right-6 w-12 h-12 rotate-45",
                'rarity' in item ? RARITY_COLORS[item.rarity].split(' ')[2] : ''
              )} />
            </div>
            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-8 border-transparent border-t-neutral-900" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Avatar() {
  const { stats, equipItem, setActiveSkin } = useStore();
  const [activeCategory, setActiveCategory] = useState<'head' | 'body' | 'legs' | 'feet' | 'weapon' | 'shield' | 'accessory'>('head');

  const categories = [
    { id: 'head', icon: Crown, label: 'Kopf' },
    { id: 'body', icon: Shirt, label: 'Körper' },
    { id: 'legs', icon: Activity, label: 'Beine' },
    { id: 'feet', icon: Footprints, label: 'Füße' },
    { id: 'weapon', icon: Sword, label: 'Waffe' },
    { id: 'shield', icon: Shield, label: 'Schild' },
    { id: 'accessory', icon: Gem, label: 'Accessoire' },
  ];

  const equippedItems = { 
    head: null, 
    body: null, 
    legs: null, 
    feet: null, 
    weapon: null, 
    shield: null, 
    accessory: null,
    ...(stats.equippedItems || {}) 
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Avatar-Anpassung</h2>
        <p className="text-neutral-400">Rüste dich für deine Quests aus</p>
      </header>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Avatar Preview */}
        <div className="bg-neutral-900 rounded-3xl border border-neutral-800 p-8 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
          {/* Background Glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />
          
          {/* Character Silhouette */}
          <div className="relative w-64 h-64 flex items-center justify-center mt-8">
            <div className={cn(
              "w-48 h-48 rounded-full flex items-center justify-center transition-colors duration-500 z-0",
              SKINS.find(s => s.id === stats.activeSkinId)?.previewColor || 'bg-neutral-800'
            )}>
              <UserIcon className="w-32 h-32 text-white/20" />
            </div>

            {/* Equipped Items Overlay (Visual representation) */}
            <AnimatePresence>
              {Object.entries(equippedItems).map(([category, itemId]) => {
                if (!itemId) return null;
                const item = EQUIPMENT.find(e => e.id === itemId);
                if (!item) return null;

                const getCategoryIcon = (cat: string) => {
                  switch(cat) {
                    case 'head': return <Crown className="w-8 h-8 text-amber-400" />;
                    case 'body': return <Shirt className="w-8 h-8 text-blue-400" />;
                    case 'legs': return <Activity className="w-8 h-8 text-orange-400" />;
                    case 'feet': return <Footprints className="w-8 h-8 text-stone-400" />;
                    case 'weapon': return <Sword className="w-8 h-8 text-red-400" />;
                    case 'shield': return <Shield className="w-8 h-8 text-emerald-400" />;
                    case 'accessory': return <Gem className="w-8 h-8 text-purple-400" />;
                    default: return null;
                  }
                };

                return (
                  <motion.div
                    key={category}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className={cn(
                      "absolute p-3 rounded-full bg-neutral-950 border border-neutral-800 shadow-xl z-10",
                      category === 'head' && "-top-6",
                      category === 'body' && "top-1/4",
                      category === 'legs' && "bottom-1/4",
                      category === 'feet' && "-bottom-6",
                      category === 'weapon' && "top-1/3 -right-10",
                      category === 'shield' && "top-1/3 -left-10",
                      category === 'accessory' && "top-0 -right-4 scale-75"
                    )}
                  >
                    {getCategoryIcon(category)}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <div className="mt-16 text-center z-10">
            <h3 className="text-xl font-bold text-white mb-2">Level {stats.level} Held</h3>
            <p className="text-neutral-400 text-sm max-w-xs">
              Deine Ausrüstung gewährt dir Boni auf deine täglichen Aktivitäten.
            </p>
          </div>
        </div>

        {/* Customization Tabs */}
        <div className="space-y-6">
          {/* Skins Section */}
          <section className="bg-neutral-900/50 rounded-2xl border border-neutral-800 p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-neutral-400" />
              Skins
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {SKINS.map((skin) => (
                <Tooltip key={skin.id} item={skin}>
                  <button
                    onClick={() => skin.unlocked && setActiveSkin(skin.id)}
                    className={cn(
                      "w-full aspect-square rounded-xl border-2 flex items-center justify-center relative transition-all",
                      stats.activeSkinId === skin.id 
                        ? "border-amber-500 bg-amber-500/10" 
                        : "border-neutral-800 bg-neutral-900 hover:border-neutral-700",
                      !skin.unlocked && "opacity-50 cursor-not-allowed grayscale"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-full", skin.previewColor)} />
                    {!skin.unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                        <Lock className="w-4 h-4 text-white" />
                      </div>
                    )}
                    {stats.activeSkinId === skin.id && (
                      <div className="absolute -top-2 -right-2 bg-amber-500 rounded-full p-1 shadow-lg">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                </Tooltip>
              ))}
            </div>
          </section>

          {/* Equipment Section */}
          <section className="bg-neutral-900/50 rounded-2xl border border-neutral-800 p-6">
            <div className="flex flex-col gap-4 mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Sword className="w-5 h-5 text-neutral-400" />
                Ausrüstung
              </h3>
              <div className="flex flex-wrap gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id as any)}
                    className={cn(
                      "p-2 rounded-md transition-colors flex-1 flex justify-center",
                      activeCategory === cat.id 
                        ? "bg-neutral-800 text-white" 
                        : "text-neutral-500 hover:text-neutral-300"
                    )}
                    title={cat.label}
                  >
                    <cat.icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {EQUIPMENT.filter(e => e.category === activeCategory).map((item) => (
                <Tooltip key={item.id} item={item}>
                  <button
                    onClick={() => item.unlocked && equipItem(activeCategory as any, equippedItems[activeCategory as keyof typeof equippedItems] === item.id ? null : item.id)}
                    className={cn(
                      "w-full aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-2 relative transition-all",
                      equippedItems[activeCategory as keyof typeof equippedItems] === item.id 
                        ? "border-amber-500 bg-amber-500/10" 
                        : "border-neutral-800 bg-neutral-900 hover:border-neutral-700",
                      !item.unlocked && "opacity-50 cursor-not-allowed grayscale"
                    )}
                  >
                    <div className={cn(
                      "p-3 rounded-lg border",
                      RARITY_COLORS[item.rarity]
                    )}>
                      {item.category === 'head' && <Crown className="w-6 h-6" />}
                      {item.category === 'body' && <Shirt className="w-6 h-6" />}
                      {item.category === 'legs' && <Activity className="w-6 h-6" />}
                      {item.category === 'feet' && <Footprints className="w-6 h-6" />}
                      {item.category === 'weapon' && <Sword className="w-6 h-6" />}
                      {item.category === 'shield' && <Shield className="w-6 h-6" />}
                      {item.category === 'accessory' && <Gem className="w-6 h-6" />}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-tighter text-neutral-400 truncate w-full px-2">
                      {item.name}
                    </span>
                    
                    {!item.unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                        <Lock className="w-5 h-5 text-white" />
                      </div>
                    )}
                    {equippedItems[activeCategory as keyof typeof equippedItems] === item.id && (
                      <div className="absolute -top-2 -right-2 bg-amber-500 rounded-full p-1 shadow-lg">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                </Tooltip>
              ))}
              
              {/* Empty slot option */}
              <button
                onClick={() => equipItem(activeCategory as any, null)}
                className={cn(
                  "w-full aspect-square rounded-xl border-2 border-dashed border-neutral-800 flex flex-col items-center justify-center gap-2 hover:border-neutral-700 transition-all",
                  !equippedItems[activeCategory as keyof typeof equippedItems] && "bg-neutral-800/30"
                )}
              >
                <div className="p-3 rounded-lg bg-neutral-950 text-neutral-600">
                  <Info className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-bold uppercase text-neutral-600">
                  Ablegen
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
