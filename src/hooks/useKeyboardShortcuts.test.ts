import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../stores/appStore';
import { matchesShortcut, parseShortcut } from './useKeyboardShortcuts';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function KeyboardHarness() {
  const { helpOpen } = useKeyboardShortcuts();
  const location = useLocation();
  const currentView = useAppStore((state) => state.currentView);

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('div', { 'data-testid': 'path' }, location.pathname),
    React.createElement('div', { 'data-testid': 'view' }, currentView),
    React.createElement('div', { 'data-testid': 'help' }, helpOpen ? 'open' : 'closed'),
  );
}

beforeEach(() => {
  useAppStore.setState({
    currentView: 'dashboard',
    shortcutHelpOpen: false,
  });
});

afterEach(() => {
  cleanup();
});

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

  it('matches shifted question mark character key', () => {
    const event = new KeyboardEvent('keydown', { key: '?', shiftKey: true });
    expect(matchesShortcut(event, '?', true)).toBe(true);
  });
});

describe('useKeyboardShortcuts', () => {
  it('keeps navigation shortcuts active outside the dashboard route', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/report'] },
        React.createElement(KeyboardHarness),
      )
    );

    fireEvent.keyDown(window, { key: 'g' });

    expect(screen.getByTestId('path').textContent).toBe('/');
    expect(screen.getByTestId('view').textContent).toBe('dashboard');
  });

  it('opens shortcut help from any route', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/report'] },
        React.createElement(KeyboardHarness),
      )
    );

    fireEvent.keyDown(window, { key: '?', shiftKey: true });

    expect(screen.getByTestId('help').textContent).toBe('open');
  });
});
