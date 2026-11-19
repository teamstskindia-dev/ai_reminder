import { sameTitle, titleSimilarity, titleTokens } from './similarity.util';

describe('similarity.util', () => {
  it('tokenizes titles', () => {
    expect(titleTokens('Send the pitch deck to Rahul!')).toEqual(['send', 'pitch', 'deck', 'rahul']);
  });

  it('scores similar titles', () => {
    expect(titleSimilarity('Fix login bug', 'Fix the login bug')).toBe(1);
    expect(titleSimilarity('Fix login bug', 'Write blog post')).toBe(0);
  });

  it('decides whether two titles are the same thing', () => {
    expect(sameTitle('Send pitch deck to Rahul', 'Send Rahul the pitch deck')).toBe(true);
    expect(sameTitle('Pay HDFC credit card bill', 'Pay HDFC credit card bill today')).toBe(true);
    expect(sameTitle('Send deck', 'Send the pitch deck to Rahul')).toBe(false);
    expect(sameTitle('Call mom', 'Call dad')).toBe(false);
  });
});
