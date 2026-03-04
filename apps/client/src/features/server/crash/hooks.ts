import { useSelector } from 'react-redux';
import {
  crashBetsSelector,
  crashIsOpenSelector,
  crashMultiplierSelector,
  crashPhaseSelector,
  crashPhaseDurationSelector,
  crashPhaseStartedAtSelector,
  crashRoundHistorySelector,
  crashStateSelector,
} from './selectors';

export const useCrashPhase = () => useSelector(crashPhaseSelector);
export const useCrashMultiplier = () => useSelector(crashMultiplierSelector);
export const useCrashBets = () => useSelector(crashBetsSelector);
export const useCrashRoundHistory = () =>
  useSelector(crashRoundHistorySelector);
export const useCrashIsOpen = () => useSelector(crashIsOpenSelector);
export const useCrashState = () => useSelector(crashStateSelector);
export const useCrashPhaseStartedAt = () =>
  useSelector(crashPhaseStartedAtSelector);
export const useCrashPhaseDuration = () =>
  useSelector(crashPhaseDurationSelector);
