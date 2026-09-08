// Curated lucide icon set for goals. We store the icon *name* (a string) on
// `goals.icon` and resolve it to a component here — no emoji anywhere.

import {
  Target, PiggyBank, House, Car, Plane, GraduationCap, Laptop, LifeBuoy,
  Gift, TrendingUp, HeartPulse, Gem, Briefcase, Landmark, Rocket, Baby,
  Building2, Camera, Wrench, ShieldCheck, Sparkles, Banknote, Smartphone,
  Bike, Utensils, Dumbbell, PawPrint, TreePalm,
  type LucideIcon,
} from "lucide-react";

export const GOAL_ICONS: Record<string, LucideIcon> = {
  Target, PiggyBank, House, Car, Plane, GraduationCap, Laptop, LifeBuoy,
  Gift, TrendingUp, HeartPulse, Gem, Briefcase, Landmark, Rocket, Baby,
  Building2, Camera, Wrench, ShieldCheck, Sparkles, Banknote, Smartphone,
  Bike, Utensils, Dumbbell, PawPrint, TreePalm,
};

export const GOAL_ICON_KEYS = Object.keys(GOAL_ICONS);
export const DEFAULT_GOAL_ICON = "Target";

export function goalIcon(name: string | null | undefined): LucideIcon {
  return (name && GOAL_ICONS[name]) || GOAL_ICONS[DEFAULT_GOAL_ICON];
}
