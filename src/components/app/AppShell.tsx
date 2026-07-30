import { type ReactNode } from "react";
import { AppSidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { WebPlayerProvider } from "./WebPlayer";

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <WebPlayerProvider>
      <div className="flex min-h-screen bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-10 flex items-center justify-between h-14 px-4 md:px-6 border-b border-border/60 bg-background/80 backdrop-blur">
            <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 px-4 md:px-8 py-6 md:py-8 pb-28">{children}</main>
        </div>
      </div>
    </WebPlayerProvider>
  );
}
