import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { checkIsAdmin } from "@/lib/players.functions";
import {
  getGmailStatus,
  getEmailOpenAnalytics,
  listEmailUsers,
  startTrackedBatch,
  sendEmailBatchChunk,
  type EmailUserEntry,
} from "@/lib/email-users/email-users.functions";
import { renderMergeTemplate, MAX_RECIPIENTS } from "@/lib/email-users/merge";
import {
  Mail,
  Users,
  Send,
  Eye,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Search,
  Sparkles,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/email-users")({
  head: () => ({
    meta: [
      { title: "Email Users · Admin · Yoto Control Center" },
      { name: "description", content: "Send announcements and updates to registered users via Gmail." },
      { property: "og:title", content: "Email Users · Admin" },
      { property: "og:description", content: "Send announcements and updates to registered users via Gmail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmailUsersPage,
});

function EmailUsersPage() {
  const queryClient = useQueryClient();
  const checkAdmin = useServerFn(checkIsAdmin);
  const fetchGmail = useServerFn(getGmailStatus);
  const fetchUsers = useServerFn(listEmailUsers);
  const fetchAnalytics = useServerFn(getEmailOpenAnalytics);
  const startBatch = useServerFn(startTrackedBatch);
  const sendChunk = useServerFn(sendEmailBatchChunk);

  // Admin access guard
  const { data: adminData, isLoading: adminLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => checkAdmin(),
    staleTime: 5 * 60 * 1000,
  });

  // Data queries
  const { data: gmailStatus, isLoading: gmailLoading, refetch: refetchGmail } = useQuery({
    queryKey: ["gmail-status"],
    queryFn: () => fetchGmail(),
    enabled: !!adminData?.isAdmin,
  });

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ["email-users-list"],
    queryFn: () => fetchUsers(),
    enabled: !!adminData?.isAdmin,
  });

  const { data: analyticsData, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery({
    queryKey: ["email-analytics"],
    queryFn: () => fetchAnalytics(),
    enabled: !!adminData?.isAdmin,
  });

  // Composer state
  const [subject, setSubject] = useState("Exciting new features on Yoto Control Center!");
  const [fromName, setFromName] = useState("Yoto Control Center");
  const [body, setBody] = useState(
    "Hi {{name}},\n\nWe've rolled out some great new tools to your Yoto Control Center dashboard.\n\nHead over to check them out:\nhttps://yoto-hub-station.lovable.app/dashboard\n\nBest,\nSpencer & Jordan",
  );
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initializedSelection, setInitializedSelection] = useState(false);

  // Sending progress state
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);

  const allUsers: EmailUserEntry[] = usersData?.users ?? [];

  // Auto-select all users on initial load
  if (!initializedSelection && allUsers.length > 0) {
    setSelectedIds(new Set(allUsers.slice(0, MAX_RECIPIENTS).map((u) => u.id)));
    setInitializedSelection(true);
  }

  // Filtered users for search table
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return allUsers;
    const term = search.toLowerCase();
    return allUsers.filter(
      (u) => u.email.toLowerCase().includes(term) || u.name.toLowerCase().includes(term),
    );
  }, [allUsers, search]);

  const selectedCount = selectedIds.size;
  const isAllSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.has(u.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      filteredUsers.forEach((u) => next.delete(u.id));
    } else {
      filteredUsers.forEach((u) => {
        if (next.size < MAX_RECIPIENTS) next.add(u.id);
      });
    }
    setSelectedIds(next);
  };

  const toggleUser = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= MAX_RECIPIENTS) {
        toast.error(`Maximum recipient limit is ${MAX_RECIPIENTS}.`);
        return;
      }
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Preview target (first selected recipient)
  const previewRecipient = useMemo(() => {
    const firstSelected = allUsers.find((u) => selectedIds.has(u.id));
    return firstSelected ?? { id: "preview", email: "user@example.com", name: "Alex" };
  }, [allUsers, selectedIds]);

  const previewSubject = useMemo(
    () => renderMergeTemplate(subject, previewRecipient),
    [subject, previewRecipient],
  );

  const previewBody = useMemo(
    () => renderMergeTemplate(body, previewRecipient),
    [body, previewRecipient],
  );

  // Send action
  const handleSend = async () => {
    if (!gmailStatus?.connected) {
      toast.error("Gmail is not connected. Connect it in Project Settings -> Connectors.");
      return;
    }
    if (selectedCount === 0) {
      toast.error("Please select at least one recipient.");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject line cannot be empty.");
      return;
    }
    if (!body.trim()) {
      toast.error("Message body cannot be empty.");
      return;
    }

    const recipients = allUsers.filter((u) => selectedIds.has(u.id));
    const confirmText = `Send this email to ${recipients.length} user${recipients.length === 1 ? "" : "s"}?`;
    if (!window.confirm(confirmText)) return;

    setIsSending(true);
    setSendProgress({ current: 0, total: recipients.length });

    try {
      // 1. Initialize tracked batch
      const { batchId } = await startBatch({
        data: {
          subjectTemplate: subject.trim(),
          totalRecipients: recipients.length,
        },
      });

      // 2. Prepare personalized messages
      const messages = recipients.map((r) => ({
        id: r.id,
        to: r.email,
        recipientLabel: r.name,
        subject: renderMergeTemplate(subject, r),
        body: renderMergeTemplate(body, r),
      }));

      // 3. Send in chunks of 5
      const CHUNK_SIZE = 5;
      let sentCount = 0;
      let failedCount = 0;

      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE);
        const res = await sendChunk({
          data: {
            batchId,
            fromName: fromName.trim() || undefined,
            messages: chunk,
          },
        });

        sentCount += res.sentCount;
        failedCount += res.errors.length;
        setSendProgress({ current: Math.min(i + CHUNK_SIZE, messages.length), total: messages.length });
      }

      toast.success(`Successfully sent ${sentCount} email${sentCount === 1 ? "" : "s"}!`);
      if (failedCount > 0) {
        toast.warning(`${failedCount} message(s) failed to deliver.`);
      }

      void queryClient.invalidateQueries({ queryKey: ["email-analytics"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send email batch.";
      toast.error(msg);
    } finally {
      setIsSending(false);
      setSendProgress(null);
    }
  };

  // Guard loading or access denied
  if (adminLoading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!adminData?.isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg py-12">
          <Card className="border-destructive/40 bg-destructive/5 text-center">
            <CardHeader className="flex flex-col items-center gap-2">
              <ShieldAlert className="size-10 text-destructive" />
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>
                This tool is only accessible to site administrators.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Mail className="size-6 text-primary" /> Email Users
            </h1>
            <p className="text-sm text-muted-foreground">
              Send personalized updates and announcements to registered users with open tracking.
            </p>
          </div>

          {/* Gmail Status Badge */}
          <div className="flex items-center gap-2">
            {gmailLoading ? (
              <Badge variant="outline" className="gap-1 text-xs">
                <Loader2 className="size-3 animate-spin" /> Checking Gmail...
              </Badge>
            ) : gmailStatus?.connected ? (
              <Badge variant="secondary" className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3.5" />
                Sending as: <span className="font-semibold">{gmailStatus.emailAddress}</span>
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertCircle className="size-3.5" /> Gmail Disconnected
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => {
                void refetchGmail();
                void refetchUsers();
                void refetchAnalytics();
              }}
              title="Refresh status"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="compose" className="space-y-4">
          <TabsList>
            <TabsTrigger value="compose" className="gap-2">
              <Send className="size-4" /> Compose &amp; Send
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="size-4" /> Open Analytics
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: COMPOSE */}
          <TabsContent value="compose" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Email Form (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Message Composer</CardTitle>
                    <CardDescription>
                      Use <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{name}}"}</code> and{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{email}}"}</code> for merge tags.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* From Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">From Name (Display)</label>
                      <Input
                        value={fromName}
                        onChange={(e) => setFromName(e.target.value)}
                        placeholder="Yoto Control Center"
                        disabled={isSending}
                      />
                    </div>

                    {/* Subject */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-muted-foreground">Subject Line</label>
                        <button
                          type="button"
                          onClick={() => setSubject((s) => s + " {{name}}")}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Sparkles className="size-3" /> Insert {"{{name}}"}
                        </button>
                      </div>
                      <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Announcing new updates for {{name}}"
                        disabled={isSending}
                      />
                    </div>

                    {/* Body */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-muted-foreground">Message Body</label>
                        <div className="flex gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setBody((b) => b + " {{name}}")}
                            className="text-primary hover:underline"
                          >
                            +{"{{name}}"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setBody((b) => b + " {{email}}")}
                            className="text-primary hover:underline"
                          >
                            +{"{{email}}"}
                          </button>
                        </div>
                      </div>
                      <Textarea
                        rows={10}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Write your email here..."
                        className="font-mono text-xs leading-relaxed"
                        disabled={isSending}
                      />
                    </div>

                    {/* Progress Bar while sending */}
                    {isSending && sendProgress && (
                      <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <div className="flex justify-between text-xs font-medium">
                          <span>Sending campaign...</span>
                          <span>
                            {sendProgress.current} / {sendProgress.total} recipients
                          </span>
                        </div>
                        <Progress value={(sendProgress.current / sendProgress.total) * 100} />
                      </div>
                    )}

                    {/* Send Button */}
                    <Button
                      onClick={handleSend}
                      disabled={isSending || selectedCount === 0 || !gmailStatus?.connected}
                      className="w-full gap-2"
                      size="lg"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Sending ({sendProgress?.current ?? 0}/{sendProgress?.total ?? 0})...
                        </>
                      ) : (
                        <>
                          <Send className="size-4" /> Send to {selectedCount} User{selectedCount === 1 ? "" : "s"}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Live Preview Card */}
                <Card className="border-border/60 bg-muted/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Eye className="size-4 text-muted-foreground" />
                      Live Preview (Showing for: {previewRecipient.name} &lt;{previewRecipient.email}&gt;)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="rounded border bg-background p-2.5">
                      <span className="font-semibold text-muted-foreground">Subject: </span>
                      <span className="font-medium text-foreground">{previewSubject || "(empty subject)"}</span>
                    </div>
                    <div className="rounded border bg-background p-3 whitespace-pre-wrap font-sans text-foreground/90">
                      {previewBody || "(empty body)"}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: User Selection (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="size-4 text-primary" /> Recipients
                      </CardTitle>
                      <Badge variant="outline">
                        {selectedCount} / {allUsers.length} Selected
                      </Badge>
                    </div>
                    <CardDescription>
                      Auto-imported from your user accounts (max {MAX_RECIPIENTS}).
                    </CardDescription>

                    {/* Search */}
                    <div className="relative pt-2">
                      <Search className="absolute left-2.5 top-4.5 size-4 text-muted-foreground" />
                      <Input
                        placeholder="Search name or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 text-xs h-9"
                        disabled={isSending}
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    <div className="flex items-center justify-between border-y px-4 py-2 text-xs bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="select-all"
                          checked={isAllSelected}
                          onCheckedChange={toggleSelectAll}
                          disabled={isSending}
                        />
                        <label htmlFor="select-all" className="cursor-pointer font-medium">
                          Select All Visible ({filteredUsers.length})
                        </label>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={() => setSelectedIds(new Set())}
                        disabled={isSending || selectedCount === 0}
                      >
                        Clear All
                      </Button>
                    </div>

                    <div className="max-h-[520px] overflow-y-auto divide-y divide-border/60">
                      {usersLoading ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          <Loader2 className="mx-auto size-5 animate-spin mb-2" /> Loading users...
                        </div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          No users matched &quot;{search}&quot;.
                        </div>
                      ) : (
                        filteredUsers.map((user) => {
                          const isChecked = selectedIds.has(user.id);
                          return (
                            <div
                              key={user.id}
                              onClick={() => !isSending && toggleUser(user.id)}
                              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer text-xs transition-colors hover:bg-muted/40 ${
                                isChecked ? "bg-primary/5" : ""
                              }`}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => toggleUser(user.id)}
                                disabled={isSending}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate text-foreground">
                                  {user.name || "User"}
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {user.email}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: ANALYTICS */}
          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sent Campaigns &amp; Open Tracking</CardTitle>
                <CardDescription>
                  Real-time open rates recorded via the 1x1 tracking pixel.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin mb-2" /> Loading analytics...
                  </div>
                ) : !analyticsData || analyticsData.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    No email campaigns have been sent yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-right">Recipients</TableHead>
                          <TableHead className="text-right">Unique Opens</TableHead>
                          <TableHead className="text-right">Open Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analyticsData.map((batch) => {
                          const openRate =
                            batch.total_recipients > 0
                              ? Math.round((batch.open_count / batch.total_recipients) * 100)
                              : 0;
                          return (
                            <TableRow key={batch.id}>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(batch.created_at).toLocaleDateString()}{" "}
                                {new Date(batch.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </TableCell>
                              <TableCell className="text-xs font-medium">
                                {batch.subject_template}
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                {batch.sent_count} / {batch.total_recipients}
                              </TableCell>
                              <TableCell className="text-xs text-right font-medium">
                                {batch.open_count}
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                <Badge
                                  variant="secondary"
                                  className={
                                    openRate >= 40
                                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                      : openRate >= 20
                                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                      : "bg-muted text-muted-foreground"
                                  }
                                >
                                  {openRate}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
