import { escapeLike } from './postgrest.util';

describe('escapeLike', () => {
  it('leaves ordinary names alone', () => {
    expect(escapeLike('Rahul')).toBe('Rahul');
    expect(escapeLike("O'Neil")).toBe("O'Neil");
  });

  it('escapes LIKE wildcards and the escape character itself', () => {
    expect(escapeLike('%')).toBe('\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('50%_off')).toBe('50\\%\\_off');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
  });
});
