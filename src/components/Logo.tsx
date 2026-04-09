import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex items-center justify-center w-8 h-8">
        {/* Outer glow */}
        <div className="absolute inset-0 bg-amber-500 rounded-full blur-md opacity-50 animate-pulse"></div>
        {/* Inner rings */}
        <div className="absolute inset-0 border-2 border-amber-400 rounded-full opacity-80"></div>
        <div className="absolute inset-1 border-2 border-orange-400 rounded-full opacity-60"></div>
        {/* Core */}
        <div className="absolute inset-2 bg-gradient-to-tr from-amber-500 to-orange-400 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.8)]"></div>
      </div>
      {showText && (
        <span className="text-2xl font-black tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-500 drop-shadow-sm">
          AURA
        </span>
      )}
    </div>
  );
}
