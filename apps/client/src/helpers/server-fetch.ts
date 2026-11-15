type TErrorBody = {
    error?: string;
    errors?: Record<string, string>;
};

const UNREACHABLE_MESSAGE =
    'the server is unreachable. It may be restarting, try again in a moment.';

// fetch rejects (TypeError) when nothing answers at all: offline, DNS,
// proxy down. Its message differs per browser and says nothing useful.
const serverFetch = async (
    input: string,
    init?: RequestInit
): Promise<Response> => {
    try {
        return await fetch(input, init);
    } catch {
        throw new Error(UNREACHABLE_MESSAGE);
    }
};

// Our endpoints always answer errors as JSON, but the proxy in front of the
// server does not: while the server restarts Caddy replies 502 with an empty
// body, and parsing that threw "Unexpected end of JSON input". A body that
// is not ours means the server itself did not answer.
const readErrorBody = async (response: Response): Promise<TErrorBody> => {
    let body: unknown;

    try {
        body = await response.json();
    } catch {
        body = undefined;
    }

    if (body && typeof body === 'object') return body;

    if (response.status >= 500) throw new Error(UNREACHABLE_MESSAGE);

    return {};
};

export { readErrorBody, serverFetch, UNREACHABLE_MESSAGE };
