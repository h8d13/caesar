export type TCoinflipLedgerCallbacks = {
  createLedgerEntry: (
    userId: number,
    amount: number,
    challengeId: number
  ) => Promise<number>;
  updateLedgerEntry: (entryId: number, newAmount: number) => Promise<void>;
  onUserBalanceChanged: (userId: number) => Promise<void>;
  getBalance: (userId: number) => Promise<number>;
};
