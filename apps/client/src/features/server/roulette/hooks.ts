import { useSelector } from 'react-redux';
import {
    rouletteBetsSelector,
    roulettePhaseDurationSelector,
    roulettePhaseSelector,
    roulettePhaseStartedAtSelector,
    rouletteRoundHistorySelector,
    rouletteTopWinsSelector,
    rouletteWinningNumberSelector
} from './selectors';

export const useRoulettePhase = () => useSelector(roulettePhaseSelector);
export const useRouletteBets = () => useSelector(rouletteBetsSelector);
export const useRouletteWinningNumber = () =>
    useSelector(rouletteWinningNumberSelector);
export const useRouletteRoundHistory = () =>
    useSelector(rouletteRoundHistorySelector);
export const useRouletteTopWins = () => useSelector(rouletteTopWinsSelector);
export const useRoulettePhaseStartedAt = () =>
    useSelector(roulettePhaseStartedAtSelector);
export const useRoulettePhaseDuration = () =>
    useSelector(roulettePhaseDurationSelector);
