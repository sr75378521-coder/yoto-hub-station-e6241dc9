import { Link, useRouterState } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { ADMIN_NAV_ITEM, NAV_ITEMS, type NavItem } from "./nav-items";

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  const items: NavItem[] = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : [...NAV_ITEMS];

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border/60 bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 h-14 border-b border-border/60">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Radio className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Yoto Control</div>
          <div className="text-[11px] text-muted-foreground">Center</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          const cls = cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
            active
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
          );
          return (
            <Link key={item.to} to={item.to} className={cls}>
              <Icon className="size-4" /> {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-border/60 text-[11px] text-muted-foreground">
        v0.1 · early access
      </div>
    </aside>
  );
}
