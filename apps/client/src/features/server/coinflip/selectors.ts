import type { IRootState } from '@/features/store';

export const coinflipChallengesSelector = (state: IRootState) =>
    state.coinflip.challenges;
