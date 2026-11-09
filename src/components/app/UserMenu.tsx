import { useEffect, useState } from "react";
import { LogOut, User as UserIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const [profile, setProfile] = useState<{
    email: string | null;
    avatar: string | null;
    name: string | null;
  }>({
    email: null,
    avatar: null,
    name: null,
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      setProfile({
        email: user?.email ?? null,
        avatar: user?.user_metadata?.avatar_url ?? null,
        name: user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "User",
      });
    });
  }, []);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/80 bg-primary/10 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label="Account menu"
        >
          {profile.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.name || "Profile"}
              className="size-full rounded-full object-cover"
            />
          ) : (
            <span className="text-xs font-bold text-primary">
              {(profile.name || "U").slice(0, 2).toUpperCase()}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <div className="text-sm font-semibold truncate">{profile.name}</div>
          <div className="text-xs font-normal text-muted-foreground truncate">
            {profile.email ?? "Signed in"}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate({ to: "/news" })}
          className="gap-2 cursor-pointer"
        >
          <UserIcon className="size-4" /> Edit Profile & Avatar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="gap-2 text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
