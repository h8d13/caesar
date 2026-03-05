export type TRouletteLedgerCallbacks = {
  createLedgerEntry: (
    userId: number,
    amount: number,
    roundId: number
  ) => Promise<number>;
  updateLedgerEntry: (entryId: number, newAmount: number) => Promise<void>;
  onUserBalanceChanged: (userId: number) => Promise<void>;
  getBalance: (userId: number) => Promise<number>;
};
