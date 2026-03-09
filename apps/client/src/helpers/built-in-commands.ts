import { toast } from 'sonner';
import { fetchRepoInfo } from './git';

export type TBuiltInCommand = {
    name: string;
    description: string;
    handler: (args: string) => void | Promise<void>;
};

export const BUILT_IN_COMMANDS: TBuiltInCommand[] = [
    {
        name: 'ping',
        description: 'Replies with Pong!',
        handler: () => {
            toast.success('Pong!');
        }
    },
    {
        name: 'git',
        description: 'Fetch details about a GitHub repo',
        handler: async (args: string) => {
            const url = args.trim();

            if (!url) {
                toast.error('Usage: /git <repository-url>');
                return;
            }

            try {
                toast.loading('Fetching repo info...', { id: 'git-fetch' });
                const info = await fetchRepoInfo(url);
                toast.dismiss('git-fetch');

                if (info.hasChanges) {
                    toast.success(
                        `${info.url}: HEAD changed!\n${info.previousHeadSha?.slice(0, 7)} → ${info.headSha.slice(0, 7)}`
                    );
                } else {
                    toast.success(
                        `${info.url}\nBranch: ${info.defaultBranch}\nHEAD: ${info.headSha.slice(0, 7)}\n${info.branches.length} branches, ${info.tags.length} tags`
                    );
                }
            } catch (e) {
                toast.dismiss('git-fetch');
                toast.error(
                    `Failed to fetch repo: ${e instanceof Error ? e.message : 'Unknown error'}`
                );
            }
        }
    }
];

/**
 * Try to handle a message as a built-in slash command.
 * Returns true if the message was handled as a command, false otherwise.
 */
export const handleBuiltInCommand = (html: string): boolean => {
    const text = html.replace(/<[^>]*>/g, '').trim();

    if (!text.startsWith('/')) return false;

    const commandName = text.slice(1).split(/\s/)[0].toLowerCase();
    const command = BUILT_IN_COMMANDS.find((c) => c.name === commandName);

    if (!command) return false;

    const args = text.slice(1 + commandName.length).trim();
    command.handler(args);
    return true;
};
