export interface SampleLine {
  speaker: string;
  text: string;
}

/** Realistic product-planning meeting used by BOT_MODE=simulate (local end-to-end testing). */
export const SAMPLE_TRANSCRIPT: SampleLine[] = [
  {
    speaker: 'Priya Sharma',
    text: 'Morning everyone, thanks for joining. Today I want to lock the scope for the November release.',
  },
  {
    speaker: 'Daniel Okafor',
    text: 'Sounds good. From the sales side, the top request is still calendar reminders on Android.',
  },
  {
    speaker: 'Mei Lin',
    text: 'Engineering-wise the Android reminders are about eighty percent done, push delivery is working in staging.',
  },
  {
    speaker: 'Priya Sharma',
    text: 'Great. What is left before we can ship it?',
  },
  {
    speaker: 'Mei Lin',
    text: 'Mostly the settings screen and some battery optimisation testing on older Samsung devices.',
  },
  {
    speaker: 'Daniel Okafor',
    text: 'Two of our pilot customers asked whether reminders can go to email as well.',
  },
  {
    speaker: 'Priya Sharma',
    text: 'Email is already supported on the backend, so I think we can include it as an opt-in setting.',
  },
  {
    speaker: 'Mei Lin',
    text: 'Agreed. I will add the email toggle to the settings screen this week.',
  },
  {
    speaker: 'Priya Sharma',
    text: 'Okay, decision: Android reminders plus the email opt-in ship in the November release.',
  },
  {
    speaker: 'Daniel Okafor',
    text: 'Do we have a date I can share with the pilot customers?',
  },
  {
    speaker: 'Mei Lin',
    text: 'If testing goes well, code freeze on November 20th and release on the 25th.',
  },
  {
    speaker: 'Priya Sharma',
    text: 'Let us say the 25th, but tell customers end of November to keep a buffer.',
  },
  {
    speaker: 'Daniel Okafor',
    text: 'Perfect. I will send the updated deck to Acme and Globex by Friday.',
  },
  {
    speaker: 'Priya Sharma',
    text: 'Next topic is the onboarding drop-off. We lose about thirty percent of users at the calendar permission step.',
  },
  {
    speaker: 'Mei Lin',
    text: 'We could explain why we need the permission before showing the Google screen.',
  },
  {
    speaker: 'Daniel Okafor',
    text: 'Customers also worry about privacy, so a short line about encryption would help.',
  },
  {
    speaker: 'Priya Sharma',
    text: 'Good idea. I will draft the copy for the permission screen and share it by Wednesday.',
  },
  {
    speaker: 'Mei Lin',
    text: 'One risk: the Samsung testing might slip if the devices do not arrive by Monday.',
  },
  {
    speaker: 'Priya Sharma',
    text: 'Noted. Mei, please flag it in the channel on Monday if they have not arrived.',
  },
  {
    speaker: 'Daniel Okafor',
    text: 'Question before we wrap up: are we still planning the analytics dashboard for December?',
  },
  {
    speaker: 'Priya Sharma',
    text: 'Yes, December. Let us review the designs next Tuesday. Thanks everyone, great meeting.',
  },
];
