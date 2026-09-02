import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Menu, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { checkIsAdmin } from "@/lib/players.functions";
import { ADMIN_NAV_ITEM, NAV_ITEMS, type NavItem } from "./nav-items";

/** Hamburger slide-out navigation for phones and small tablets. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const checkAdmin = useServerFn(checkIsAdmin);
  const { data: adminStatus } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => checkAdmin(),
    staleTime: 5 * 60 * 1000,
  });

  const items: NavItem[] = adminStatus?.isAdmin
    ? [...NAV_ITEMS, ADMIN_NAV_ITEM]
    : [...NAV_ITEMS];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <div className="flex h-14 items-center gap-2 border-b border-border/60 px-5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Radio className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Yoto Control</div>
            <div className="text-[11px] text-muted-foreground">Center</div>
          </div>
        </div>
        <nav className="space-y-1 p-3">
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
      </SheetContent>
    </Sheet>
  );
}
