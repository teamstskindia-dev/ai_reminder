-- Talk: stop the friend from dropping unrelated profile details into answers (e.g. a car the user wants to
-- buy showing up in a reply about a client project). Adds one Style rule to the talk_chat prompt.
-- Anchored on an existing line so a prompt an admin rewrote without that line is left untouched, and
-- guarded so running it twice changes nothing.
update public.ai_prompts
set content = replace(
      content,
      '- Never lecture, diagnose or give medical advice.',
      E'- Use the profile only when it helps with what they just said. Do not bring up unrelated personal details (their plans, purchases, current focus) in a reply about something else, and keep any humour about the current topic.\n- Never lecture, diagnose or give medical advice.'
    ),
    version = version + 1
where key = 'talk_chat'
  and content like '%- Never lecture, diagnose or give medical advice.%'
  and content not like '%Use the profile only when it helps with what they just said.%';
