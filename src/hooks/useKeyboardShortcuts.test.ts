import { describe, expect, it } from 'vitest';
import { matchesShortcut, parseShortcut } from './useKeyboardShortcuts';

describe('parseShortcut', () => {
  it('parses mod+r as meta on mac', () => {
    expect(parseShortcut('mod+r', true)).toEqual({
      key: 'r',
      meta: true,
      ctrl: false,
      shift: false,
      alt: false,
    });
  });

  it('parses mod+r as ctrl on non-mac', () => {
    expect(parseShortcut('mod+r', false)).toEqual({
      key: 'r',
      meta: false,
      ctrl: true,
      shift: false,
      alt: false,
    });
  });

  it('parses question mark as shift+slash', () => {
    expect(parseShortcut('?', true)).toEqual({
      key: '/',
      meta: false,
      ctrl: false,
      shift: true,
      alt: false,
    });
  });
});

describe('matchesShortcut', () => {
  it('matches mod+r on mac', () => {
    const event = new KeyboardEvent('keydown', { key: 'r', metaKey: true });
    expect(matchesShortcut(event, 'mod+r', true)).toBe(true);
  });

  it('does not match when modifier missing', () => {
    const event = new KeyboardEvent('keydown', { key: 'r' });
    expect(matchesShortcut(event, 'mod+r', true)).toBe(false);
  });

  it('matches question mark', () => {
    const event = new KeyboardEvent('keydown', { key: '/', shiftKey: true });
    expect(matchesShortcut(event, '?', true)).toBe(true);
  });
});
