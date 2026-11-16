import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { SkillType } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function triggerHapticFeedback(pattern: number | number[] = 50) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore errors if vibrate is not supported or blocked
    }
  }
}

/**
 * Parses an HTML <input type="date"> string ('YYYY-MM-DD') into a local-noon timestamp
 * so negative UTC offsets never shift the entry to the previous calendar day.
 */
export function parseLocalDateInput(dateStr: string): number {
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const [year, month, day] = parts;
    return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
  }
  const fallback = new Date(dateStr).getTime();
  return Number.isFinite(fallback) ? fallback : Date.now();
}

export const SKILL_COLORS: Record<SkillType, string> = {
  Fitness: 'text-red-500',
  Fokus: 'text-blue-500',
  Disziplin: 'text-purple-500',
  Wissen: 'text-emerald-500',
  Soziales: 'text-pink-500',
};

export const SKILL_BG_COLORS: Record<SkillType, string> = {
  Fitness: 'bg-red-500/10',
  Fokus: 'bg-blue-500/10',
  Disziplin: 'bg-purple-500/10',
  Wissen: 'bg-emerald-500/10',
  Soziales: 'bg-pink-500/10',
};

export const SKILL_PROGRESS_COLORS: Record<SkillType, string> = {
  Fitness: 'bg-red-500',
  Fokus: 'bg-blue-500',
  Disziplin: 'bg-purple-500',
  Wissen: 'bg-emerald-500',
  Soziales: 'bg-pink-500',
};

export const SKILL_BORDER_COLORS: Record<SkillType, string> = {
  Fitness: 'border-red-500/30 hover:border-red-500/60',
  Fokus: 'border-blue-500/30 hover:border-blue-500/60',
  Disziplin: 'border-purple-500/30 hover:border-purple-500/60',
  Wissen: 'border-emerald-500/30 hover:border-emerald-500/60',
  Soziales: 'border-pink-500/30 hover:border-pink-500/60',
};
