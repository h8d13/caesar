import { Buffer } from 'buffer';
import http from 'isomorphic-git/http/web';

if (!globalThis.Buffer) {
    globalThis.Buffer = Buffer;
}

const STORAGE_PREFIX = 'sharkord:git:';

export type GitRepoInfo = {
    url: string;
    defaultBranch: string;
    branches: string[];
    tags: string[];
    headSha: string;
    previousHeadSha?: string;
    hasChanges: boolean;
};

function normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.startsWith('http')) {
        normalized = `https://${normalized}`;
    }
    normalized = normalized.replace(/\.git$/, '');
    return normalized;
}

export async function fetchRepoInfo(url: string): Promise<GitRepoInfo> {
    const git = await import('isomorphic-git');
    const normalized = normalizeUrl(url);

    const corsProxy = 'https://cors.isomorphic-git.org';

    // Get HEAD / default branch
    const headRefs = await git.listServerRefs({
        http,
        corsProxy,
        url: normalized,
        prefix: 'HEAD',
        symrefs: true
    });

    const headRef = headRefs[0];
    const defaultBranch = headRef?.target?.replace('refs/heads/', '') ?? 'main';
    const headSha = headRef?.oid ?? '';

    // Get branches
    const branchRefs = await git.listServerRefs({
        http,
        corsProxy,
        url: normalized,
        prefix: 'refs/heads/'
    });
    const branches = branchRefs.map((r) => r.ref.replace('refs/heads/', ''));

    // Get tags
    const tagRefs = await git.listServerRefs({
        http,
        corsProxy,
        url: normalized,
        prefix: 'refs/tags/'
    });
    const tags = tagRefs.map((r) => r.ref.replace('refs/tags/', ''));

    // Track changes
    const storageKey = STORAGE_PREFIX + normalized;
    const previousHeadSha = localStorage.getItem(storageKey) ?? undefined;
    const hasChanges = !!previousHeadSha && previousHeadSha !== headSha;

    if (headSha) {
        localStorage.setItem(storageKey, headSha);
    }

    return {
        url: normalized,
        defaultBranch,
        branches,
        tags,
        headSha,
        previousHeadSha,
        hasChanges
    };
}
