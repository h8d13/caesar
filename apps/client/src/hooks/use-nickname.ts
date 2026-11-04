import { getNickname, subscribeNicknames } from '@/helpers/nicknames';
import { useSyncExternalStore } from 'react';

const useNickname = (userId: number) =>
    useSyncExternalStore(subscribeNicknames, () => getNickname(userId));

export { useNickname };
