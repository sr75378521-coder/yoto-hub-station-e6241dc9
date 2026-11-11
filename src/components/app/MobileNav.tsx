import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { ADMIN_NAV_ITEMS, NAV_ITEMS, type NavItem } from "./nav-items";

/** Hamburger slide-out navigation for phones and small tablets. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();

  const items: NavItem[] = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : [...NAV_ITEMS];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex h-full w-72 flex-col p-0">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Yoto Control</div>
            <div className="text-[11px] text-muted-foreground">Center</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 overscroll-contain">
          {items.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-5" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/60 px-5 py-4 text-xs text-muted-foreground flex flex-col gap-0.5">
          <div className="font-medium text-foreground/80">Made by Spencer R &amp; Jordan B</div>
          <div className="text-[11px] text-muted-foreground/80">v0.1 · early access</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
