import { QueryClient } from '@tanstack/react-query';

// Session-scoped: lib/trpc cleanup clears it on logout / disconnect. Keys
// such as ['dms', 'e2eeContext', channelId] are per viewer (peer id and
// peer public key) and ['e2ee', 'decrypt', ...] holds plaintext, so none of
// it may outlive the session that fetched it.
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false
        }
    }
});

export { queryClient };
