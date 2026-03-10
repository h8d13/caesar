import { useSelector } from 'react-redux';
import {
    coinflipChallengesSelector,
    coinflipTopWinsSelector
} from './selectors';

export const useCoinflipChallenges = () =>
    useSelector(coinflipChallengesSelector);
export const useCoinflipTopWins = () => useSelector(coinflipTopWinsSelector);
