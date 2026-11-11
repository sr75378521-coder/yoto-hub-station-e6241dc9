CREATE TABLE public.email_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_template text NOT NULL,
  sender_email text NOT NULL,
  total_recipients integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.email_batches TO service_role;
ALTER TABLE public.email_batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sent_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.email_batches(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_label text NOT NULL DEFAULT '',
  subject text NOT NULL,
  tracking_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  gmail_message_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_sent_emails_batch_id ON public.sent_emails(batch_id);
CREATE INDEX idx_sent_emails_sent_at ON public.sent_emails(sent_at DESC);

GRANT ALL ON public.sent_emails TO service_role;
ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_email_open(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer;
BEGIN
  UPDATE public.sent_emails
  SET
    first_opened_at = COALESCE(first_opened_at, now()),
    last_opened_at = now(),
    open_count = open_count + 1
  WHERE tracking_token = _token
    AND status = 'sent'
    AND now() > sent_at + interval '2 seconds';

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.record_email_open(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_email_open(text) TO service_role;