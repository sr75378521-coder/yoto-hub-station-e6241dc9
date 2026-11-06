-- 1. AI Yoto drafts & credit tracking
CREATE TABLE IF NOT EXISTS public.ai_yoto_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled audio',
  chapters jsonb NOT NULL DEFAULT '[]',
  yoto_card_id text,
  source_public_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_yoto_drafts TO authenticated;
GRANT ALL ON public.ai_yoto_drafts TO service_role;
ALTER TABLE public.ai_yoto_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner drafts" ON public.ai_yoto_drafts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.billing_accounts (
  user_id uuid PRIMARY KEY,
  stripe_customer_id text UNIQUE NOT NULL
);
GRANT SELECT ON public.billing_accounts TO authenticated;
GRANT ALL ON public.billing_accounts TO service_role;
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner billing read" ON public.billing_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ai_credit_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period text NOT NULL,
  request_key text NOT NULL,
  credits integer NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, request_key)
);
GRANT SELECT ON public.ai_credit_usage TO authenticated;
GRANT ALL ON public.ai_credit_usage TO service_role;
ALTER TABLE public.ai_credit_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner credit read" ON public.ai_credit_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.membership_grants (
  user_id uuid PRIMARY KEY,
  plan text NOT NULL CHECK (plan IN ('basic','pro','pro_max')),
  granted_by uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.membership_grants TO authenticated;
GRANT ALL ON public.membership_grants TO service_role;
ALTER TABLE public.membership_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own or admin grants" ON public.membership_grants FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 2. Public playlists & comments
CREATE TABLE IF NOT EXISTS public.public_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_url text,
  author text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'community' CHECK (source IN ('community','librivox')),
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_playlists TO authenticated;
GRANT ALL ON public.public_playlists TO service_role;
ALTER TABLE public.public_playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read published or own playlists" ON public.public_playlists FOR SELECT TO authenticated USING (is_public OR auth.uid() = user_id);
CREATE POLICY "Members create own playlists" ON public.public_playlists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners update playlists" ON public.public_playlists FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners remove playlists" ON public.public_playlists FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.playlist_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL REFERENCES public.public_playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  author_name text NOT NULL DEFAULT 'Member',
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.playlist_comments TO authenticated;
GRANT ALL ON public.playlist_comments TO service_role;
ALTER TABLE public.playlist_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read comments on visible playlists" ON public.playlist_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.public_playlists p WHERE p.id = playlist_id AND (p.is_public OR p.user_id = auth.uid())));
CREATE POLICY "Comment on public playlists" ON public.playlist_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.public_playlists p WHERE p.id = playlist_id AND p.is_public));
CREATE POLICY "Delete own or admin comments" ON public.playlist_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 3. AI credit reservation function
CREATE OR REPLACE FUNCTION public.reserve_ai_credits(p_user uuid, p_period text, p_key text, p_cost integer, p_allowance integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.ai_credit_usage; used integer;
BEGIN
  IF p_cost < 1 OR p_allowance < 0 THEN RAISE EXCEPTION 'Invalid credit amount'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  SELECT * INTO existing FROM public.ai_credit_usage WHERE user_id=p_user AND request_key=p_key;
  IF FOUND THEN
    IF existing.status='completed' THEN RETURN jsonb_build_object('cached',true,'result',existing.result); END IF;
    IF existing.status='reserved' THEN RAISE EXCEPTION 'This request is already running'; END IF;
  END IF;
  SELECT COALESCE(sum(credits),0) INTO used FROM public.ai_credit_usage WHERE user_id=p_user AND period=p_period AND status IN ('reserved','completed');
  IF used+p_cost>p_allowance THEN RAISE EXCEPTION 'Not enough AI credits. Choose a higher plan or wait for your next monthly allowance.'; END IF;
  INSERT INTO public.ai_credit_usage(user_id,period,request_key,credits,status) VALUES(p_user,p_period,p_key,p_cost,'reserved') ON CONFLICT(user_id,request_key) DO UPDATE SET period=p_period,credits=p_cost,status='reserved',result=NULL;
  RETURN jsonb_build_object('cached',false);
END; $$;
REVOKE ALL ON FUNCTION public.reserve_ai_credits(uuid,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credits(uuid,text,text,integer,integer) TO service_role;
