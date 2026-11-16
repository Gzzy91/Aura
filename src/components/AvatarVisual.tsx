import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { User as UserIcon, Crown, Shield, Star, Zap, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AvatarVisualProps {
  level: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  skinId?: string;
  skinColor?: string;
}

export function getAvatarTier(level: number) {
  if (level >= 50)
    return {
      name: 'Meister',
      color: 'text-rose-400',
      hex: '#fb7185',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/60',
      icon: Flame,
    };
  if (level >= 30)
    return {
      name: 'Diamant',
      color: 'text-cyan-400',
      hex: '#22d3ee',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-400/60',
      icon: Zap,
    };
  if (level >= 20)
    return {
      name: 'Platin',
      color: 'text-purple-400',
      hex: '#c084fc',
      bg: 'bg-purple-500/10',
      border: 'border-purple-400/60',
      icon: Star,
    };
  if (level >= 10)
    return {
      name: 'Gold',
      color: 'text-amber-400',
      hex: '#fbbf24',
      bg: 'bg-amber-500/10',
      border: 'border-amber-400/60',
      icon: Crown,
    };
  if (level >= 5)
    return {
      name: 'Silber',
      color: 'text-slate-300',
      hex: '#cbd5e1',
      bg: 'bg-slate-400/10',
      border: 'border-slate-300/60',
      icon: Shield,
    };
  return {
    name: 'Bronze',
    color: 'text-orange-400',
    hex: '#fb923c',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/50',
    icon: UserIcon,
  };
}

const SKIN_ACCENTS: Record<string, { primary: string; secondary: string; ring: string }> = {
  default: { primary: '#f59e0b', secondary: '#78350f', ring: 'border-neutral-700' },
  shadow: { primary: '#818cf8', secondary: '#312e81', ring: 'border-indigo-500/60' },
  paladin: { primary: '#fbbf24', secondary: '#92400e', ring: 'border-amber-400/70' },
  'fire-mage': { primary: '#ef4444', secondary: '#7f1d1d', ring: 'border-red-500/70' },
  'nature-spirit': { primary: '#10b981', secondary: '#064e3b', ring: 'border-emerald-500/70' },
  'cyber-ninja': { primary: '#22d3ee', secondary: '#164e63', ring: 'border-cyan-400/70' },
};

export function AvatarVisual({
  level,
  size = 'md',
  className,
  skinId = 'default',
  skinColor,
}: AvatarVisualProps) {
  const [prevLevel, setPrevLevel] = useState(level);
  const [isLevelingUp, setIsLevelingUp] = useState(false);
  const tier = getAvatarTier(level);
  const TierIcon = tier.icon;
  const skinAccent = SKIN_ACCENTS[skinId] || SKIN_ACCENTS.default;

  useEffect(() => {
    if (level > prevLevel) {
      setIsLevelingUp(true);
      const timer = setTimeout(() => setIsLevelingUp(false), 2200);
      setPrevLevel(level);
      return () => clearTimeout(timer);
    }
    if (level < prevLevel) {
      setPrevLevel(level);
    }
  }, [level, prevLevel]);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-32 h-32',
    xl: 'w-44 h-44',
  };

  const iconSizes = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <motion.div
      className={cn(
        'relative flex items-center justify-center rounded-full border-2 shrink-0',
        skinColor || tier.bg,
        skinId !== 'default' ? skinAccent.ring : tier.border,
        sizeClasses[size],
        className
      )}
      animate={isLevelingUp ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      {/* Precision geometric crest SVG behind the tier emblem */}
      <svg
        viewBox="0 0 120 120"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={skinAccent.primary}
          strokeOpacity="0.22"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        <polygon
          points="60,12 102,36 102,84 60,108 18,84 18,36"
          fill={skinAccent.secondary}
          fillOpacity="0.22"
          stroke={tier.hex}
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />
      </svg>

      <motion.div
        animate={isLevelingUp ? { rotate: [0, 360] } : { rotate: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 flex items-center justify-center"
      >
        <TierIcon className={cn(tier.color, iconSizes[size])} />
      </motion.div>

      {/* Level Badge */}
      <div
        className={cn(
          'absolute -bottom-2 bg-neutral-950 border rounded-full px-2 py-0.5 text-[11px] font-bold font-mono tabular-nums z-20',
          tier.border,
          tier.color
        )}
      >
        {level}
      </div>
    </motion.div>
  );
}
