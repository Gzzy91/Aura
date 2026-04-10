import { motion } from 'motion/react';
import { User as UserIcon, Crown, Shield, Star, Zap, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface AvatarVisualProps {
  level: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  skinColor?: string;
}

export function getAvatarTier(level: number) {
  if (level >= 50) return { name: 'Meister', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500', glow: 'shadow-red-500/50', icon: Flame };
  if (level >= 30) return { name: 'Diamant', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400', glow: 'shadow-cyan-400/50', icon: Zap };
  if (level >= 20) return { name: 'Platin', color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400', glow: 'shadow-purple-400/50', icon: Star };
  if (level >= 10) return { name: 'Gold', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400', glow: 'shadow-amber-400/50', icon: Crown };
  if (level >= 5) return { name: 'Silber', color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300', glow: 'shadow-slate-300/50', icon: Shield };
  return { name: 'Bronze', color: 'text-orange-700', bg: 'bg-orange-700/10', border: 'border-orange-700', glow: 'shadow-orange-700/50', icon: UserIcon };
}

export function AvatarVisual({ level, size = 'md', className, skinColor }: AvatarVisualProps) {
  const [prevLevel, setPrevLevel] = useState(level);
  const [isLevelingUp, setIsLevelingUp] = useState(false);
  const tier = getAvatarTier(level);
  const TierIcon = tier.icon;

  useEffect(() => {
    if (level > prevLevel) {
      setIsLevelingUp(true);
      const timer = setTimeout(() => setIsLevelingUp(false), 3000);
      setPrevLevel(level);
      return () => clearTimeout(timer);
    }
  }, [level, prevLevel]);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-32 h-32',
    xl: 'w-48 h-48'
  };

  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  return (
    <motion.div 
      className={cn("relative flex items-center justify-center rounded-full border-2", skinColor || tier.bg, tier.border, sizeClasses[size], className)}
      animate={isLevelingUp ? {
        scale: [1, 1.2, 1],
        boxShadow: [
          `0 0 0 0 rgba(0,0,0,0)`,
          `0 0 30px 10px var(--tw-shadow-color)`,
          `0 0 10px 2px var(--tw-shadow-color)`
        ]
      } : {
        boxShadow: `0 0 10px 2px var(--tw-shadow-color)`
      }}
      transition={{ duration: 1, ease: "easeInOut" }}
      style={{ '--tw-shadow-color': tier.color.replace('text-', '') } as any} // Hacky way to pass color to box-shadow, but we can just use the glow class
    >
      <div className={cn("absolute inset-0 rounded-full shadow-lg", tier.glow, isLevelingUp ? 'animate-pulse' : '')} />
      
      <motion.div
        animate={isLevelingUp ? { rotate: [0, 360] } : { rotate: 0 }}
        transition={{ duration: 1, ease: "easeInOut" }}
        className="relative z-10"
      >
        <TierIcon className={cn(tier.color, iconSizes[size])} />
      </motion.div>

      {/* Level Badge */}
      <div className={cn(
        "absolute -bottom-2 bg-neutral-900 border-2 rounded-full px-2 py-0.5 text-xs font-black",
        tier.border, tier.color
      )}>
        {level}
      </div>
    </motion.div>
  );
}
