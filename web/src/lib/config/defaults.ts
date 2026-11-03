import type { AnySection, CmsPage, NavItem, NavLocation, Plan, PublicConfig } from "@/lib/api/types";

/**
 * Bundled defaults that mirror backend/supabase/seed.sql. Used ONLY when the API is
 * unreachable (e.g. during `next build` with the backend offline) or a field is missing,
 * so public pages always render. The live values always come from `GET /public/config`.
 */

const nav = (location: NavLocation, items: Omit<NavItem, "id" | "sortOrder">[]): NavItem[] =>
  items.map((item, index) => ({ ...item, id: `fallback-${location}-${index}`, sortOrder: index }));

const CLOUDINARY = "https://res.cloudinary.com/demo/image/upload";

export const DEFAULT_CONFIG: PublicConfig = {
  branding: {
    appName: "Remi",
    tagline: "Your AI meeting assistant that never forgets",
    logoUrl: `${CLOUDINARY}/c_crop,w_1,h_1/o_0/w_240,h_64,c_scale/l_text:Arial_44_bold:Remi,co_rgb:5B4FE9,o_100/sample.png`,
    logoDarkUrl: `${CLOUDINARY}/c_crop,w_1,h_1/o_0/w_240,h_64,c_scale/l_text:Arial_44_bold:Remi,co_white,o_100/sample.png`,
    iconUrl: `${CLOUDINARY}/c_crop,w_1,h_1/e_colorize,co_rgb:5B4FE9/w_192,h_192,c_scale/l_text:Arial_112_bold:R,co_white/r_36/sample.png`,
    faviconUrl: `${CLOUDINARY}/c_crop,w_1,h_1/e_colorize,co_rgb:5B4FE9/w_64,h_64,c_scale/l_text:Arial_40_bold:R,co_white/r_12/sample.png`,
    supportEmail: "support@remi.example.com",
    companyName: "Remi Labs",
  },
  theme: {
    primaryColor: "#5B4FE9",
    primaryForeground: "#FFFFFF",
    accentColor: "#22C3A6",
    sidebarBackground: "#0F0E1A",
    sidebarForeground: "#E7E6F3",
    radius: 10,
    fontFamily: "Inter",
    defaultMode: "light",
  },
  features: {
    askAi: true,
    analytics: true,
    reminders: true,
    actionItems: true,
    calendarSync: true,
    meetingUpload: true,
    pushNotifications: true,
    signupsEnabled: true,
  },
  app: {
    maintenanceMode: false,
    maintenanceMessage: "We are upgrading Remi. Back in a few minutes.",
    minAppVersion: "1.0.0",
    latestAppVersion: "1.0.0",
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.remi.app",
    iosStoreUrl: "",
  },
  seo: {
    title: "Remi — AI meeting notes, action items and reminders",
    description:
      "Remi joins your Google Meet calls, writes the notes, tracks every commitment and reminds you before things are due.",
    ogImageUrl: `${CLOUDINARY}/c_fill,w_1200,h_630/cld-sample-4.jpg`,
    keywords: ["ai meeting assistant", "meeting notes", "google meet notetaker", "action items", "reminders"],
  },
  navigation: {
    header: nav("header", [
      { label: "Features", href: "/#features", icon: null, groupLabel: null, isExternal: false },
      { label: "How it works", href: "/#how-it-works", icon: null, groupLabel: null, isExternal: false },
      { label: "Pricing", href: "/pricing", icon: null, groupLabel: null, isExternal: false },
      { label: "About", href: "/p/about", icon: null, groupLabel: null, isExternal: false },
    ]),
    footer: nav("footer", [
      { label: "Features", href: "/#features", icon: null, groupLabel: "Product", isExternal: false },
      { label: "Pricing", href: "/pricing", icon: null, groupLabel: "Product", isExternal: false },
      {
        label: "Android app",
        href: "https://play.google.com/store/apps/details?id=com.remi.app",
        icon: null,
        groupLabel: "Product",
        isExternal: true,
      },
      { label: "About", href: "/p/about", icon: null, groupLabel: "Company", isExternal: false },
      { label: "Contact", href: "mailto:support@remi.example.com", icon: null, groupLabel: "Company", isExternal: true },
      { label: "Privacy policy", href: "/p/privacy", icon: null, groupLabel: "Legal", isExternal: false },
      { label: "Terms of service", href: "/p/terms", icon: null, groupLabel: "Legal", isExternal: false },
    ]),
    sidebar: nav("sidebar", [
      { label: "Home", href: "/dashboard", icon: "home", groupLabel: null, isExternal: false },
      { label: "Reports", href: "/analytics/reports", icon: "reports", groupLabel: null, isExternal: false },
      { label: "Analytics", href: "/analytics/overview", icon: "analytics", groupLabel: null, isExternal: false },
      { label: "Calendar", href: "/calendar", icon: "calendar", groupLabel: null, isExternal: false },
      { label: "Action items", href: "/action-items", icon: "action-items", groupLabel: null, isExternal: false },
      { label: "Reminders", href: "/reminders", icon: "reminders", groupLabel: null, isExternal: false },
      { label: "Ask Remi", href: "/ask", icon: "ask-ai", groupLabel: null, isExternal: false },
      { label: "Settings", href: "/settings", icon: "settings", groupLabel: null, isExternal: false },
    ]),
    mobile_tab: nav("mobile_tab", [
      { label: "Home", href: "home", icon: "home", groupLabel: null, isExternal: false },
      { label: "Meetings", href: "meetings", icon: "meetings", groupLabel: null, isExternal: false },
      { label: "Reminders", href: "reminders", icon: "reminders", groupLabel: null, isExternal: false },
      { label: "Ask", href: "ask", icon: "ask-ai", groupLabel: null, isExternal: false },
      { label: "Profile", href: "profile", icon: "profile", groupLabel: null, isExternal: false },
    ]),
  },
  banners: [
    {
      id: "fallback-banner-dashboard",
      placement: "dashboard",
      variant: "promo",
      title: "Get Remi on Android",
      body: "Reminders hit harder on your phone. Install the app and never miss a follow-up.",
      imageUrl: null,
      ctaLabel: "Get the app",
      ctaUrl: "https://play.google.com/store/apps/details?id=com.remi.app",
    },
    {
      id: "fallback-banner-landing",
      placement: "landing_top",
      variant: "promo",
      title: "New: Ask AI across all your meetings",
      body: null,
      imageUrl: null,
      ctaLabel: "Learn more",
      ctaUrl: "/#features",
    },
  ],
  version: "fallback",
};

