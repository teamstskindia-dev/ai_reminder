/** Variables the backend renders into each seeded prompt (backend/supabase/seed.sql). */
export const KNOWN_PROMPT_VARIABLES: Record<string, { name: string; description: string }[]> = {
  meeting_report: [
    { name: 'userName', description: 'Meeting owner name' },
    { name: 'userEmail', description: 'Meeting owner email' },
    { name: 'meetingTitle', description: 'Calendar event title' },
    { name: 'meetingDate', description: 'Meeting start date' },
    { name: 'timezone', description: "Owner's IANA timezone" },
    { name: 'now', description: 'Current time (ISO)' },
    { name: 'attendees', description: 'Attendee names and emails' },
    { name: 'outputLanguage', description: 'AI setting "output language"' },
  ],
  assistant_answer: [
    { name: 'userName', description: 'Asking user name' },
    { name: 'now', description: 'Current time (ISO)' },
    { name: 'timezone', description: "User's IANA timezone" },
    { name: 'context', description: 'Numbered meeting excerpts retrieved for the question' },
  ],
  audio_transcription: [],
};
