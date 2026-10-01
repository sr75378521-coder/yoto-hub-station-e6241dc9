import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getSettingsData, disconnectYoto, type SettingsData } from "@/lib/players.functions";
import {
  Moon,
  Sun,
  Monitor,
  Bell,
  Shield,
  LogOut,
  RefreshCw,
  Code,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const settingsQuery = (fn: () => Promise<SettingsData>) =>
  queryOptions({
    queryKey: ["settings"],
    queryFn: () => fn(),
  });

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Yoto Control Center" },
      {
        name: "description",
        content: "Manage your Yoto Control Center settings and preferences.",
      },
    ],
  }),
  component: SettingsPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-8">
      <h2 className="text-lg font-semibold">Couldn't load settings</h2>
      <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message}</p>
      <Button onClick={reset} className="mt-4">
        Try again
      </Button>
    </div>
  ),
});

function SettingsPage() {
  const fetchSettings = useServerFn(getSettingsData);
  const disconnectFn = useServerFn(disconnectYoto);
  const { data, refetch } = useSuspenseQuery(settingsQuery(fetchSettings));
  const [theme, setTheme] = useState("auto");
  const [notifications, setNotifications] = useState(true);

  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Disconnected from Yoto");
      refetch();
    },
    onError: () => {
      toast.error("Failed to disconnect");
    },
  });

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Account Section */}
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Account</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage your account settings.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5" />
              Connected Account
            </CardTitle>
            <CardDescription>Your Yoto account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Account Name
              </Label>
              <p className="text-sm font-medium">{data.settings.accountName || "Loading..."}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Email Address
              </Label>
              <p className="text-sm font-medium">{data.settings.accountEmail || "Loading..."}</p>
            </div>
            <Separator className="my-4" />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <LogOut className="size-4 mr-2" />
                  Disconnect Yoto Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Yoto Account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will disconnect your Yoto account from Yoto Control Center. You'll need to
                    reconnect to manage your players again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => disconnect.mutate()}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Disconnect
                </AlertDialogAction>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <Separator />

        {/* Preferences Section */}
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Preferences</h2>
          <p className="text-sm text-muted-foreground">Customize your experience.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="size-5" />
              Theme
            </CardTitle>
            <CardDescription>Choose your preferred appearance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="size-4" />
                      Light
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="size-4" />
                      Dark
                    </div>
                  </SelectItem>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <Monitor className="size-4" />
                      Auto (System)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Current theme is set to <span className="font-medium capitalize">{theme}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-5" />
              Notifications
            </CardTitle>
            <CardDescription>Manage how you receive updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Push Notifications</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Get alerts when players go offline or needs attention
                </p>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Playback Updates</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Notify when playback status changes
                </p>
              </div>
              <Switch defaultChecked={false} disabled={!notifications} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Daily Summary</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Receive a daily summary of activity
                </p>
              </div>
              <Switch defaultChecked={false} disabled={!notifications} />
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* System Section */}
        <div>
          <h2 className="text-lg font-semibold tracking-tight">System</h2>
          <p className="text-sm text-muted-foreground">View technical information.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="size-5" />
              API Status
            </CardTitle>
            <CardDescription>Yoto API connection status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
              <CheckCircle2 className="size-5 text-green-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Connected</p>
                <p className="text-xs text-muted-foreground">Yoto API is responding normally</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 rounded-lg bg-muted/40 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Last Check
                </p>
                <p className="text-sm font-medium">Just now</p>
              </div>
              <div className="space-y-1 rounded-lg bg-muted/40 p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Response Time
                </p>
                <p className="text-sm font-medium">240ms</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="size-5" />
              Developer Tools
            </CardTitle>
            <CardDescription>Advanced options for developers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              <RefreshCw className="size-4 mr-2" />
              Clear Cache
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <Code className="size-4 mr-2" />
              View API Logs
            </Button>
            <div className="mt-4 rounded-lg bg-muted/40 p-3">
              <p className="text-xs font-mono text-muted-foreground">v0.1 · Build 2024.01</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-48 rounded-lg" />
      ))}
    </div>
  );
}
