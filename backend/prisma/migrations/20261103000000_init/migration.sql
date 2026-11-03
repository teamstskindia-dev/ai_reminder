-- =============================================================================
-- Remi — initial schema
-- Conventions: uuid PKs, timestamptz (UTC), snake_case, status = text + CHECK,
-- updated_at maintained by trigger. Only the backend (service role) touches
-- these tables; RLS is enabled with no policies so anon/auth keys see nothing.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Plans (pricing, limits)
-- -----------------------------------------------------------------------------
create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text,
  price_monthly numeric(10, 2) not null default 0,
  price_yearly  numeric(10, 2) not null default 0,
  currency      text not null default 'USD',
  features      jsonb not null default '[]'::jsonb,   -- string[]
  limits        jsonb not null default '{}'::jsonb,   -- { meetingsPerMonth, aiQueriesPerDay, uploadMinutesPerMonth }
  cta_label     text,
  is_default    boolean not null default false,        -- assigned to new users
  is_popular    boolean not null default false,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index plans_single_default on public.plans (is_default) where is_default;

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
create table public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text,
  avatar_url    text,
  google_sub    text unique,
  timezone      text not null default 'UTC',
  locale        text not null default 'en',
  status        text not null default 'active' check (status in ('active', 'suspended')),
  plan_id       uuid references public.plans (id) on delete set null,
  onboarded_at  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index users_email_key on public.users (lower(email));
create index users_created_at_idx on public.users (created_at desc);
create index users_search_idx on public.users using gin ((coalesce(name, '') || ' ' || email) gin_trgm_ops);

create table public.user_settings (
  user_id                  uuid primary key references public.users (id) on delete cascade,
  auto_join                text not null default 'all' check (auto_join in ('all', 'owned', 'none')),
  bot_name                 text,
  meeting_reminder_minutes int not null default 10 check (meeting_reminder_minutes between 0 and 1440),
  daily_digest             boolean not null default true,
  digest_hour              int not null default 8 check (digest_hour between 0 and 23),
  email_notifications      boolean not null default true,
  push_notifications       boolean not null default true,
  updated_at               timestamptz not null default now()
);

create table public.google_accounts (
  user_id            uuid primary key references public.users (id) on delete cascade,
  google_email       text not null,
  access_token_enc   text,
  refresh_token_enc  text,
  scope              text,
  token_expires_at   timestamptz,
  calendar_connected boolean not null default false,
  calendar_sync_token text,
  last_synced_at     timestamptz,
  sync_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Admins
-- -----------------------------------------------------------------------------
create table public.admins (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text not null,
  password_hash text not null,
  role          text not null default 'editor' check (role in ('super_admin', 'admin', 'editor', 'viewer')),
  status        text not null default 'active' check (status in ('active', 'disabled')),
  avatar_url    text,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index admins_email_key on public.admins (lower(email));

-- -----------------------------------------------------------------------------
-- Auth sessions (hashed refresh tokens, rotation families) for users + admins
-- -----------------------------------------------------------------------------
create table public.auth_sessions (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'admin')),
  subject_id   uuid not null,
  family_id    uuid not null,
  token_hash   text not null unique,
  user_agent   text,
  ip           text,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  replaced_by  uuid references public.auth_sessions (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index auth_sessions_subject_idx on public.auth_sessions (subject_type, subject_id);
create index auth_sessions_family_idx on public.auth_sessions (family_id);

-- -----------------------------------------------------------------------------
-- Meetings
-- -----------------------------------------------------------------------------
create table public.meetings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  source            text not null default 'calendar' check (source in ('calendar', 'manual', 'upload')),
  calendar_event_id text,
  ical_uid          text,
  title             text not null default 'Untitled meeting',
  description       text,
  platform          text not null default 'google_meet' check (platform in ('google_meet', 'zoom', 'teams', 'other')),
  meeting_url       text,
  start_at          timestamptz not null,
  end_at            timestamptz,
  timezone          text,
  organizer_email   text,
  is_organizer      boolean not null default false,
  attendees         jsonb not null default '[]'::jsonb, -- [{ email, name, responseStatus, organizer }]
  status            text not null default 'scheduled' check (status in (
                      'scheduled', 'joining', 'waiting_room', 'in_progress',
                      'processing', 'completed', 'failed', 'cancelled', 'skipped')),
  auto_join         boolean not null default true,
  bot_job_id        text,
  bot_joined_at     timestamptz,
  bot_left_at       timestamptz,
  failure_reason    text,
  duration_seconds  int,
  recording_path    text,
  language          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, calendar_event_id)
);
create index meetings_user_start_idx on public.meetings (user_id, start_at desc);
create index meetings_status_idx on public.meetings (status);
create index meetings_title_trgm_idx on public.meetings using gin (title gin_trgm_ops);

