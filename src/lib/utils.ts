import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { SkillType } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
