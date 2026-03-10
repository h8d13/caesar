import { useSelector } from 'react-redux';
import {
    rouletteBetsSelector,
    rouletteLightningNumbersSelector,
    roulettePhaseDurationSelector,
    roulettePhaseSelector,
    roulettePhaseStartedAtSelector,
    rouletteRoundHistorySelector,
    rouletteWinningNumberSelector
} from './selectors';

export const useRoulettePhase = () => useSelector(roulettePhaseSelector);
export const useRouletteBets = () => useSelector(rouletteBetsSelector);
export const useRouletteWinningNumber = () =>
    useSelector(rouletteWinningNumberSelector);
export const useRouletteRoundHistory = () =>
    useSelector(rouletteRoundHistorySelector);
export const useRouletteLightningNumbers = () =>
    useSelector(rouletteLightningNumbersSelector);
export const useRoulettePhaseStartedAt = () =>
    useSelector(roulettePhaseStartedAtSelector);
export const useRoulettePhaseDuration = () =>
    useSelector(roulettePhaseDurationSelector);
