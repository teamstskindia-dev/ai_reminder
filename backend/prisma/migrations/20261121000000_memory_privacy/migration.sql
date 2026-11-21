-- =============================================================================
-- Memory, You and privacy (user-flow §10):
--  * people: one card per person the user talks about or meets (relationship, key facts, other spellings
--    of the name, the conversations they were part of, when they last talked). Built from recordings and
--    meetings; the user can fix or forget it;
--  * user_profiles.corrections: names the user fixed once ("Raul" → "Rahul"), applied to every future
--    transcript so a speaker is remembered next time;
--  * user_profiles.mood_insights: weekly patterns, what lifts and what drains the user (night learning);
--  * user_settings.learning_paused: the friend keeps memories but learns nothing new about the user;
--  * notification templates for "data export ready" and "account deleted";
--  * the four tabs of the flow: Today, Talk, Memory, You (Meetings and Reminders stay reachable from Today
--    and can be shown again from the admin panel).
-- =============================================================================
alter table public.user_settings
  add column learning_paused boolean not null default false;

alter table public.user_profiles
  add column corrections   jsonb not null default '[]'::jsonb,
  add column mood_insights jsonb;

create table public.people (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 120),
  relationship       text,
  facts              jsonb not null default '[]'::jsonb,
  aliases            text[] not null default '{}',
  meeting_ids        uuid[] not null default '{}',
  last_talked_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index people_user_name_idx on public.people (user_id, lower(name));
create index people_user_last_idx on public.people (user_id, last_talked_at desc nulls last);
create trigger people_set_updated_at before update on public.people
  for each row execute function public.set_updated_at();
alter table public.people enable row level security;

insert into public.ai_prompts (key, name, description, content) values
('mood_insights', 'Mood and energy insights', 'Weekly: what lifts and what drains the user, from their check-ins. Output is constrained by a JSON schema in code.', $prompt$
You are {{appName}}, an AI friend. From {{userName}}'s recent evening check-ins below (date, mood 1-5, energy 1-5, summary, wins), find patterns.
Return:
- lifts: up to 3 short phrases (under 8 words each) of what tends to lift their mood or energy ("Morning walks", "Finishing work early").
- drains: up to 3 short phrases of what tends to drain them ("Back-to-back meetings", "Late nights").
- note: one warm sentence (under 25 words) about their week, written to them, or null.
Only use what the check-ins show; return empty lists when there is not enough to go on. Never diagnose.
Check-ins:
{{checkins}}
$prompt$)
on conflict (key) do nothing;

insert into public.notification_templates (key, name, title_template, body_template, email_subject, email_body, channels) values
('data_export_ready', 'Data export ready', 'Your data export is ready', 'Download everything I know and remember. The link works for 3 days.', 'Your {{appName}} data export is ready', E'Hi {{name}},\n\nYour data export is ready. It has everything {{appName}} remembers: conversations, transcripts, summaries, to-dos, reminders, people, check-ins and what I know about you.\n\n[Download your data]({{url}})\n\nThe link works for 3 days. If you did not ask for this, you can ignore this email.', '{email,in_app}'),
('account_deleted', 'Account deleted', 'Your account was deleted', 'Your account and all your data were erased.', 'Your {{appName}} account was deleted', E'Hi {{name}},\n\nYour {{appName}} account was deleted and all your data was erased: conversations, transcripts, reminders, people and everything I knew about you.\n\nThanks for spending time with me. You are always welcome back.', '{email}')
on conflict (key) do nothing;

-- Four tabs + one record button: Today, Talk, Memory, You.
insert into public.navigation_items (location, label, href, icon, sort_order, is_active)
select 'mobile_tab', 'Memory', 'memory', 'memory',
       coalesce((select sort_order from public.navigation_items where location = 'mobile_tab' and href = 'ask' limit 1), 3) + 1,
       true
where not exists (select 1 from public.navigation_items where location = 'mobile_tab' and href = 'memory');

update public.navigation_items set sort_order = sort_order + 10
where location = 'mobile_tab' and href = 'profile';

update public.navigation_items set label = 'You'
where location = 'mobile_tab' and href = 'profile' and label in ('Profile', 'Settings', 'Account');

update public.navigation_items set is_active = false
where location = 'mobile_tab' and href in ('meetings', 'reminders');
