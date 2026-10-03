CREATE TABLE public.studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled project',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_projects TO authenticated;
GRANT ALL ON public.studio_projects TO service_role;
ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner all projects" ON public.studio_projects FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT 'Checkpoint',
  is_start boolean NOT NULL DEFAULT false,
  icon text,
  pos_x double precision NOT NULL DEFAULT 0,
  pos_y double precision NOT NULL DEFAULT 0,
  audio_path text,
  audio_name text,
  audio_size integer,
  audio_duration double precision,
  left_action text NOT NULL DEFAULT 'previous',
  left_target uuid,
  right_action text NOT NULL DEFAULT 'next',
  right_target uuid,
  auto_advance boolean NOT NULL DEFAULT false,
  volume integer NOT NULL DEFAULT 100,
  loop_audio boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkpoints_project_idx ON public.checkpoints(project_id, order_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkpoints TO authenticated;
GRANT ALL ON public.checkpoints TO service_role;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner all checkpoints" ON public.checkpoints FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.player_alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  label text NOT NULL DEFAULT 'Alarm',
  time text NOT NULL DEFAULT '07:00',
  days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  enabled boolean NOT NULL DEFAULT true,
  sound_type text NOT NULL DEFAULT 'playlist',
  sound_card_id text,
  sound_title text,
  volume integer NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_alarms TO authenticated;
GRANT ALL ON public.player_alarms TO service_role;
ALTER TABLE public.player_alarms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner all alarms" ON public.player_alarms FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER studio_projects_touch BEFORE UPDATE ON public.studio_projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER checkpoints_touch BEFORE UPDATE ON public.checkpoints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER player_alarms_touch BEFORE UPDATE ON public.player_alarms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users read own studio audio" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'studio-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users upload own studio audio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'studio-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users update own studio audio" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'studio-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users delete own studio audio" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'studio-audio' AND (storage.foldername(name))[1] = auth.uid()::text);