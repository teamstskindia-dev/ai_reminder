-- =============================================================================
-- Remi — aggregate functions for dashboards and analytics.
-- Called from the API with Prisma $queryRaw (tagged templates, parameterised).
-- All return jsonb already shaped like the API contract (camelCase keys).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GET /dashboard/home → DashboardHome.stats
-- "This week" = ISO week (Monday 00:00) in the user's time zone.
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_home_stats(p_user_id uuid, p_tz text default 'UTC')
returns jsonb
language sql
stable
set search_path = public
as $$
  with bounds as (
    select (date_trunc('week', now() at time zone p_tz) at time zone p_tz) as week_start
  ),
  wk as (
    select m.id, m.start_at, m.end_at, m.duration_seconds, m.status, r.meeting_score
    from public.meetings m
    left join public.meeting_reports r on r.meeting_id = m.id
    cross join bounds b
    where m.user_id = p_user_id
      and m.start_at >= b.week_start
      and m.start_at < b.week_start + interval '7 days'
      and m.status <> 'cancelled'
  )
  select jsonb_build_object(
    'meetingsThisWeek', (select count(*) from wk),
    'hoursThisWeek', round(coalesce((
        select sum(coalesce(duration_seconds, greatest(0, extract(epoch from (end_at - start_at)))::int, 0))
        from wk where start_at <= now()
      ), 0)::numeric / 3600, 1),
    'openActionItems', (select count(*) from public.action_items where user_id = p_user_id and status = 'open'),
    'pendingReminders', (
      select count(*) from public.reminders
      where user_id = p_user_id and status = 'pending' and remind_at >= now()
    ),
    'avgMeetingScore', (select round(avg(meeting_score), 1) from wk where meeting_score is not null)
  );
$$;

