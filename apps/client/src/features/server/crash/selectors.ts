import { createSelector } from '@reduxjs/toolkit';
import type { IRootState } from '../../store';

export const crashPhaseSelector = (state: IRootState) => state.crash.phase;
export const crashRoundIdSelector = (state: IRootState) => state.crash.roundId;
export const crashMultiplierSelector = (state: IRootState) =>
    state.crash.multiplier;
export const crashPhaseStartedAtSelector = (state: IRootState) =>
    state.crash.phaseStartedAt;
export const crashPhaseDurationSelector = (state: IRootState) =>
    state.crash.phaseDuration;
export const crashBetsSelector = (state: IRootState) => state.crash.bets;
export const crashRoundHistorySelector = (state: IRootState) =>
    state.crash.roundHistory;
export const crashLastCrashPointSelector = (state: IRootState) =>
    state.crash.lastCrashPoint;
export const crashIsOpenSelector = (state: IRootState) => state.crash.isOpen;

export const crashStateSelector = createSelector(
    [
        crashPhaseSelector,
        crashRoundIdSelector,
        crashMultiplierSelector,
        crashPhaseStartedAtSelector,
        crashPhaseDurationSelector,
        crashBetsSelector
    ],
    (phase, roundId, multiplier, phaseStartedAt, phaseDuration, bets) => ({
        phase,
        roundId,
        multiplier,
        phaseStartedAt,
        phaseDuration,
        bets
    })
);