const section = <S extends AnySection>(s: S): S => s;

export const DEFAULT_SECTIONS: Record<string, AnySection[]> = {
  landing: [
    section({
      id: "fallback-landing-hero",
      page: "landing",
      type: "hero",
      sortOrder: 0,
      content: {
        eyebrow: "AI meeting assistant",
        title: "Never forget what was said — or what you promised",
        subtitle:
          "Remi joins your Google Meet calls, writes the notes, captures every action item and reminds you before anything is due.",
        primaryCta: { label: "Get started with Google", href: "/login" },
        secondaryCta: { label: "See pricing", href: "/pricing" },
        imageUrl: `${CLOUDINARY}/c_fill,w_1200,h_760/cld-sample-4.jpg`,
        badges: ["Free plan available", "Works with Google Meet", "Android app"],
      },
    }),
    section({
      id: "fallback-landing-logos",
      page: "landing",
      type: "logos",
      sortOrder: 1,
      content: {
        title: "Trusted by teams at fast-moving companies",
        items: ["Northwind", "Acme", "Globex", "Initech", "Umbrella"].map((name) => ({
          name,
          imageUrl: `${CLOUDINARY}/c_crop,w_1,h_1/o_0/w_200,h_48,c_scale/l_text:Arial_28_bold:${name},co_rgb:9CA3AF,o_100/sample.png`,
        })),
      },
    }),
    section({
      id: "fallback-landing-features",
      page: "landing",
      type: "features",
      sortOrder: 2,
      content: {
        eyebrow: "Everything after the meeting, handled",
        title: "Your meetings, turned into memory",
        subtitle: "Remi listens so you can participate. Then it organises everything that matters.",
        items: [
          {
            icon: "mic",
            title: "Joins automatically",
            description: "Remi reads your Google Calendar and joins every Meet call you choose, no clicks needed.",
            imageUrl: null,
          },
          {
            icon: "file-text",
            title: "Instant meeting reports",
            description: "Summaries, chapters, key questions and decisions, ready minutes after the call ends.",
            imageUrl: null,
          },
          {
            icon: "action-items",
            title: "Action items that stick",
            description:
              "Every commitment is captured with an owner and a due date, so nothing falls through the cracks.",
            imageUrl: null,
          },
          {
            icon: "reminders",
            title: "Smart reminders",
            description:
              "Get nudged before meetings start and before promises are due, on your phone and in your inbox.",
            imageUrl: null,
          },
          {
            icon: "ask-ai",
            title: "Ask anything",
            description:
              '"What did we agree with Acme last month?" Remi searches every meeting and answers with sources.',
            imageUrl: null,
          },
          {
            icon: "analytics",
            title: "Meeting analytics",
            description: "Understand engagement, sentiment, talk time and where your hours go each week.",
            imageUrl: null,
          },
        ],
      },
    }),
    section({
      id: "fallback-landing-steps",
      page: "landing",
      type: "steps",
      sortOrder: 3,
      content: {
        title: "Up and running in 60 seconds",
        subtitle: null,
        items: [
          {
            title: "Sign in with Google",
            description: "Connect your calendar in one click. We only read events with meeting links.",
          },
          {
            title: "Remi joins your calls",
            description: "The notetaker asks to join each Google Meet and quietly captures the conversation.",
          },
          {
            title: "Get reports and reminders",
            description: "Read the report, tick off action items and let Remi remind you about the rest.",
          },
        ],
      },
    }),
    section({
      id: "fallback-landing-stats",
      page: "landing",
      type: "stats",
      sortOrder: 4,
      content: {
        items: [
          { value: "4.2 hrs", label: "saved per person every week" },
          { value: "92%", label: "of action items completed on time" },
          { value: "< 3 min", label: "from call end to report" },
        ],
      },
    }),
    section({
      id: "fallback-landing-testimonials",
      page: "landing",
      type: "testimonials",
      sortOrder: 5,
      content: {
        title: "Loved by people who hate taking notes",
        items: [
          {
            quote: "I stopped writing notes entirely. Remi catches every follow-up and pings me before I forget.",
            name: "Priya Sharma",
            role: "Product Manager",
            avatarUrl: `${CLOUDINARY}/c_thumb,g_face,w_96,h_96,r_max/woman.jpg`,
          },
          {
            quote: "Ask AI is magic. I find what a customer said three weeks ago in seconds.",
            name: "Daniel Okafor",
            role: "Account Executive",
            avatarUrl: `${CLOUDINARY}/c_thumb,g_face,w_96,h_96,r_max/samples/people/smiling-man.jpg`,
          },
          {
            quote:
              "The weekly analytics changed how our team runs meetings. Shorter, and more of them end with decisions.",
            name: "Mei Lin",
            role: "Engineering Lead",
            avatarUrl: `${CLOUDINARY}/c_thumb,g_face,w_96,h_96,r_max/lady.jpg`,
          },
        ],
      },
    }),
    section({
      id: "fallback-landing-pricing",
      page: "landing",
      type: "pricing",
      sortOrder: 6,
      content: { title: "Simple pricing", subtitle: "Start free. Upgrade when Remi becomes indispensable." },
    }),
    section({
      id: "fallback-landing-faq",
      page: "landing",
      type: "faq",
      sortOrder: 7,
      content: {
        title: "Frequently asked questions",
        items: [
          {
            question: "Which meeting platforms are supported?",
            answer: "Google Meet today. Zoom and Microsoft Teams are on the roadmap.",
          },
          {
            question: "Do meeting hosts need to admit Remi?",
            answer:
              'Yes. Remi joins as a guest named "Remi Notetaker" and waits to be admitted, so everyone knows it is there.',
          },
          {
            question: "Can I stop Remi from joining a meeting?",
            answer:
              "Yes. Toggle any meeting off from your calendar view, or choose to auto-join only meetings you organise.",
          },
          {
            question: "Is my data private?",
            answer:
              "Your meetings are only visible to you. Calendar tokens are encrypted, and you can disconnect or delete your account at any time.",
          },
        ],
      },
    }),
    section({
      id: "fallback-landing-cta",
      page: "landing",
      type: "cta",
      sortOrder: 8,
      content: {
        title: "Make your next meeting the last one you take notes in",
        subtitle: "Free forever for up to 5 meetings a month.",
        cta: { label: "Start free with Google", href: "/login" },
      },
    }),
  ],
  pricing: [
    section({
      id: "fallback-pricing-table",
      page: "pricing",
      type: "pricing",
      sortOrder: 0,
      content: {
        title: "Plans for every calendar",
        subtitle: "All plans include the Android app and Google Meet notetaker.",
      },
    }),
    section({
      id: "fallback-pricing-faq",
      page: "pricing",
      type: "faq",
      sortOrder: 1,
      content: {
        title: "Billing questions",
        items: [
          {
            question: "Can I cancel anytime?",
            answer: "Yes. Plans are month-to-month and you keep access until the end of the period.",
          },
          {
            question: "What counts as a meeting?",
            answer: "Any call Remi joins or any recording you upload and process.",
          },
        ],
      },
    }),
  ],
  login: [
    section({
      id: "fallback-login-hero",
      page: "login",
      type: "hero",
      sortOrder: 0,
      content: {
        eyebrow: null,
        title: "Welcome to Remi",
        subtitle:
          "Sign in with Google to connect your calendar. Remi will start joining your meetings automatically.",
        primaryCta: { label: "Continue with Google", href: "/auth/google" },
        secondaryCta: null,
        imageUrl: `${CLOUDINARY}/c_fill,w_900,h_1200/cld-sample-4.jpg`,
        badges: ["Reads only events with meeting links", "Disconnect anytime"],
      },
    }),
  ],
};

