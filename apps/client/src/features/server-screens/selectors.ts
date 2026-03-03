import type { IRootState } from '../store';

export const serverScreensInfoSelector = (state: IRootState) =>
    state.serverScreen;
