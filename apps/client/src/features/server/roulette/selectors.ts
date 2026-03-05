import type { IRootState } from '../../store';

export const roulettePhaseSelector = (state: IRootState) =>
    state.roulette.phase;
export const roulettePhaseStartedAtSelector = (state: IRootState) =>
    state.roulette.phaseStartedAt;
export const roulettePhaseDurationSelector = (state: IRootState) =>
    state.roulette.phaseDuration;
export const rouletteBetsSelector = (state: IRootState) => state.roulette.bets;
export const rouletteWinningNumberSelector = (state: IRootState) =>
    state.roulette.winningNumber;
export const rouletteRoundHistorySelector = (state: IRootState) =>
    state.roulette.roundHistory;
export const rouletteTopWinsSelector = (state: IRootState) =>
    state.roulette.topWins;