export const DEFAULT_PLANS: Plan[] = [
  {
    id: "fallback-plan-free",
    slug: "free",
    name: "Free",
    description: "For trying Remi on your own meetings",
    priceMonthly: 0,
    priceYearly: 0,
    currency: "USD",
    features: ["5 meetings per month", "AI summaries and action items", "Meeting reminders", "Android app"],
    limits: { meetingsPerMonth: 5, aiQueriesPerDay: 10, uploadMinutesPerMonth: 60 },
    ctaLabel: "Get started free",
    isPopular: false,
    isDefault: true,
    sortOrder: 0,
  },
  {
    id: "fallback-plan-pro",
    slug: "pro",
    name: "Pro",
    description: "For professionals who live in meetings",
    priceMonthly: 15,
    priceYearly: 144,
    currency: "USD",
    features: [
      "Unlimited meetings",
      "Ask AI across all meetings",
      "Analytics and meeting scores",
      "Push and email reminders",
      "Audio upload transcription",
    ],
    limits: { meetingsPerMonth: null, aiQueriesPerDay: 200, uploadMinutesPerMonth: 600 },
    ctaLabel: "Start Pro trial",
    isPopular: true,
    isDefault: false,
    sortOrder: 1,
  },
  {
    id: "fallback-plan-business",
    slug: "business",
    name: "Business",
    description: "For teams that want shared memory",
    priceMonthly: 29,
    priceYearly: 288,
    currency: "USD",
    features: ["Everything in Pro", "Priority processing", "Admin controls", "Custom branding", "Dedicated support"],
    limits: { meetingsPerMonth: null, aiQueriesPerDay: null, uploadMinutesPerMonth: null },
    ctaLabel: "Contact sales",
    isPopular: false,
    isDefault: false,
    sortOrder: 2,
  },
];

