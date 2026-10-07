import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, test } from 'vitest';
import { iniDefaults, parseIniConfig } from '../ini-config';

// The shipped config.ini (repo root) lists every key commented out at its
// default. cwd is apps/server, same base as paths.ts.
const shippedIni = readFileSync(
  path.resolve(process.cwd(), '../../config.ini'),
  'utf-8'
);
const uncomment = (text: string) => text.replace(/^;(?=\w+=)/gm, '');

describe('parseIniConfig', () => {
  test('shipped config.ini as-is resolves to the defaults', () => {
    expect(parseIniConfig(shippedIni)).toEqual(iniDefaults);
  });

  test('shipped config.ini documents every key at its code default', () => {
    // fails when a limiter or default changes without updating config.ini
    expect(parseIniConfig(uncomment(shippedIni))).toEqual(iniDefaults);
    expect(uncomment(shippedIni).match(/^\w+=/gm)).toHaveLength(
      Object.keys(iniDefaults.rateLimiters).length * 2 +
        Object.keys(iniDefaults.loginLockout).length
    );
  });

  test('empty file resolves to the defaults', () => {
    expect(parseIniConfig('')).toEqual(iniDefaults);
  });

  test('overrides only the keys given', () => {
    const config = parseIniConfig(
      '[rateLimiters.login]\nmaxRequests=9\n[loginLockout]\nmaxFailures=3\n'
    );

    expect(config.rateLimiters.login).toEqual({
      maxRequests: 9,
      windowMs: iniDefaults.rateLimiters.login.windowMs
    });
    expect(config.loginLockout.maxFailures).toBe(3);
    expect(config.rateLimiters.joinServer).toEqual(
      iniDefaults.rateLimiters.joinServer
    );
  });

  test('unknown limiter is rejected by name', () => {
    expect(() =>
      parseIniConfig('[rateLimiters.loginn]\nmaxRequests=9\n')
    ).toThrow(/loginn/);
  });

  test('unknown key is rejected by name', () => {
    expect(() => parseIniConfig('[loginLockout]\nmaxFailure=3\n')).toThrow(
      /maxFailure/
    );
  });

  test('non-positive value is rejected with its path', () => {
    expect(() =>
      parseIniConfig('[rateLimiters.login]\nmaxRequests=0\n')
    ).toThrow(/rateLimiters\.login\.maxRequests/);
  });
});
