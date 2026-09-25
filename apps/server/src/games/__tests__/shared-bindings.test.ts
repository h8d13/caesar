import { describe, expect, test } from 'vitest';
import { withBalanceLock } from '../shared-bindings';

describe('withBalanceLock', () => {
  test('serializes check-then-debit for the same user', async () => {
    let balance = 100;
    const debits: boolean[] = [];

    // Without the lock every call reads 100 before any debit lands.
    const bet = () =>
      withBalanceLock(42, async () => {
        const seen = balance;
        await new Promise((resolve) => setTimeout(resolve, 5));

        if (seen < 100) {
          debits.push(false);
          return;
        }

        balance = seen - 100;
        debits.push(true);
      });

    await Promise.all([bet(), bet(), bet()]);

    expect(debits.filter(Boolean)).toHaveLength(1);
    expect(balance).toBe(0);
  });

  test('a rejected call does not wedge the next one', async () => {
    await expect(
      withBalanceLock(7, async () => {
        throw new Error('Insufficient balance');
      })
    ).rejects.toThrow('Insufficient balance');

    await expect(withBalanceLock(7, async () => 'ok')).resolves.toBe('ok');
  });
});
