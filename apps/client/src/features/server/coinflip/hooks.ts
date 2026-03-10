import { useSelector } from 'react-redux';
import {
    coinflipChallengesSelector,
    coinflipRecentResultsSelector,
    coinflipTopWinsSelector
} from './selectors';

export const useCoinflipChallenges = () =>
    useSelector(coinflipChallengesSelector);
export const useCoinflipRecentResults = () =>
    useSelector(coinflipRecentResultsSelector);
export const useCoinflipTopWins = () => useSelector(coinflipTopWinsSelector);
