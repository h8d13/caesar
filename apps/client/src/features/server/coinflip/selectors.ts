import type { IRootState } from '../../store';

export const coinflipChallengesSelector = (state: IRootState) =>
    state.coinflip.challenges;
