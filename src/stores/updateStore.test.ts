import { describe, expect, it } from 'vitest';
import { parseUpdateFailure } from './updateStore';

describe('parseUpdateFailure', () => {
  it('captures nested causes, extracts URLs, and maps timeout failures to friendly guidance', () => {
    const failure = parseUpdateFailure({
      message: 'error sending request for url (https://github.com/Talljack/cc-statistics/releases/download/v0.2.7/CC.Statistics_aarch64.app.tar.gz)',
      cause: new Error('operation timed out after 30000ms'),
    }, 'download');

    expect(failure).toMatchObject({
      stage: 'download',
      titleKey: 'update.downloadFailedTitle',
      summaryKey: 'update.errorSummaryTimeout',
      url: 'https://github.com/Talljack/cc-statistics/releases/download/v0.2.7/CC.Statistics_aarch64.app.tar.gz',
    });
    expect(failure.suggestionKeys).toEqual(expect.arrayContaining([
      'update.suggestionRetry',
      'update.suggestionCheckNetwork',
      'update.suggestionOpenReleasePage',
    ]));
    expect(failure.technicalDetails).toContain('stage=download');
    expect(failure.technicalDetails).toContain('operation timed out after 30000ms');
  });

  it('maps SSL failures to secure-connection guidance', () => {
    const failure = parseUpdateFailure(new Error('LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to github.com:443'), 'check');

    expect(failure.summaryKey).toBe('update.errorSummarySecureConnection');
    expect(failure.suggestionKeys).toEqual(expect.arrayContaining([
      'update.suggestionRetry',
      'update.suggestionCheckNetwork',
      'update.suggestionCheckProxy',
    ]));
  });

  it('maps 404 style errors to release sync guidance', () => {
    const failure = parseUpdateFailure({
      error: '404 Not Found',
      details: 'asset not found',
    }, 'download');

    expect(failure.summaryKey).toBe('update.errorSummaryReleaseSync');
    expect(failure.suggestionKeys).toEqual(expect.arrayContaining([
      'update.suggestionRetry',
      'update.suggestionWaitForSync',
      'update.suggestionOpenReleasePage',
    ]));
  });
});