-- -----------------------------------------------------------------------------
-- GET /analytics/overview → AnalyticsOverview (minus `range`, added by the API)
-- Counts completed meetings with start_at in [p_from, p_to). Days and hours are
-- bucketed in p_tz and zero-filled.
-- -----------------------------------------------------------------------------
create or replace function public.analytics_overview(
  p_user_id uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_tz      text default 'UTC'
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with m as (
    select
      m.id,
      m.start_at,
      coalesce(m.duration_seconds, greatest(0, extract(epoch from (m.end_at - m.start_at)))::int, 0) as secs,
      r.meeting_score,
      r.engagement_score,
      r.sentiment_score,
      r.sentiment_label,
      coalesce(r.topics, '{}') as topics
    from public.meetings m
    left join public.meeting_reports r on r.meeting_id = m.id
    where m.user_id = p_user_id
      and m.status = 'completed'
      and m.start_at >= p_from
      and m.start_at < p_to
  ),
  days as (
    select d::date as day
    from generate_series(
      (p_from at time zone p_tz)::date,
      ((p_to - interval '1 microsecond') at time zone p_tz)::date,
      interval '1 day'
    ) as d
  ),
  by_day as (
    select d.day, count(m.id) as meetings, coalesce(sum(m.secs), 0) as secs, avg(m.meeting_score) as avg_score
    from days d
    left join m on (m.start_at at time zone p_tz)::date = d.day
    group by d.day
  ),
  by_hour as (
    select h.hour, count(m.id) as meetings
    from generate_series(0, 23) as h(hour)
    left join m on extract(hour from (m.start_at at time zone p_tz))::int = h.hour
    group by h.hour
  ),
  topics as (
    select t.topic, count(*) as cnt
    from m, unnest(m.topics) as t(topic)
    where t.topic <> ''
    group by t.topic
    order by cnt desc, t.topic
    limit 10
  ),
  parts as (
    select min(p.name) as name, count(distinct p.meeting_id) as meetings, sum(p.talk_time_seconds) as talk
    from public.meeting_participants p
    join m on m.id = p.meeting_id
    group by lower(p.name)
    order by talk desc, name
    limit 10
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'meetings', (select count(*) from m),
      'totalMinutes', (select round(coalesce(sum(secs), 0) / 60.0) from m),
      'avgMeetingMinutes', (select coalesce(round(avg(secs) / 60.0, 1), 0) from m),
      'avgMeetingScore', (select round(avg(meeting_score), 1) from m),
      'avgEngagementScore', (select round(avg(engagement_score), 1) from m),
      'avgSentimentScore', (select round(avg(sentiment_score), 1) from m),
      'actionItemsCreated', (
        select count(*) from public.action_items a
        where a.user_id = p_user_id and a.created_at >= p_from and a.created_at < p_to
      ),
      'actionItemsCompleted', (
        select count(*) from public.action_items a
        where a.user_id = p_user_id and a.completed_at >= p_from and a.completed_at < p_to
      )
    ),
    'byDay', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD'),
        'meetings', meetings,
        'minutes', round(secs / 60.0),
        'avgScore', round(avg_score, 1)
      ) order by day), '[]'::jsonb)
      from by_day
    ),
    'sentimentBreakdown', jsonb_build_object(
      'positive', (select count(*) from m where sentiment_label = 'positive'),
      'neutral', (select count(*) from m where sentiment_label = 'neutral'),
      'negative', (select count(*) from m where sentiment_label = 'negative')
    ),
    'topTopics', (
      select coalesce(jsonb_agg(jsonb_build_object('topic', topic, 'count', cnt) order by cnt desc, topic), '[]'::jsonb)
      from topics
    ),
    'topParticipants', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', name, 'meetings', meetings, 'talkTimeSeconds', talk
      ) order by talk desc, name), '[]'::jsonb)
      from parts
    ),
    'byHourOfDay', (
      select jsonb_agg(jsonb_build_object('hour', hour, 'meetings', meetings) order by hour) from by_hour
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- GET /admin/dashboard/stats → AdminDashboardStats (minus `queues`, added by the API)
-- Day buckets are UTC, last 30 days, zero-filled.
-- -----------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb
language sql
stable
set search_path = public
as $$
  with days as (
    select d::date as day
    from generate_series(
      (now() at time zone 'UTC')::date - 29,
      (now() at time zone 'UTC')::date,
      interval '1 day'
    ) as d
  )
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from public.users),
      'newLast7Days', (select count(*) from public.users where created_at >= now() - interval '7 days'),
      'activeLast7Days', (
        select count(*) from public.users u
        where u.last_login_at >= now() - interval '7 days'
           or exists (
             select 1 from public.meetings m
             where m.user_id = u.id and m.start_at >= now() - interval '7 days'
               and m.status in ('in_progress', 'processing', 'completed')
           )
      ),
      'suspended', (select count(*) from public.users where status = 'suspended')
    ),
    'meetings', jsonb_build_object(
      'total', (select count(*) from public.meetings),
      'today', (
        select count(*) from public.meetings
        where (start_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date
      ),
      'inProgress', (select count(*) from public.meetings where status in ('joining', 'waiting_room', 'in_progress')),
      'processing', (select count(*) from public.meetings where status = 'processing'),
      'failedLast7Days', (
        select count(*) from public.meetings where status = 'failed' and updated_at >= now() - interval '7 days'
      ),
      'completedLast7Days', (
        select count(*) from public.meetings where status = 'completed' and updated_at >= now() - interval '7 days'
      )
    ),
    'actionItems', jsonb_build_object(
      'total', (select count(*) from public.action_items),
      'open', (select count(*) from public.action_items where status = 'open')
    ),
    'reminders', jsonb_build_object(
      'pending', (select count(*) from public.reminders where status = 'pending'),
      'sentLast7Days', (select count(*) from public.reminders where status = 'sent' and sent_at >= now() - interval '7 days')
    ),
    'signupsByDay', (
      select jsonb_agg(jsonb_build_object(
        'date', to_char(d.day, 'YYYY-MM-DD'),
        'count', (select count(*) from public.users u where (u.created_at at time zone 'UTC')::date = d.day)
      ) order by d.day)
      from days d
    ),
    'meetingsByDay', (
      select jsonb_agg(jsonb_build_object(
        'date', to_char(d.day, 'YYYY-MM-DD'),
        'completed', (
          select count(*) from public.meetings m
          where m.status = 'completed' and (m.updated_at at time zone 'UTC')::date = d.day
        ),
        'failed', (
          select count(*) from public.meetings m
          where m.status = 'failed' and (m.updated_at at time zone 'UTC')::date = d.day
        )
      ) order by d.day)
      from days d
    )
  );
$$;
