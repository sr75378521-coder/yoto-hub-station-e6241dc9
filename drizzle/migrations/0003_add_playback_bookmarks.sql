-- Playback resume and named bookmark storage (managed migration).
CREATE TABLE IF NOT EXISTS public.playback_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('browser', 'player')),
  target_id text NOT NULL CHECK (char_length(target_id) BETWEEN 1 AND 200),
  state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target, target_id)
);
CREATE INDEX IF NOT EXISTS playback_checkpoints_user_updated_idx
  ON public.playback_checkpoints (user_id, updated_at DESC);
ALTER TABLE public.playback_checkpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own playback checkpoints" ON public.playback_checkpoints;
CREATE POLICY "Users manage their own playback checkpoints"
  ON public.playback_checkpoints FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playback_checkpoints TO authenticated;

CREATE TABLE IF NOT EXISTS public.playback_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('browser', 'player')),
  target_id text NOT NULL CHECK (char_length(target_id) BETWEEN 1 AND 200),
  label text NOT NULL DEFAULT 'Bookmark' CHECK (char_length(label) BETWEEN 1 AND 100),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS playback_bookmarks_user_target_created_idx
  ON public.playback_bookmarks (user_id, target, target_id, created_at DESC);
ALTER TABLE public.playback_bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own playback bookmarks" ON public.playback_bookmarks;
CREATE POLICY "Users manage their own playback bookmarks"
  ON public.playback_bookmarks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playback_bookmarks TO authenticated;
