import { useSelector } from 'react-redux';
import {
    crashBetsSelector,
    crashMultiplierSelector,
    crashPhaseDurationSelector,
    crashPhaseSelector,
    crashPhaseStartedAtSelector,
    crashRoundHistorySelector
} from './selectors';

export const useCrashPhase = () => useSelector(crashPhaseSelector);
export const useCrashMultiplier = () => useSelector(crashMultiplierSelector);
export const useCrashBets = () => useSelector(crashBetsSelector);
export const useCrashRoundHistory = () =>
    useSelector(crashRoundHistorySelector);
export const useCrashPhaseStartedAt = () =>
    useSelector(crashPhaseStartedAtSelector);
export const useCrashPhaseDuration = () =>
    useSelector(crashPhaseDurationSelector);
