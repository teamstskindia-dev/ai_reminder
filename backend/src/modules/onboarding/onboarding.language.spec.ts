import { detectLanguageStyle, extractName, heuristicProfile } from './onboarding.language';

describe('detectLanguageStyle', () => {
  it('detects plain English', () => {
    expect(detectLanguageStyle(['I work as a designer and I love the main idea of this app'])).toBe('english');
  });

  it('detects Hinglish', () => {
    expect(detectLanguageStyle(['mujhe Vij bulao yaar', 'main ek startup mein kaam karta hoon'])).toBe('hinglish');
  });

  it('detects a mix', () => {
    expect(detectLanguageStyle(['I am a product manager, bahut busy rehta hoon these days with launches'])).toBe(
      'mixed',
    );
  });

  it('treats Devanagari as Hinglish', () => {
    expect(detectLanguageStyle(['मेरा नाम राहुल है'])).toBe('hinglish');
  });

  it('defaults to English for empty input', () => {
    expect(detectLanguageStyle([])).toBe('english');
  });
});

describe('extractName', () => {
  it.each([
    ['Call me Vij', 'Vij'],
    ["Hi! I'm Asha.", 'Asha'],
    ['mera naam Rohit hai', 'Rohit'],
    ['Priya', 'Priya'],
  ])('%s → %s', (input, expected) => {
    expect(extractName(input)).toBe(expected);
  });
});

describe('heuristicProfile', () => {
  it('maps the four answers without inventing facts', () => {
    const profile = heuristicProfile([
      { role: 'assistant', content: 'What should I call you?' },
      { role: 'user', content: 'call me Vij' },
      { role: 'assistant', content: 'What do you do?' },
      { role: 'user', content: 'I run a small design studio' },
      { role: 'assistant', content: 'What is on your mind?' },
      { role: 'user', content: 'Hiring my first employee' },
      { role: 'assistant', content: 'How should I talk to you?' },
      { role: 'user', content: 'Keep it chill and funny' },
    ]);
    expect(profile).toEqual({
      preferredName: 'Vij',
      occupation: 'I run a small design studio',
      currentFocus: 'Hiring my first employee',
      communicationStyle: 'Keep it chill and funny',
      languageStyle: 'english',
      tone: 'playful',
      facts: [],
      summary: null,
    });
  });
});
