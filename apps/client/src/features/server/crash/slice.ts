import {
    type CrashPhase,
    type TCrashActiveBet,
    type TCrashRoundHistory,
    type TCrashStateUpdate
} from '@caesar/shared/games/crash';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type TCrashTopWin = {
    userName: string;
    amount: number;
    profit: number;
    cashedOutAt: number;
};

const MAX_TOP_WINS = 5;

export interface TCrashState {
    phase: CrashPhase | null;
    roundId: number | null;
    multiplier: number;
    phaseStartedAt: number | null;
    phaseDuration: number | null;
    bets: TCrashActiveBet[];
    roundHistory: TCrashRoundHistory[];
    lastCrashPoint: number | null;
    topWins: TCrashTopWin[];
}

const initialState: TCrashState = {
    phase: null,
    roundId: null,
    multiplier: 1,
    phaseStartedAt: null,
    phaseDuration: null,
    bets: [],
    roundHistory: [],
    lastCrashPoint: null,
    topWins: []
};

export const crashSlice = createSlice({
    name: 'crash',
    initialState,
    reducers: {
        setStateUpdate: (state, action: PayloadAction<TCrashStateUpdate>) => {
            state.phase = action.payload.phase;
            state.roundId = action.payload.roundId;
            state.multiplier = action.payload.multiplier;
            state.phaseStartedAt = action.payload.phaseStartedAt;
            state.phaseDuration = action.payload.phaseDuration;
            state.bets = action.payload.bets;
        },
        setRoundHistory: (
            state,
            action: PayloadAction<TCrashRoundHistory[]>
        ) => {
            state.roundHistory = action.payload;
        },
        addRoundToHistory: (
            state,
            action: PayloadAction<{ crashPoint: number; roundId: number }>
        ) => {
            state.lastCrashPoint = action.payload.crashPoint;
            state.roundHistory.unshift({
                id: action.payload.roundId,
                crashPoint: action.payload.crashPoint,
                createdAt: Date.now()
            });
            if (state.roundHistory.length > 50) {
                state.roundHistory.pop();
            }
        },
        addRoundWins: (state, action: PayloadAction<TCrashActiveBet[]>) => {
            const wins: TCrashTopWin[] = action.payload
                .filter(
                    (b) =>
                        b.profit !== null &&
                        b.profit > 0 &&
                        b.cashedOutAt !== null
                )
                .map((b) => ({
                    userName: b.userName,
                    amount: b.amount,
                    profit: b.profit!,
                    cashedOutAt: b.cashedOutAt!
                }));

            const combined = [...state.topWins, ...wins]
                .sort((a, b) => b.profit - a.profit)
                .slice(0, MAX_TOP_WINS);

            state.topWins = combined;
        },
        reset: () => initialState
    }
});

const crashSliceActions = crashSlice.actions;
const crashSliceReducer = crashSlice.reducer;

export { crashSliceActions, crashSliceReducer };
