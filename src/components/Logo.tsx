import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
        <div className="absolute inset-0 bg-amber-500/25 rounded-full blur-sm" />
        <div className="absolute inset-0 border-2 border-amber-400/90 rounded-full" />
        <div className="absolute inset-1 border border-orange-400/70 rounded-full" />
        <div className="absolute inset-2 bg-gradient-to-tr from-amber-500 to-orange-400 rounded-full" />
      </div>
      {showText && (
        <span className="text-xl font-extrabold tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-500 whitespace-nowrap">
          AURA
        </span>
      )}
    </div>
  );
}
