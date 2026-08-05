CREATE TABLE public.families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.family_role AS ENUM ('admin','member');

CREATE TABLE public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  role public.family_role NOT NULL DEFAULT 'member',
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, user_id)
);

CREATE TABLE public.family_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.family_role NOT NULL DEFAULT 'member',
  can_edit boolean NOT NULL DEFAULT false,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, email)
);

CREATE TABLE public.family_shared_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  card_id text NOT NULL,
  title text NOT NULL,
  artwork text,
  can_edit boolean NOT NULL DEFAULT false,
  shared_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, card_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_shared_playlists TO authenticated;
GRANT ALL ON public.families TO service_role;
GRANT ALL ON public.family_members TO service_role;
GRANT ALL ON public.family_invites TO service_role;
GRANT ALL ON public.family_shared_playlists TO service_role;

CREATE OR REPLACE FUNCTION public.is_family_member(_family_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.family_members WHERE family_id = _family_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_family_admin(_family_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_members
    WHERE family_id = _family_id AND user_id = _user_id AND role = 'admin'
  );
$$;

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_shared_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read families" ON public.families FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_family_member(id, auth.uid()));
CREATE POLICY "Users create families" ON public.families FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Admins update families" ON public.families FOR UPDATE TO authenticated
  USING (public.is_family_admin(id, auth.uid())) WITH CHECK (public.is_family_admin(id, auth.uid()));
CREATE POLICY "Owner deletes family" ON public.families FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Members read member list" ON public.family_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_family_member(family_id, auth.uid()));
CREATE POLICY "Self or admin insert member" ON public.family_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_family_admin(family_id, auth.uid())
  );
CREATE POLICY "Admins update members" ON public.family_members FOR UPDATE TO authenticated
  USING (public.is_family_admin(family_id, auth.uid()))
  WITH CHECK (public.is_family_admin(family_id, auth.uid()));
CREATE POLICY "Admins or self remove members" ON public.family_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_family_admin(family_id, auth.uid()));

CREATE POLICY "Invitee or family reads invites" ON public.family_invites FOR SELECT TO authenticated
  USING (
    public.is_family_member(family_id, auth.uid())
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );
CREATE POLICY "Admins create invites" ON public.family_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_family_admin(family_id, auth.uid()) AND invited_by = auth.uid());
CREATE POLICY "Invitee or admin updates invites" ON public.family_invites FOR UPDATE TO authenticated
  USING (
    public.is_family_admin(family_id, auth.uid())
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  )
  WITH CHECK (
    public.is_family_admin(family_id, auth.uid())
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );
CREATE POLICY "Admins delete invites" ON public.family_invites FOR DELETE TO authenticated
  USING (public.is_family_admin(family_id, auth.uid()));

CREATE POLICY "Members read shared playlists" ON public.family_shared_playlists FOR SELECT TO authenticated
  USING (public.is_family_member(family_id, auth.uid()));
CREATE POLICY "Admins share playlists" ON public.family_shared_playlists FOR INSERT TO authenticated
  WITH CHECK (public.is_family_admin(family_id, auth.uid()) AND shared_by = auth.uid());
CREATE POLICY "Admins update shared playlists" ON public.family_shared_playlists FOR UPDATE TO authenticated
  USING (public.is_family_admin(family_id, auth.uid()))
  WITH CHECK (public.is_family_admin(family_id, auth.uid()));
CREATE POLICY "Admins unshare playlists" ON public.family_shared_playlists FOR DELETE TO authenticated
  USING (public.is_family_admin(family_id, auth.uid()));