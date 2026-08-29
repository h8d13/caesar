import type {
    TFile,
    TJoinedUser,
    TMessage,
    TStorageData
} from '@caesar/shared';
import { createContext, useContext } from 'react';

enum ModViewScreen {
    FILES = 'FILES',
    MESSAGES = 'MESSAGES',
    LINKS = 'LINKS'
}

type TModViewContext = {
    refetch: () => void;
    userId: number;
    user: TJoinedUser;
    lastLoginIp: string | null;
    files: TFile[];
    storage: TStorageData & { quota: number };
    messages: TMessage[];
    view: ModViewScreen | undefined;
    setView: (view: ModViewScreen | undefined) => void;
    links: string[];
};

const ModViewContext = createContext<TModViewContext>({
    refetch: () => {},
    userId: -1,
    lastLoginIp: null,
    files: [],
    storage: {
        userId: -1,
        fileCount: 0,
        usedStorage: 0,
        quota: 0
    },
    messages: [],
    user: {} as TJoinedUser,
    view: undefined,
    setView: () => {},
    links: []
});

const useModViewContext = () => useContext(ModViewContext);

// eslint-disable-next-line react-refresh/only-export-components
export { ModViewContext, ModViewScreen, useModViewContext };
export type { TModViewContext };
