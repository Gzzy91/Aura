import { cn } from "@/lib/utils";

interface ProgressBarProps {
  progress: number;
  className?: string;
  colorClass?: string;
}

export function ProgressBar({ progress, className, colorClass = "bg-blue-500" }: ProgressBarProps) {
  return (
    <div className={cn("h-2 w-full bg-gray-800 rounded-full overflow-hidden", className)}>
      <div 
        className={cn("h-full transition-all duration-500 ease-out", colorClass)} 
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}
