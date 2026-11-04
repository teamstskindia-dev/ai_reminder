-- =============================================================================
-- Meeting bot providers: the self-hosted Chromium runner or Recall.ai
-- (admin → Meeting bot → Provider). Recall.ai webhooks identify a meeting by
-- the provider's bot id, hence the unique index.
-- =============================================================================
alter table public.meetings
  add column bot_provider text check (bot_provider in ('self_hosted', 'recall')),
  add column external_bot_id text;

create unique index meetings_external_bot_id_key on public.meetings (external_bot_id);
