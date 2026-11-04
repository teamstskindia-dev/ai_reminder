-- =============================================================================
-- Remi — default dynamic content. Everything here is editable in the admin panel.
-- Media uses the public Cloudinary "demo" cloud as dummy assets.
-- The first super admin is NOT seeded here; the API creates it on boot from
-- ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD when the admins table is empty.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, is_public, description, value) values
('branding', true, 'Brand name, logos and contact details', $json$
{
  "appName": "Remi",
  "tagline": "Your AI meeting assistant that never forgets",
  "logoUrl": "https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/o_0/w_240,h_64,c_scale/l_text:Arial_44_bold:Remi,co_rgb:5B4FE9,o_100/sample.png",
  "logoDarkUrl": "https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/o_0/w_240,h_64,c_scale/l_text:Arial_44_bold:Remi,co_white,o_100/sample.png",
  "iconUrl": "https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/e_colorize,co_rgb:5B4FE9/w_192,h_192,c_scale/l_text:Arial_112_bold:R,co_white/r_36/sample.png",
  "faviconUrl": "https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/e_colorize,co_rgb:5B4FE9/w_64,h_64,c_scale/l_text:Arial_40_bold:R,co_white/r_12/sample.png",
  "supportEmail": "support@remi.example.com",
  "companyName": "Remi Labs"
}
$json$::jsonb),
('theme', true, 'Colours, radius and font used by web and mobile', $json$
{
  "primaryColor": "#5B4FE9",
  "primaryForeground": "#FFFFFF",
  "accentColor": "#22C3A6",
  "sidebarBackground": "#0F0E1A",
  "sidebarForeground": "#E7E6F3",
  "radius": 10,
  "fontFamily": "Inter",
  "defaultMode": "light"
}
$json$::jsonb),
('features', true, 'Feature flags (hide/show modules on web + mobile)', $json$
{
  "askAi": true,
  "analytics": true,
  "reminders": true,
  "actionItems": true,
  "calendarSync": true,
  "meetingUpload": true,
  "pushNotifications": true,
  "signupsEnabled": true
}
$json$::jsonb),
('app', true, 'Maintenance mode and mobile version gating', $json$
{
  "maintenanceMode": false,
  "maintenanceMessage": "We are upgrading Remi. Back in a few minutes.",
  "minAppVersion": "1.0.0",
  "latestAppVersion": "1.0.0",
  "androidStoreUrl": "https://play.google.com/store/apps/details?id=com.remi.app",
  "iosStoreUrl": ""
}
$json$::jsonb),
('seo', true, 'Default SEO metadata for the website', $json$
{
  "title": "Remi — AI meeting notes, action items and reminders",
  "description": "Remi joins your Google Meet calls, writes the notes, tracks every commitment and reminds you before things are due.",
  "ogImageUrl": "https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_630/cld-sample-4.jpg",
  "keywords": ["ai meeting assistant", "meeting notes", "google meet notetaker", "action items", "reminders"]
}
$json$::jsonb),
('ai', false, 'Gemini models and generation parameters', $json$
{
  "model": "gemini-3.5-flash",
  "embeddingModel": "gemini-embedding-001",
  "temperature": 0.3,
  "maxOutputTokens": 8192,
  "outputLanguage": "auto",
  "enableEmbeddings": true
}
$json$::jsonb),
('bot', false, 'Meeting bot provider, behaviour and Google Meet DOM selectors (hot-fixable)', $json$
{
  "provider": "self_hosted",
  "recall": {
    "transcription": "recallai_streaming",
    "languageCode": "auto",
    "deleteMediaAfterImport": true
  },
  "botName": "Remi Notetaker",
  "joinBeforeMinutes": 1,
  "waitingRoomTimeoutMinutes": 10,
  "maxDurationMinutes": 180,
  "leaveWhenAloneMinutes": 2,
  "autoJoinDefault": "all",
  "headless": false,
  "selectors": {
    "nameInput": "input[aria-label='Your name'], input[placeholder='Your name']",
    "joinButtonText": "Ask to join|Join now|Join anyway",
    "micOffButton": "[role='button'][aria-label*='Turn off microphone'], button[aria-label*='Turn off microphone']",
    "camOffButton": "[role='button'][aria-label*='Turn off camera'], button[aria-label*='Turn off camera']",
    "dismissButtonText": "Got it|Dismiss|Continue without microphone and camera",
    "captionsButton": "button[aria-label*='Turn on captions']",
    "captionsRegion": "div[role='region'][aria-label='Captions']",
    "captionBlock": "div[role='region'][aria-label='Captions'] > div > div",
    "captionSpeaker": ".NWpY1d, .zs7s8d",
    "captionText": ".ygicle, .iTTPOb",
    "leaveButton": "button[aria-label='Leave call']",
    "participantCount": "[data-avatar-count], .uGOf1d",
    "inCallIndicator": "button[aria-label='Leave call']",
    "waitingRoomText": "Asking to join|Please wait until a meeting host brings you into the call|You'll join the call when someone lets you in",
    "deniedText": "You can't join this video call|You can't join this call|Someone in the call denied your request|You've been removed",
    "endedText": "You left the meeting|The call has ended|Return to home screen|You've been removed from the meeting"
  }
}
$json$::jsonb),
('notifications', false, 'Delivery channels and defaults', $json$
{
  "pushEnabled": true,
  "emailEnabled": false,
  "fromName": "Remi",
  "fromEmail": "no-reply@remi.example.com",
  "defaultMeetingReminderMinutes": 10,
  "digestEnabled": true
}
$json$::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Plans
-- -----------------------------------------------------------------------------
insert into public.plans (slug, name, description, price_monthly, price_yearly, currency, features, limits, cta_label, is_default, is_popular, sort_order) values
('free', 'Free', 'For trying Remi on your own meetings', 0, 0, 'USD',
  '["5 meetings per month", "AI summaries and action items", "Meeting reminders", "Android app"]',
  '{"meetingsPerMonth": 5, "aiQueriesPerDay": 10, "uploadMinutesPerMonth": 60}', 'Get started free', true, false, 0),
('pro', 'Pro', 'For professionals who live in meetings', 15, 144, 'USD',
  '["Unlimited meetings", "Ask AI across all meetings", "Analytics and meeting scores", "Push and email reminders", "Audio upload transcription"]',
  '{"meetingsPerMonth": null, "aiQueriesPerDay": 200, "uploadMinutesPerMonth": 600}', 'Start Pro trial', false, true, 1),
('business', 'Business', 'For teams that want shared memory', 29, 288, 'USD',
  '["Everything in Pro", "Priority processing", "Admin controls", "Custom branding", "Dedicated support"]',
  '{"meetingsPerMonth": null, "aiQueriesPerDay": null, "uploadMinutesPerMonth": null}', 'Contact sales', false, false, 2)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Landing page sections (website)
-- -----------------------------------------------------------------------------
insert into public.content_sections (page, type, name, platform, sort_order, content) values
('landing', 'hero', 'Hero', 'web', 0, $json$
{
  "eyebrow": "AI meeting assistant",
  "title": "Never forget what was said — or what you promised",
  "subtitle": "Remi joins your Google Meet calls, writes the notes, captures every action item and reminds you before anything is due.",
  "primaryCta": { "label": "Get started with Google", "href": "/login" },
  "secondaryCta": { "label": "See pricing", "href": "/pricing" },
  "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_760/cld-sample-4.jpg",
  "badges": ["Free plan available", "Works with Google Meet", "Android app"]
}
$json$::jsonb),
('landing', 'logos', 'Trusted by', 'web', 1, $json$
{
  "title": "Trusted by teams at fast-moving companies",
  "items": [
    { "name": "Northwind", "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/o_0/w_200,h_48,c_scale/l_text:Arial_28_bold:Northwind,co_rgb:9CA3AF,o_100/sample.png" },
    { "name": "Acme", "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/o_0/w_200,h_48,c_scale/l_text:Arial_28_bold:Acme,co_rgb:9CA3AF,o_100/sample.png" },
    { "name": "Globex", "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/o_0/w_200,h_48,c_scale/l_text:Arial_28_bold:Globex,co_rgb:9CA3AF,o_100/sample.png" },
    { "name": "Initech", "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/o_0/w_200,h_48,c_scale/l_text:Arial_28_bold:Initech,co_rgb:9CA3AF,o_100/sample.png" },
    { "name": "Umbrella", "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/o_0/w_200,h_48,c_scale/l_text:Arial_28_bold:Umbrella,co_rgb:9CA3AF,o_100/sample.png" }
  ]
}
$json$::jsonb),
('landing', 'features', 'Features', 'web', 2, $json$
{
  "eyebrow": "Everything after the meeting, handled",
  "title": "Your meetings, turned into memory",
  "subtitle": "Remi listens so you can participate. Then it organises everything that matters.",
  "items": [
    { "icon": "mic", "title": "Joins automatically", "description": "Remi reads your Google Calendar and joins every Meet call you choose, no clicks needed.", "imageUrl": null },
    { "icon": "file-text", "title": "Instant meeting reports", "description": "Summaries, chapters, key questions and decisions, ready minutes after the call ends.", "imageUrl": null },
    { "icon": "action-items", "title": "Action items that stick", "description": "Every commitment is captured with an owner and a due date, so nothing falls through the cracks.", "imageUrl": null },
    { "icon": "reminders", "title": "Smart reminders", "description": "Get nudged before meetings start and before promises are due, on your phone and in your inbox.", "imageUrl": null },
    { "icon": "ask-ai", "title": "Ask anything", "description": "\"What did we agree with Acme last month?\" Remi searches every meeting and answers with sources.", "imageUrl": null },
    { "icon": "analytics", "title": "Meeting analytics", "description": "Understand engagement, sentiment, talk time and where your hours go each week.", "imageUrl": null }
  ]
}
$json$::jsonb),
('landing', 'steps', 'How it works', 'web', 3, $json$
{
  "title": "Up and running in 60 seconds",
  "subtitle": null,
  "items": [
    { "title": "Sign in with Google", "description": "Connect your calendar in one click. We only read events with meeting links." },
    { "title": "Remi joins your calls", "description": "The notetaker asks to join each Google Meet and quietly captures the conversation." },
    { "title": "Get reports and reminders", "description": "Read the report, tick off action items and let Remi remind you about the rest." }
  ]
}
$json$::jsonb),
('landing', 'stats', 'Stats', 'web', 4, $json$
{
  "items": [
    { "value": "4.2 hrs", "label": "saved per person every week" },
    { "value": "92%", "label": "of action items completed on time" },
    { "value": "< 3 min", "label": "from call end to report" }
  ]
}
$json$::jsonb),
('landing', 'testimonials', 'Testimonials', 'web', 5, $json$
{
  "title": "Loved by people who hate taking notes",
  "items": [
    { "quote": "I stopped writing notes entirely. Remi catches every follow-up and pings me before I forget.", "name": "Priya Sharma", "role": "Product Manager", "avatarUrl": "https://res.cloudinary.com/demo/image/upload/c_thumb,g_face,w_96,h_96,r_max/woman.jpg" },
    { "quote": "Ask AI is magic. I find what a customer said three weeks ago in seconds.", "name": "Daniel Okafor", "role": "Account Executive", "avatarUrl": "https://res.cloudinary.com/demo/image/upload/c_thumb,g_face,w_96,h_96,r_max/samples/people/smiling-man.jpg" },
    { "quote": "The weekly analytics changed how our team runs meetings. Shorter, and more of them end with decisions.", "name": "Mei Lin", "role": "Engineering Lead", "avatarUrl": "https://res.cloudinary.com/demo/image/upload/c_thumb,g_face,w_96,h_96,r_max/lady.jpg" }
  ]
}
$json$::jsonb),
('landing', 'pricing', 'Pricing', 'web', 6, $json$
{ "title": "Simple pricing", "subtitle": "Start free. Upgrade when Remi becomes indispensable." }
$json$::jsonb),
('landing', 'faq', 'FAQ', 'web', 7, $json$
{
  "title": "Frequently asked questions",
  "items": [
    { "question": "Which meeting platforms are supported?", "answer": "Google Meet today. Zoom and Microsoft Teams are on the roadmap." },
    { "question": "Do meeting hosts need to admit Remi?", "answer": "Yes. Remi joins as a guest named \"Remi Notetaker\" and waits to be admitted, so everyone knows it is there." },
    { "question": "Can I stop Remi from joining a meeting?", "answer": "Yes. Toggle any meeting off from your calendar view, or choose to auto-join only meetings you organise." },
    { "question": "Is my data private?", "answer": "Your meetings are only visible to you. Calendar tokens are encrypted, and you can disconnect or delete your account at any time." }
  ]
}
$json$::jsonb),
('landing', 'cta', 'Final CTA', 'web', 8, $json$
{
  "title": "Make your next meeting the last one you take notes in",
  "subtitle": "Free forever for up to 5 meetings a month.",
  "cta": { "label": "Start free with Google", "href": "/login" }
}
$json$::jsonb),
('pricing', 'pricing', 'Pricing table', 'web', 0, $json$
{ "title": "Plans for every calendar", "subtitle": "All plans include the Android app and Google Meet notetaker." }
$json$::jsonb),
('pricing', 'faq', 'Pricing FAQ', 'web', 1, $json$
{
  "title": "Billing questions",
  "items": [
    { "question": "Can I cancel anytime?", "answer": "Yes. Plans are month-to-month and you keep access until the end of the period." },
    { "question": "What counts as a meeting?", "answer": "Any call Remi joins or any recording you upload and process." }
  ]
}
$json$::jsonb),
('login', 'hero', 'Login panel', 'web', 0, $json$
{
  "eyebrow": null,
  "title": "Welcome to Remi",
  "subtitle": "Sign in with Google to connect your calendar. Remi will start joining your meetings automatically.",
  "primaryCta": { "label": "Continue with Google", "href": "/auth/google" },
  "secondaryCta": null,
  "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_fill,w_900,h_1200/cld-sample-4.jpg",
  "badges": ["Reads only events with meeting links", "Disconnect anytime"]
}
$json$::jsonb);

-- -----------------------------------------------------------------------------
-- Mobile onboarding + mobile home
-- -----------------------------------------------------------------------------
insert into public.content_sections (page, type, name, platform, sort_order, content) values
('mobile_onboarding', 'onboarding_slide', 'Slide 1', 'mobile', 0, $json$
{ "title": "Meetings, remembered", "description": "Remi joins your Google Meet calls and writes the notes for you.", "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_fill,w_800,h_800/cld-sample-4.jpg", "backgroundColor": "#EEF0FF" }
$json$::jsonb),
('mobile_onboarding', 'onboarding_slide', 'Slide 2', 'mobile', 1, $json$
{ "title": "Every promise tracked", "description": "Action items and commitments are captured automatically with due dates.", "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_fill,w_800,h_800/samples/people/kitchen-bar.jpg", "backgroundColor": "#E8FBF6" }
$json$::jsonb),
('mobile_onboarding', 'onboarding_slide', 'Slide 3', 'mobile', 2, $json$
{ "title": "Reminded at the right time", "description": "Get a nudge before meetings start and before anything is due.", "imageUrl": "https://res.cloudinary.com/demo/image/upload/c_fill,w_800,h_800/samples/people/jazz.jpg", "backgroundColor": "#FFF4E8" }
$json$::jsonb);

-- -----------------------------------------------------------------------------
-- Navigation
-- -----------------------------------------------------------------------------
insert into public.navigation_items (location, label, href, icon, group_label, required_feature, is_external, sort_order) values
-- website header
('header', 'Features', '/#features', null, null, null, false, 0),
('header', 'How it works', '/#how-it-works', null, null, null, false, 1),
('header', 'Pricing', '/pricing', null, null, null, false, 2),
('header', 'About', '/p/about', null, null, null, false, 3),
-- website footer
('footer', 'Features', '/#features', null, 'Product', null, false, 0),
('footer', 'Pricing', '/pricing', null, 'Product', null, false, 1),
('footer', 'Android app', 'https://play.google.com/store/apps/details?id=com.remi.app', null, 'Product', null, true, 2),
('footer', 'About', '/p/about', null, 'Company', null, false, 3),
('footer', 'Contact', 'mailto:support@remi.example.com', null, 'Company', null, true, 4),
('footer', 'Privacy policy', '/p/privacy', null, 'Legal', null, false, 5),
('footer', 'Terms of service', '/p/terms', null, 'Legal', null, false, 6),
-- web app sidebar
('sidebar', 'Home', '/dashboard', 'home', null, null, false, 0),
('sidebar', 'Reports', '/analytics/reports', 'reports', null, null, false, 1),
('sidebar', 'Analytics', '/analytics/overview', 'analytics', null, 'analytics', false, 2),
('sidebar', 'Calendar', '/calendar', 'calendar', null, null, false, 3),
('sidebar', 'Action items', '/action-items', 'action-items', null, 'actionItems', false, 4),
('sidebar', 'Reminders', '/reminders', 'reminders', null, 'reminders', false, 5),
('sidebar', 'Ask Remi', '/ask', 'ask-ai', null, 'askAi', false, 6),
('sidebar', 'Settings', '/settings', 'settings', null, null, false, 7),
-- mobile tabs
('mobile_tab', 'Home', 'home', 'home', null, null, false, 0),
('mobile_tab', 'Meetings', 'meetings', 'meetings', null, null, false, 1),
('mobile_tab', 'Reminders', 'reminders', 'reminders', null, 'reminders', false, 2),
('mobile_tab', 'Ask', 'ask', 'ask-ai', null, 'askAi', false, 3),
('mobile_tab', 'Profile', 'profile', 'profile', null, null, false, 4);

-- -----------------------------------------------------------------------------
-- Banners
-- -----------------------------------------------------------------------------
insert into public.banners (platform, placement, variant, title, body, cta_label, cta_url, sort_order) values
('web', 'dashboard', 'promo', 'Get Remi on Android', 'Reminders hit harder on your phone. Install the app and never miss a follow-up.', 'Get the app', 'https://play.google.com/store/apps/details?id=com.remi.app', 0),
('mobile', 'mobile_home', 'info', 'Tip: ask Remi anything', 'Try "What did I promise this week?" in the Ask tab.', 'Open Ask', 'remi://ask', 0),
('web', 'landing_top', 'promo', 'New: Ask AI across all your meetings', null, 'Learn more', '/#features', 0);

-- -----------------------------------------------------------------------------
-- CMS pages
-- -----------------------------------------------------------------------------
insert into public.cms_pages (slug, title, status, published_at, seo, content) values
('about', 'About Remi', 'published', now(), '{"title": "About Remi", "description": "Why we are building an AI meeting assistant that remembers.", "ogImageUrl": null}', $md$
## Meetings should create momentum, not homework

Remi started with a simple frustration: great conversations, forgotten follow-ups.
We built an assistant that listens, remembers and reminds — so the work agreed in a meeting actually happens.

### What we believe

- **Be present.** You should be talking to people, not typing notes.
- **Commitments matter.** Every "I'll send that over" deserves a reminder.
- **Your data is yours.** Private by default, deletable anytime.
$md$),
('privacy', 'Privacy policy', 'published', now(), '{"title": "Privacy policy", "description": null, "ogImageUrl": null}', $md$
_Last updated: November 2026_

This is placeholder policy text managed from the Remi admin panel. Replace it with your organisation's privacy policy.

### Data we collect
- Account details from Google (name, email, profile photo).
- Calendar events that contain meeting links.
- Meeting captions captured by the notetaker, and the reports generated from them.

### How we use it
To produce meeting reports, action items and reminders for you. We do not sell your data.

### Your choices
Disconnect Google Calendar or delete your account at any time from Settings.
$md$),
('terms', 'Terms of service', 'published', now(), '{"title": "Terms of service", "description": null, "ogImageUrl": null}', $md$
_Last updated: November 2026_

Placeholder terms managed from the Remi admin panel. Replace them with your own terms of service.

1. You must have permission to record or transcribe the meetings Remi joins.
2. You are responsible for informing participants that an AI notetaker is present.
3. The service is provided "as is" during the beta period.
$md$);

-- -----------------------------------------------------------------------------
-- AI prompts ({{variables}} are rendered by the backend)
-- -----------------------------------------------------------------------------
insert into public.ai_prompts (key, name, description, content) values
('meeting_report', 'Meeting report', 'Turns a transcript into the report, action items and reminders. Output is constrained by a JSON schema in code.', $prompt$
You are Remi, an expert meeting analyst and executive assistant for {{userName}} ({{userEmail}}).

Meeting: "{{meetingTitle}}"
Date: {{meetingDate}} (user timezone: {{timezone}}). Current time: {{now}}.
Attendees: {{attendees}}
Write all output in: {{outputLanguage}} (if "auto", use the main language of the transcript).

The user message contains the transcript as lines of "[mm:ss] Speaker: text". Captions can contain recognition errors; infer the intended meaning.

Produce:
- summary: 3–6 sentences in markdown covering purpose, main discussion and outcome.
- keyPoints: 3–8 short bullet strings.
- chapters: chronological sections, each with title, 1–2 sentence summary and startMs (milliseconds from the transcript timestamp where it begins).
- keyQuestions: important questions raised, with the answer if one was given (otherwise null) and who asked (or null).
- decisions: explicit decisions that were made.
- topics: 2–6 short lowercase topic tags.
- actionItems: concrete tasks someone committed to. Include title (imperative, under 12 words), description, assigneeName (null if unclear), isMine (true when {{userName}} owns it or it is unassigned but clearly theirs), dueAt (ISO-8601 with timezone offset, resolved from relative phrases like "by Friday" against the meeting date in {{timezone}}; null if no deadline was mentioned) and priority (low | medium | high).
- reminders: things {{userName}} should be reminded about (their own commitments, deadlines, follow-ups they promised). Each has title, body and remindAt (ISO-8601). Choose remindAt sensibly: the morning of the due day or a few hours before a time-specific deadline. Never in the past relative to {{now}}.
- sentimentScore: 0–100 (0 very negative, 50 neutral, 100 very positive) and sentimentLabel.
- engagementScore: 0–100, based on participation balance, interaction and questions.
- meetingScore: 0–100 overall effectiveness (clear agenda, decisions, next steps, engagement).

Do not invent facts that are not in the transcript. If the transcript is too short or empty, still return valid JSON with empty arrays and a summary that says so.
$prompt$),
('assistant_answer', 'Ask AI answer', 'Answers user questions using retrieved meeting snippets.', $prompt$
You are Remi, the meeting memory of {{userName}}. Current time: {{now}} ({{timezone}}).

Answer the question using ONLY the meeting excerpts below. Each excerpt starts with [n] and the meeting title and date.
- Be concise and specific, using markdown bullets where helpful.
- Cite sources inline like [1], [2] that match the excerpt numbers.
- If the excerpts do not contain the answer, say you could not find it in their meetings and suggest what to search for.

Meeting excerpts:
{{context}}
$prompt$),
('audio_transcription', 'Audio transcription', 'Used for uploaded recordings before the report pipeline.', $prompt$
Transcribe this meeting recording verbatim. Identify different speakers and label them consistently as "Speaker 1", "Speaker 2", and so on (use real names if speakers introduce themselves or address each other by name).
Return JSON segments in chronological order with speaker, text, startMs and endMs (milliseconds from the start of the recording). Merge consecutive sentences from the same speaker into one segment of at most ~30 seconds.
$prompt$);

-- -----------------------------------------------------------------------------
-- Notification templates ({{variables}} rendered by the backend)
-- -----------------------------------------------------------------------------
insert into public.notification_templates (key, name, title_template, body_template, email_subject, email_body, channels) values
('meeting_upcoming', 'Meeting starting soon', '{{meetingTitle}} starts in {{minutes}} min', '{{botName}} will join and take notes for you.', 'Starting soon: {{meetingTitle}}', 'Your meeting **{{meetingTitle}}** starts at {{startTime}}. {{botName}} will join and take notes.', '{push,in_app}'),
('report_ready', 'Report ready', 'Your notes for "{{meetingTitle}}" are ready', '{{actionItemCount}} action items · {{summaryPreview}}', 'Meeting report: {{meetingTitle}}', E'{{summary}}\n\n[Open the full report]({{url}})', '{push,in_app,email}'),
('action_item_due', 'Action item due', 'Due {{dueRelative}}: {{title}}', '{{meetingTitle}}', 'Reminder: {{title}}', 'This action item from **{{meetingTitle}}** is due {{dueRelative}}.', '{push,in_app,email}'),
('reminder', 'Reminder', '{{title}}', '{{body}}', 'Reminder: {{title}}', '{{body}}', '{push,in_app}'),
('daily_digest', 'Daily digest', 'Your day: {{meetingCount}} meetings, {{actionItemCount}} open items', '{{firstMeeting}}', 'Your Remi digest for {{date}}', '{{digestMarkdown}}', '{push,email}'),
('bot_failed', 'Bot could not join', 'Could not join "{{meetingTitle}}"', '{{reason}}', 'Remi could not join {{meetingTitle}}', 'Remi could not join **{{meetingTitle}}**: {{reason}}', '{push,in_app}')
on conflict (key) do nothing;
