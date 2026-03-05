import type { IRootState } from '../../store';

export const crashPhaseSelector = (state: IRootState) => state.crash.phase;
export const crashMultiplierSelector = (state: IRootState) =>
    state.crash.multiplier;
export const crashPhaseStartedAtSelector = (state: IRootState) =>
    state.crash.phaseStartedAt;
export const crashPhaseDurationSelector = (state: IRootState) =>
    state.crash.phaseDuration;
export const crashBetsSelector = (state: IRootState) => state.crash.bets;
export const crashRoundHistorySelector = (state: IRootState) =>
    state.crash.roundHistory;
export const crashTopWinsSelector = (state: IRootState) => state.crash.topWins;
export const crashIsOpenSelector = (state: IRootState) => state.crash.isOpen;
