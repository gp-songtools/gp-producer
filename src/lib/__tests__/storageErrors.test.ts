import { describe, expect, it } from 'vitest';
import { describeStorageError, isQuotaError, QUOTA_MESSAGE } from '../storageErrors';

describe('isQuotaError', () => {
  it('recognises the quota error as each browser raises it', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true); // Chrome, Safari, new Firefox
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true); // older Firefox
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
    expect(isQuotaError(new Error('The quota has been exceeded.'))).toBe(true);
    expect(isQuotaError(new Error('Storage quota reached'))).toBe(true);
  });
  it('does not mistake other failures, or non-errors, for it', () => {
    expect(isQuotaError(new Error('boom'))).toBe(false);
    expect(isQuotaError(new DOMException('aborted', 'AbortError'))).toBe(false);
    expect(isQuotaError(new Error('quota for the API key is fine'))).toBe(false);
    for (const v of [null, undefined, 'QuotaExceededError', 22, {}]) expect(isQuotaError(v)).toBe(false);
  });
});

describe('describeStorageError', () => {
  it('says the storage is full for a quota error', () => {
    expect(describeStorageError(new DOMException('x', 'QuotaExceededError'))).toMatchObject({ kind: 'quota', message: QUOTA_MESSAGE });
  });
  it('keeps the browser\'s own words for anything else', () => {
    const p = describeStorageError(new Error('A mutation operation was attempted on a database that did not allow mutations.'));
    expect(p.kind).toBe('other');
    expect(p.message).toContain("couldn't save your changes: A mutation operation");
    expect(describeStorageError('weird').message).toBe("Your browser couldn't save your changes");
  });
});