const FALLBACK_DATE = "2026-11-03T00:00:00.000Z";

export const DEFAULT_PAGES: Record<string, CmsPage> = {
  about: {
    id: "fallback-page-about",
    slug: "about",
    title: "About Remi",
    status: "published",
    publishedAt: FALLBACK_DATE,
    updatedAt: FALLBACK_DATE,
    seo: {
      title: "About Remi",
      description: "Why we are building an AI meeting assistant that remembers.",
      ogImageUrl: null,
    },
    content: `## Meetings should create momentum, not homework

Remi started with a simple frustration: great conversations, forgotten follow-ups.
We built an assistant that listens, remembers and reminds — so the work agreed in a meeting actually happens.

### What we believe

- **Be present.** You should be talking to people, not typing notes.
- **Commitments matter.** Every "I'll send that over" deserves a reminder.
- **Your data is yours.** Private by default, deletable anytime.
`,
  },
  privacy: {
    id: "fallback-page-privacy",
    slug: "privacy",
    title: "Privacy policy",
    status: "published",
    publishedAt: FALLBACK_DATE,
    updatedAt: FALLBACK_DATE,
    seo: { title: "Privacy policy", description: null, ogImageUrl: null },
    content: `_Last updated: November 2026_

This is placeholder policy text managed from the Remi admin panel. Replace it with your organisation's privacy policy.

### Data we collect
- Account details from Google (name, email, profile photo).
- Calendar events that contain meeting links.
- Meeting captions captured by the notetaker, and the reports generated from them.

### How we use it
To produce meeting reports, action items and reminders for you. We do not sell your data.

### Your choices
Disconnect Google Calendar or delete your account at any time from Settings.
`,
  },
  terms: {
    id: "fallback-page-terms",
    slug: "terms",
    title: "Terms of service",
    status: "published",
    publishedAt: FALLBACK_DATE,
    updatedAt: FALLBACK_DATE,
    seo: { title: "Terms of service", description: null, ogImageUrl: null },
    content: `_Last updated: November 2026_

Placeholder terms managed from the Remi admin panel. Replace them with your own terms of service.

1. You must have permission to record or transcribe the meetings Remi joins.
2. You are responsible for informing participants that an AI notetaker is present.
3. The service is provided "as is" during the beta period.
`,
  },
};
