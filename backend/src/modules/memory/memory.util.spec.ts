import {
  addCorrection,
  applyCorrections,
  isGenericSpeaker,
  isSamePerson,
  mentions,
  mergeFacts,
  replaceName,
  toCorrections,
} from './memory.util';

describe('memory utils', () => {
  it('replaces whole names only, case-insensitively', () => {
    expect(replaceName('Raul said raul will call. Raulji agreed.', 'Raul', 'Rahul')).toBe(
      'Rahul said Rahul will call. Raulji agreed.',
    );
    expect(replaceName('Meet Priya', 'priya', 'Priya Shah')).toBe('Meet Priya Shah');
    expect(replaceName('No change', '', 'X')).toBe('No change');
    expect(replaceName('Ankit (PM)', 'Ankit', 'Ankit')).toBe('Ankit (PM)');
  });

  it('handles names with regex characters and non-Latin scripts', () => {
    expect(replaceName('Call A.J. today', 'A.J.', 'AJ')).toBe('Call AJ today');
    expect(replaceName('राहुल ने कहा', 'राहुल', 'Rahul')).toBe('Rahul ने कहा');
  });

  it('spots mentions and generic speakers', () => {
    expect(mentions('Send Rahul the deck', 'rahul')).toBe(true);
    expect(mentions('Send Rahulji the deck', 'Rahul')).toBe(false);
    expect(isGenericSpeaker('Speaker 2')).toBe(true);
    expect(isGenericSpeaker('Unknown')).toBe(true);
    expect(isGenericSpeaker('Rahul')).toBe(false);
  });

  it('matches an assignee to a person by full or first name', () => {
    expect(isSamePerson('Rahul Sharma', ['Rahul'])).toBe(true);
    expect(isSamePerson('rahul', ['Rahul Sharma'])).toBe(true);
    expect(isSamePerson('Rahulji', ['Rahul'])).toBe(false);
    expect(isSamePerson(null, ['Rahul'])).toBe(false);
  });

  it('keeps corrections short and applies them in order', () => {
    let list = addCorrection([], 'Raul', 'Rahul');
    list = addCorrection(list, 'Rahul', 'Rahul Verma');
    expect(list).toEqual([
      { from: 'Raul', to: 'Rahul Verma' },
      { from: 'Rahul', to: 'Rahul Verma' },
    ]);
    expect(addCorrection(list, 'raul', 'Raul')).toBe(list);
    expect(applyCorrections('Raul met Priya', [{ from: 'Raul', to: 'Rahul' }])).toBe('Rahul met Priya');
    expect(toCorrections([{ from: 'a', to: 'b' }, { from: 1 }, null])).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('merges facts without duplicates, newest wording last', () => {
    expect(mergeFacts(['Works at Acme', 'Has a dog'], ['works at acme', ' Likes chess '])).toEqual([
      'Has a dog',
      'works at acme',
      'Likes chess',
    ]);
    expect(mergeFacts([], ['a', 'b', 'c'], 2)).toEqual(['b', 'c']);
  });
});
