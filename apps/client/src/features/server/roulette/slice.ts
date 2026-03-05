import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
    type RoulettePhase,
    type TRouletteActiveBet,
    type TRouletteRoundHistory,
    type TRouletteStateUpdate
} from '@sharkord/shared/games/roulette';

export type TRouletteTopWin = {
    userName: string;
    amount: number;
    profit: number;
    betType: string;
};

const MAX_TOP_WINS = 5;

export interface TRouletteState {
    phase: RoulettePhase | null;
    roundId: number | null;
    phaseStartedAt: number | null;
    phaseDuration: number | null;
    winningNumber: number | null;
    bets: TRouletteActiveBet[];
    roundHistory: TRouletteRoundHistory[];
    topWins: TRouletteTopWin[];
}

const initialState: TRouletteState = {
    phase: null,
    roundId: null,
    phaseStartedAt: null,
    phaseDuration: null,
    winningNumber: null,
    bets: [],
    roundHistory: [],
    topWins: []
};

export const rouletteSlice = createSlice({
    name: 'roulette',
    initialState,
    reducers: {
        setStateUpdate: (
            state,
            action: PayloadAction<TRouletteStateUpdate>
        ) => {
            state.phase = action.payload.phase;
            state.roundId = action.payload.roundId;
            state.phaseStartedAt = action.payload.phaseStartedAt;
            state.phaseDuration = action.payload.phaseDuration;
            state.winningNumber = action.payload.winningNumber;
            state.bets = action.payload.bets;
        },
        setRoundHistory: (
            state,
            action: PayloadAction<TRouletteRoundHistory[]>
        ) => {
            state.roundHistory = action.payload;
        },
        addRoundToHistory: (
            state,
            action: PayloadAction<{
                winningNumber: number;
                roundId: number;
            }>
        ) => {
            state.roundHistory.unshift({
                id: action.payload.roundId,
                winningNumber: action.payload.winningNumber,
                createdAt: Date.now()
            });
            if (state.roundHistory.length > 50) {
                state.roundHistory.pop();
            }
        },
        addRoundWins: (state, action: PayloadAction<TRouletteActiveBet[]>) => {
            const wins: TRouletteTopWin[] = action.payload
                .filter((b) => b.profit !== null && b.profit > 0)
                .map((b) => ({
                    userName: b.userName,
                    amount: b.amount,
                    profit: b.profit!,
                    betType: b.betType
                }));

            const combined = [...state.topWins, ...wins]
                .sort((a, b) => b.profit - a.profit)
                .slice(0, MAX_TOP_WINS);

            state.topWins = combined;
        },
        reset: () => initialState
    }
});

const rouletteSliceActions = rouletteSlice.actions;
const rouletteSliceReducer = rouletteSlice.reducer;

export { rouletteSliceActions, rouletteSliceReducer };
