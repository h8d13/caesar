import { useSelector } from 'react-redux';
import { coinflipChallengesSelector } from './selectors';

export const useCoinflipChallenges = () =>
    useSelector(coinflipChallengesSelector);
