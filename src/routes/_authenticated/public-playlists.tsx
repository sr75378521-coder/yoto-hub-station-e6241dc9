import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import {
  Globe,
  Upload,
  Loader2,
  Music,
  Plus,
  Play,
  Clock,
  Disc3,
  EyeOff,
  BookOpen,
  Search,
  Library,
} from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  publicOptions,
  searchBooks,
  importBook,
  shareDraft,
  addToLibrary,
  setVisibility,
  addToYoto,
  suggestBooks,
  shareYotoPlaylist,
} from '@/lib/community/community.functions';
import { getPlaylistsData } from '@/lib/players.functions';
import { draftsOptions } from '@/lib/ai-yoto/queries';
import { supabase } from '@/integrations/supabase/client';
import { useWebPlayer } from '@/components/app/WebPlayer';
import { PlaylistComments } from '@/components/app/PlaylistComments';
import type { Book } from '@/lib/community/librivox.server';
import type { SharedChapter } from '@/lib/community/rules';

const shareable = (d: { chapters: { paths?: string[]; tracks?: { trackUrl?: string }[] }[] }) =>
  d.chapters.length > 0 &&
  d.chapters.every(
    c =>
      (c.paths?.length ?? 0) > 0 ||
      (c.tracks?.length ? c.tracks.every(t => /archive\.org\/download\//.test(t.trackUrl ?? '')) : false)
  );

export const Route = createFileRoute('/_authenticated/public-playlists')({
  head: () => ({
    meta: [
      { title: 'Public Playlists · Yoto Control Center' },
      { name: 'description', content: 'Discover community playlists and import them into your Yoto library.' },
      { property: 'og:title', content: 'Public Playlists · Yoto Control Center' },
      { property: 'og:description', content: 'Community audio and LibriVox books for your library.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(publicOptions()),
      context.queryClient.ensureQueryData(draftsOptions()),
    ]);
  },
  component: PublicPlaylists,
});

function PublicPlaylists() {
  const { user } = Route.useRouteContext();
  const cache = useQueryClient();
  const playlists = useSuspenseQuery(publicOptions());
  const drafts = useSuspenseQuery(draftsOptions());
  const { playQueue } = useWebPlayer();

  const search = useServerFn(searchBooks);
  const importFn = useServerFn(importBook);
  const share = useServerFn(shareDraft);
  const add = useServerFn(addToLibrary);
  const visibility = useServerFn(setVisibility);
  const toYoto = useServerFn(addToYoto);
  const suggest = useServerFn(suggestBooks);
  const shareYoto = useServerFn(shareYotoPlaylist);
  const yotoList = useServerFn(getPlaylistsData);

  const [tab, setTab] = useState<'community' | 'books' | 'mine' | 'library'>('community');
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [description, setDescription] = useState('');
  const [rights, setRights] = useState(false);
  const [book, setBook] = useState<Book | null>(null);
  const [bookRights, setBookRights] = useState(false);

  async function action(key: string, fn: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['public-playlists'] }),
        cache.invalidateQueries({ queryKey: ['ai-yoto-drafts'] }),
        cache.invalidateQueries({ queryKey: ['playlists'] }),
      ]);
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy('');
    }
  }

  const [suggested, setSuggested] = useState<Book[]>([]);
  const [page, setPage] = useState(0);
  const [loadingBooks, setLoadingBooks] = useState(false);

  async function moreBooks() {
    if (loadingBooks) return;
    setLoadingBooks(true);
    try {
      const next = await suggest({ data: { page: page + 1 } });
      setSuggested(s => [...s, ...next.filter(b => !s.some(x => x.id === b.id))]);
      setPage(page + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load books.');
    } finally {
      setLoadingBooks(false);
    }
  }

  useEffect(() => {
    if (tab === 'books' && !page) void moreBooks();
  }, [tab]);

  const yoto = useQuery({ queryKey: ['yoto-playlists-share'], queryFn: () => yotoList(), enabled: sharing });
  const list = playlists.data.filter(
    p => (tab === 'mine' ? p.user_id === user.id : p.is_public) && p.title.toLowerCase().includes(query.toLowerCase())
  );

  const handlePlayPublic = (p: (typeof playlists.data)[number]) => {
    const chapters = (p.chapters as unknown as SharedChapter[]) || [];
    const tracks = chapters
      .map((c, i) => {
        let streamUrl: string | null = null;
        if (c.url) streamUrl = c.url;
        else if (c.path) {
          streamUrl = supabase.storage.from('community-audio').getPublicUrl(c.path).data.publicUrl;
        }
        return {
          key: String(i + 1),
          title: c.title,
          duration: c.duration,
          url: streamUrl,
          artwork: (p as any).cover_url || undefined,
        };
      })
      .filter(t => t.url !== null);

    if (!tracks.length) {
      setError('No playable audio stream available for this playlist.');
      return;
    }

    playQueue({
      id: p.id,
      title: p.title,
      artwork: (p as any).cover_url || undefined,
      tracks,
    });
  };

  return (
    <AppShell title="Public Playlists">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-3 font-display text-2xl sm:text-3xl font-bold">
              <Globe className="size-7 sm:size-8 text-primary" />
              Public Playlists
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Community favourites &amp; classic audiobooks
            </p>
          </div>
          <Button onClick={() => setSharing(true)}>
            <Upload className="size-4 mr-2" />
            Make a playlist public
          </Button>
        </header>

        <div role="tablist" className="flex flex-wrap gap-2 border-b pb-4">
          {([
            ['community', 'Community'],
            ['books', 'LibriVox books'],
            ['mine', 'My public playlists'],
            ['library', 'My library'],
          ] as const).map(([id, name]) => (
            <Button
              role="tab"
              aria-selected={tab === id}
              key={id}
              variant={tab === id ? 'default' : 'ghost'}
              onClick={() => {
                setTab(id);
                setQuery('');
              }}
            >
              {name}
            </Button>
          ))}
        </div>

        {error && <p role="alert" className="text-destructive break-words text-sm">{error}</p>}
        {notice && (
          <p role="status" className="text-primary text-sm">
            {notice} <Link className="underline font-medium" to="/playlists">Open Playlists</Link>
          </p>
        )}

        {tab !== 'library' && (
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault();
              if (tab === 'books') {
                void action('search', async () => {
                  setBooks(await search({ data: { query } }));
                  setSearched(true);
                }, '');
              }
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={tab === 'books' ? 'Book title' : 'Search public playlists'}
                placeholder={tab === 'books' ? 'Book title starts with…' : 'Search playlists…'}
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  if (!e.target.value) setSearched(false);
                }}
                className="pl-9 h-9 text-sm"
              />
            </div>
            {tab === 'books' && (
              <Button disabled={!!busy} type="submit" size="sm">
                <Search className="size-4 mr-1.5" />
                Search
              </Button>
            )}
          </form>
        )}

        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Working…
          </p>
        )}

        {tab === 'books' ? (
          <>
            <p className="text-xs sm:text-sm text-muted-foreground">
              LibriVox recordings · Read by volunteers. Check copyright before importing.
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {(searched ? books : suggested).map((b, i) => (
                <div
                  key={b.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card text-card-foreground shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-muted/20">
                    {b.cover ? (
                      <img
                        src={b.cover}
                        alt={`Cover of ${b.title}`}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-muted/20">
                        <BookOpen className="size-16 text-primary/30" />
                      </div>
                    )}
                    {!searched && (
                      <Badge className="absolute top-2.5 right-2.5 border-0 bg-background/85 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-md shadow-xs text-foreground">
                        #{i + 1}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
                    <div>
                      <h3 className="line-clamp-1 text-base font-semibold tracking-tight text-foreground" title={b.title}>
                        {b.title}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{b.author}</p>
                    </div>
                    <div className="space-y-2 pt-1">
                      <Button
                        size="sm"
                        className="h-9 w-full text-xs font-semibold shadow-xs"
                        onClick={() => {
                          setBook(b);
                          setBookRights(false);
                        }}
                      >
                        <Plus className="size-4 mr-1.5" />
                        Add to My Playlists
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!searched && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" disabled={loadingBooks} onClick={() => void moreBooks()}>
                  {loadingBooks ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                  Show more books
                </Button>
              </div>
            )}
            {searched && !books.length && <p className="py-8 text-center text-sm text-muted-foreground">No matching books.</p>}
          </>
        ) : tab === 'library' ? (
          <div className="divide-y rounded-2xl border bg-card p-4">
            {drafts.data.map(d => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <h3 className="font-semibold text-sm sm:text-base">{d.title}</h3>
                  <p className="text-xs text-muted-foreground">{d.chapters.length} chapters</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/ai-yoto" search={{ draft: d.id }}>
                    <Library className="size-4 mr-1.5" />
                    Open in AI Yoto
                  </Link>
                </Button>
              </div>
            ))}
            {!drafts.data.length && <p className="py-8 text-center text-sm text-muted-foreground">Your library is empty.</p>}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {list.map(p => {
                const chapters = (p.chapters as unknown as SharedChapter[]) || [];
                const cover = (p as any).cover_url;
                const totalSec = chapters.reduce((acc, c) => acc + (c.duration || 0), 0);
                const hours = Math.floor(totalSec / 3600);
                const minutes = Math.floor((totalSec % 3600) / 60);
                const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

                return (
                  <div
                    key={p.id}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card text-card-foreground shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
                  >
                    {/* Edge-to-edge Artwork matching the Playlists tab */}
                    <div className="relative aspect-square w-full overflow-hidden bg-muted/20">
                      {cover ? (
                        <img
                          src={cover}
                          alt={p.title}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-muted/20">
                          {p.source === 'librivox' ? (
                            <BookOpen className="size-16 text-primary/30" />
                          ) : (
                            <Music className="size-16 text-primary/30" />
                          )}
                        </div>
                      )}

                      <Badge
                        variant="secondary"
                        className="absolute top-2.5 right-2.5 border-0 bg-background/85 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-md shadow-xs text-foreground"
                      >
                        {p.source === 'librivox' ? 'LibriVox' : 'Community'}
                      </Badge>
                    </div>

                    {/* Metadata & Actions */}
                    <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
                      <div>
                        <h3 className="line-clamp-1 text-base font-semibold tracking-tight text-foreground" title={p.title}>
                          {p.title}
                        </h3>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Disc3 className="size-3.5" />
                            <span>{chapters.length} chapter{chapters.length === 1 ? '' : 's'}</span>
                          </div>
                          {totalSec > 0 && (
                            <div className="flex items-center gap-1">
                              <Clock className="size-3.5" />
                              <span>{durationStr}</span>
                            </div>
                          )}
                        </div>
                        {p.description && (
                          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                            {p.description}
                          </p>
                        )}
                      </div>

                      {/* Clean two-tier action layout: Play & Add to My Playlists */}
                      <div className="space-y-2 pt-1">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-9 w-full text-xs font-semibold shadow-xs"
                          onClick={() => handlePlayPublic(p)}
                        >
                          <Play className="size-4 mr-1.5 fill-current" />
                          Play
                        </Button>

                        {p.is_public && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!!busy}
                            className="h-9 w-full text-xs font-medium border-border/60 hover:bg-muted/60"
                            onClick={() =>
                              action(
                                p.id,
                                () => toYoto({ data: { publicId: p.id } }),
                                'Playlist added to your Yoto library!'
                              )
                            }
                          >
                            <Plus className="size-3.5 mr-1.5" />
                            Add to My Playlists
                          </Button>
                        )}

                        {p.user_id === user.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-full text-xs text-muted-foreground"
                            disabled={!!busy}
                            onClick={() =>
                              action(
                                p.id,
                                () => visibility({ data: { id: p.id, public: !p.is_public } }),
                                p.is_public ? 'Playlist unpublished.' : 'Playlist published.'
                              )
                            }
                          >
                            <EyeOff className="size-3 mr-1" />
                            {p.is_public ? 'Unpublish' : 'Make Public'}
                          </Button>
                        )}

                        <PlaylistComments playlistId={p.id} userId={user.id} email={user.email} canPost={p.is_public} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {!list.length && <p className="py-12 text-center text-sm text-muted-foreground">No playlists yet.</p>}
          </>
        )}

        {/* Dialog for making a playlist public */}
        <Dialog open={sharing} onOpenChange={setSharing}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Make a playlist public</DialogTitle>
              <DialogDescription>
                Audio and cover art are shared with other members.
              </DialogDescription>
            </DialogHeader>
            <select
              aria-label="Playlist to publish"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={draftId}
              onChange={e => setDraftId(e.target.value)}
            >
              <option value="">Choose a playlist…</option>
              {(yoto.data?.playlists?.length ?? 0) > 0 && (
                <optgroup label="My Yoto playlists">
                  {yoto.data!.playlists.map(p => (
                    <option key={p.playlistId} value={`yoto:${p.playlistId}`}>{p.name}</option>
                  ))}
                </optgroup>
              )}
              {drafts.data.some(shareable) && (
                <optgroup label="AI Yoto saved playlists">
                  {drafts.data.filter(shareable).map(d => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <Textarea
              aria-label="Public playlist description"
              placeholder="Description"
              value={description}
              maxLength={2000}
              onChange={e => setDescription(e.target.value)}
            />
            <label className="flex items-center gap-2 text-xs sm:text-sm">
              <input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} />
              I own this audio or have permission to share it publicly.
            </label>
            <Button
              disabled={!rights || !draftId || !!busy}
              onClick={() =>
                action('share', async () => {
                  if (draftId.startsWith('yoto:')) {
                    await shareYoto({ data: { cardId: draftId.slice(5), description, rightsConfirmed: true } });
                  } else {
                    await share({ data: { id: draftId, description, rightsConfirmed: true } });
                  }
                  setSharing(false);
                }, 'Playlist is now public with cover art!')
              }
            >
              Publish playlist
            </Button>
          </DialogContent>
        </Dialog>

        {/* Dialog for LibriVox Books */}
        <Dialog open={!!book} onOpenChange={o => !o && setBook(null)}>
          <DialogContent>
            <DialogHeader>
              {book?.cover && (
                <img src={book.cover} alt={`Cover of ${book.title}`} className="mx-auto size-40 rounded-xl object-cover" />
              )}
              <DialogTitle>{book?.title}</DialogTitle>
              <DialogDescription>
                {book?.author ? `${book.author}. ` : ''}LibriVox volunteer recording.
              </DialogDescription>
            </DialogHeader>
            <label className="flex items-center gap-2 text-xs sm:text-sm">
              <input type="checkbox" checked={bookRights} onChange={e => setBookRights(e.target.checked)} />
              I checked that this book can be used in my country.
            </label>
            <Button
              disabled={!bookRights || !!busy}
              onClick={() => {
                if (book) {
                  void action('book', async () => {
                    await toYoto({ data: { bookId: book.id, rightsConfirmed: true } });
                    setBook(null);
                  }, 'Audiobook added to your Yoto library with chapters and cover!');
                }
              }}
            >
              <Plus className="size-4 mr-1.5" />
              Add to My Playlists
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