create table public.meeting_participants (
  id                uuid primary key default gen_random_uuid(),
  meeting_id        uuid not null references public.meetings (id) on delete cascade,
  name              text not null,
  email             text,
  talk_time_seconds int not null default 0,
  word_count        int not null default 0,
  talk_ratio        numeric(5, 2) not null default 0, -- 0..100 (% of meeting words)
  created_at        timestamptz not null default now(),
  unique (meeting_id, name)
);

create table public.transcript_segments (
  id         bigint generated always as identity primary key,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  seq        int not null,
  speaker    text not null default 'Unknown',
  text       text not null,
  start_ms   int not null default 0,
  end_ms     int,
  created_at timestamptz not null default now(),
  unique (meeting_id, seq)
);

create table public.meeting_reports (
  meeting_id       uuid primary key references public.meetings (id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete cascade,
  summary          text not null,
  key_points       jsonb not null default '[]'::jsonb, -- string[]
  chapters         jsonb not null default '[]'::jsonb, -- [{ title, summary, startMs }]
  key_questions    jsonb not null default '[]'::jsonb, -- [{ question, answer, askedBy }]
  decisions        jsonb not null default '[]'::jsonb, -- string[]
  topics           text[] not null default '{}',
  sentiment_score  numeric(5, 2), -- 0..100
  engagement_score numeric(5, 2), -- 0..100
  meeting_score    numeric(5, 2), -- 0..100 overall
  sentiment_label  text check (sentiment_label in ('positive', 'neutral', 'negative')),
  model            text,
  prompt_version   int,
  raw              jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index meeting_reports_user_idx on public.meeting_reports (user_id, created_at desc);

create table public.meeting_chunks (
  id          bigint generated always as identity primary key,
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  chunk_index int not null,
  content     text not null,
  embedding   extensions.vector(768),
  created_at  timestamptz not null default now(),
  unique (meeting_id, chunk_index)
);
create index meeting_chunks_user_idx on public.meeting_chunks (user_id);
create index meeting_chunks_embedding_idx on public.meeting_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- Action items, reminders, notifications, devices
-- -----------------------------------------------------------------------------
create table public.action_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  meeting_id     uuid references public.meetings (id) on delete set null,
  title          text not null,
  description    text,
  assignee_name  text,
  assignee_email text,
  is_mine        boolean not null default true,
  due_at         timestamptz,
  priority       text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status         text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  source         text not null default 'manual' check (source in ('ai', 'manual')),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index action_items_user_status_idx on public.action_items (user_id, status, due_at);
create index action_items_meeting_idx on public.action_items (meeting_id);

create table public.reminders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  meeting_id     uuid references public.meetings (id) on delete set null,
  action_item_id uuid references public.action_items (id) on delete set null,
  type           text not null default 'custom' check (type in (
                   'meeting_upcoming', 'action_item_due', 'commitment', 'custom')),
  title          text not null,
  body           text,
  remind_at      timestamptz not null,
  channels       text[] not null default '{push,in_app}',
  status         text not null default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  source         text not null default 'manual' check (source in ('ai', 'manual', 'system')),
  job_id         text,
  sent_at        timestamptz,
  failure_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index reminders_user_time_idx on public.reminders (user_id, remind_at);
create index reminders_pending_idx on public.reminders (remind_at) where status = 'pending';
-- one system "meeting starts soon" reminder per meeting
create unique index reminders_meeting_upcoming_key on public.reminders (meeting_id)
  where type = 'meeting_upcoming';

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  expo_push_token text not null unique,
  platform        text not null check (platform in ('android', 'ios', 'web')),
  device_name     text,
  app_version     text,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index devices_user_idx on public.devices (user_id);

-- -----------------------------------------------------------------------------
-- Ask AI
-- -----------------------------------------------------------------------------
create table public.assistant_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assistant_threads_user_idx on public.assistant_threads (user_id, updated_at desc);

create table public.assistant_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.assistant_threads (id) on delete cascade,
  user_id    uuid not null references public.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  sources    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index assistant_messages_thread_idx on public.assistant_messages (thread_id, created_at);

-- -----------------------------------------------------------------------------
-- CMS / dynamic configuration (managed from the admin panel)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  is_public   boolean not null default false,
  description text,
  updated_by  uuid references public.admins (id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table public.content_sections (
  id         uuid primary key default gen_random_uuid(),
  page       text not null,  -- landing | pricing | login | mobile_onboarding | mobile_home
  type       text not null check (type in (
               'hero', 'logos', 'features', 'steps', 'stats', 'testimonials',
               'pricing', 'faq', 'cta', 'rich_text', 'onboarding_slide')),
  name       text not null,  -- internal label shown in the admin list
  content    jsonb not null default '{}'::jsonb,
  platform   text not null default 'all' check (platform in ('web', 'mobile', 'all')),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_sections_page_idx on public.content_sections (page, sort_order);

create table public.cms_pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title        text not null,
  content      text not null default '', -- markdown
  seo          jsonb not null default '{}'::jsonb, -- { title, description, ogImageUrl }
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  updated_by   uuid references public.admins (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.navigation_items (
  id               uuid primary key default gen_random_uuid(),
  location         text not null check (location in ('header', 'footer', 'sidebar', 'mobile_tab')),
  label            text not null,
  href             text not null,
  icon             text,         -- icon key, see API contract §Icons
  group_label      text,         -- footer column heading
  required_feature text,         -- feature flag key; hidden when the flag is off
  is_external      boolean not null default false,
  sort_order       int not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index navigation_items_location_idx on public.navigation_items (location, sort_order);

create table public.banners (
  id         uuid primary key default gen_random_uuid(),
  platform   text not null default 'all' check (platform in ('web', 'mobile', 'all')),
  placement  text not null default 'dashboard' check (placement in ('dashboard', 'landing_top', 'mobile_home')),
  variant    text not null default 'info' check (variant in ('info', 'success', 'warning', 'promo')),
  title      text not null,
  body       text,
  image_url  text,
  cta_label  text,
  cta_url    text,
  starts_at  timestamptz,
  ends_at    timestamptz,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_assets (
  id            uuid primary key default gen_random_uuid(),
  public_id     text not null unique,
  url           text not null,
  resource_type text not null default 'image',
  format        text,
  width         int,
  height        int,
  bytes         int,
  folder        text,
  alt           text,
  uploaded_by   uuid references public.admins (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index media_assets_created_idx on public.media_assets (created_at desc);

create table public.ai_prompts (
  key         text primary key, -- meeting_report | assistant_answer | audio_transcription
  name        text not null,
  description text,
  content     text not null,    -- supports {{variables}}
  version     int not null default 1,
  updated_by  uuid references public.admins (id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table public.notification_templates (
  key            text primary key, -- meeting_upcoming | report_ready | action_item_due | reminder | daily_digest | bot_failed
  name           text not null,
  title_template text not null,
  body_template  text not null,
  email_subject  text,
  email_body     text,             -- markdown, supports {{variables}}
  channels       text[] not null default '{push,in_app}',
  is_active      boolean not null default true,
  updated_by     uuid references public.admins (id) on delete set null,
  updated_at     timestamptz not null default now()
);

create table public.broadcasts (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  audience   jsonb not null default '{"type":"all"}'::jsonb, -- { type: 'all' } | { type: 'users', userIds: [] } | { type: 'plan', planId }
  channels   text[] not null default '{push,in_app}',
  sent_count int not null default 0,
  created_by uuid references public.admins (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  admin_id   uuid references public.admins (id) on delete set null,
  action     text not null,  -- e.g. settings.update, user.suspend
  entity     text not null,
  entity_id  text,
  changes    jsonb,
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'plans', 'users', 'user_settings', 'google_accounts', 'admins', 'meetings',
    'meeting_reports', 'action_items', 'reminders', 'assistant_threads',
    'app_settings', 'content_sections', 'cms_pages', 'navigation_items', 'banners',
    'ai_prompts', 'notification_templates'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS: deny everything to anon/authenticated; backend uses the service role.
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: semantic search over a user's meeting memory
-- -----------------------------------------------------------------------------
create or replace function public.match_meeting_chunks(
  p_user_id         uuid,
  p_query_embedding extensions.vector(768),
  p_match_count     int default 8,
  p_meeting_id      uuid default null,
  p_min_similarity  float default 0.3
)
returns table (
  meeting_id uuid,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    c.meeting_id,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.meeting_chunks c
  where c.user_id = p_user_id
    and (p_meeting_id is null or c.meeting_id = p_meeting_id)
    and c.embedding is not null
    and 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- The private `recordings` Storage bucket is created by the API on boot (Supabase Storage),
-- so this migration also runs on plain Postgres and on Prisma's shadow database.
