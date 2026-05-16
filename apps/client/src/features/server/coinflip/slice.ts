import {
    type TCoinflipChallenge,
    type TCoinflipResult,
    type TCoinflipStateUpdate
} from '@caesar/shared/games/coinflip';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type TCoinflipTopWin = {
    winnerName: string;
    loserName: string;
    amount: number;
    profit: number;
};

const MAX_TOP_WINS = 5;

export interface TCoinflipState {
    challenges: TCoinflipChallenge[];
    recentResults: TCoinflipResult[];
    topWins: TCoinflipTopWin[];
}

const initialState: TCoinflipState = {
    challenges: [],
    recentResults: [],
    topWins: []
};

export const coinflipSlice = createSlice({
    name: 'coinflip',
    initialState,
    reducers: {
        setStateUpdate: (
            state,
            action: PayloadAction<TCoinflipStateUpdate>
        ) => {
            state.challenges = action.payload.challenges;
        },
        addResult: (state, action: PayloadAction<TCoinflipResult>) => {
            state.recentResults.unshift(action.payload);
            if (state.recentResults.length > 20) {
                state.recentResults.pop();
            }

            const result = action.payload;
            const win: TCoinflipTopWin = {
                winnerName: result.winnerName,
                loserName: result.loserName,
                amount: result.amount,
                profit: result.amount
            };

            const combined = [...state.topWins, win]
                .sort((a, b) => b.profit - a.profit)
                .slice(0, MAX_TOP_WINS);
            state.topWins = combined;
        },
        reset: () => initialState
    }
});

const coinflipSliceActions = coinflipSlice.actions;
const coinflipSliceReducer = coinflipSlice.reducer;

export { coinflipSliceActions, coinflipSliceReducer };
