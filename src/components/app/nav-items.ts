import {
  LayoutDashboard,
  Wrench,
  ListMusic,
  Sparkles,
  Settings,
  AudioWaveform,
  ShieldCheck,
  Podcast,
  Repeat,
  AlarmClock,
  Wand2,
} from "lucide-react";

export const NAV_ITEMS = [
  { to: "/dashboard", label: "Players", icon: LayoutDashboard },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/audio", label: "Audio Playground", icon: AudioWaveform },
  { to: "/playlists", label: "Playlists", icon: ListMusic },
  { to: "/podcasts", label: "Podcasts", icon: Podcast },
  { to: "/converter", label: "Converter", icon: Repeat },
  { to: "/alarms", label: "Alarms", icon: AlarmClock },
  { to: "/spark-studio", label: "Spark Studio", icon: Wand2 },
  { to: "/icons", label: "My Icons", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export const ADMIN_NAV_ITEM = { to: "/admin", label: "Admin", icon: ShieldCheck } as const;

export type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
