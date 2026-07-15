-- Provider message id for sent replies (docs/meta_outbound.md §5/§6.5).
-- Gmail message id, WhatsApp wamid, or Messenger/Instagram message_id returned by the
-- transport — lets a later delivery-status webhook match back to the draft.

alter table public.reply_drafts
  add column if not exists provider_message_id text;

comment on column public.reply_drafts.provider_message_id is
  'Transport-returned message id (Gmail id / WhatsApp wamid / Messenger message_id) recorded at send time.';
