ALTER TABLE public.checkpoints
  ADD COLUMN IF NOT EXISTS auto_target uuid,
  ADD COLUMN IF NOT EXISTS is_checkpoint boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waypoints jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS yoto_track jsonb;
ALTER TABLE public.studio_projects
  ADD COLUMN IF NOT EXISTS yoto_card_id text;