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
  MessageSquareHeart,
  Moon,
  Bot,
  Crown,
  Globe,
  MessagesSquare,
  Mail,
} from "lucide-react";

export const NAV_ITEMS = [
  { to: "/dashboard", label: "Players", icon: LayoutDashboard },
  { to: "/news", label: "Community", icon: MessagesSquare },
  { to: "/ai-yoto", label: "AI Yoto", icon: Bot },
  { to: "/membership", label: "Membership", icon: Crown },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/audio", label: "Audio Playground", icon: AudioWaveform },
  { to: "/playlists", label: "Playlists", icon: ListMusic },
  { to: "/public-playlists", label: "Public Playlists", icon: Globe },
  { to: "/podcasts", label: "Podcasts", icon: Podcast },
  { to: "/converter", label: "Converter", icon: Repeat },
  { to: "/alarms", label: "Alarms", icon: AlarmClock },
  { to: "/bedtime", label: "Bedtime", icon: Moon },
  { to: "/spark-studio", label: "Spark Studio", icon: Wand2 },
  { to: "/icons", label: "My Icons", icon: Sparkles },
  { to: "/feedback", label: "Feedback", icon: MessageSquareHeart },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export const ADMIN_NAV_ITEMS = [
  { to: "/admin", label: "Admin", icon: ShieldCheck },
  { to: "/email-users", label: "Email users", icon: Mail },
] as const;

export const ADMIN_NAV_ITEM = ADMIN_NAV_ITEMS[0];

export type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
