CREATE TABLE IF NOT EXISTS public.analytics_page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_path text NOT NULL CHECK (char_length(page_path) BETWEEN 1 AND 500),
  visited_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_page_visits_visited_at_idx
  ON public.analytics_page_visits (visited_at DESC);
CREATE INDEX IF NOT EXISTS analytics_page_visits_user_visited_at_idx
  ON public.analytics_page_visits (user_id, visited_at DESC);

ALTER TABLE public.analytics_page_visits ENABLE ROW LEVEL SECURITY;

-- Authenticated users may record only their own visits; reads are intentionally not granted
-- to clients. Admin reports are served by a server function after checking the admin role.
GRANT INSERT ON public.analytics_page_visits TO authenticated;
GRANT ALL ON public.analytics_page_visits TO service_role;
CREATE POLICY "Users can record own page visits" ON public.analytics_page_visits
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
