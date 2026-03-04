import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  type CrashPhase,
  type TCrashActiveBet,
  type TCrashRoundHistory,
  type TCrashStateUpdate,
} from '@sharkord/shared/games/crash';

export interface TCrashState {
  phase: CrashPhase | null;
  roundId: number | null;
  multiplier: number;
  phaseStartedAt: number | null;
  phaseDuration: number | null;
  bets: TCrashActiveBet[];
  roundHistory: TCrashRoundHistory[];
  lastCrashPoint: number | null;
  isOpen: boolean;
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
  isOpen: false,
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
    setRoundHistory: (state, action: PayloadAction<TCrashRoundHistory[]>) => {
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
        createdAt: Date.now(),
      });
      if (state.roundHistory.length > 50) {
        state.roundHistory.pop();
      }
    },
    setIsOpen: (state, action: PayloadAction<boolean>) => {
      state.isOpen = action.payload;
    },
    reset: () => initialState,
  },
});

const crashSliceActions = crashSlice.actions;
const crashSliceReducer = crashSlice.reducer;

export { crashSliceActions, crashSliceReducer };
