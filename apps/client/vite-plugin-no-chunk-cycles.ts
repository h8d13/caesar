import type { Plugin } from 'vite';

// Fails the build when chunks statically import each other. Inside a chunk
// cycle one chunk has to run first and reads the other's exports as
// undefined: a manual codeSplitting group once left prosemirror-history in
// `editor` and rope-sequence in `server-view`, crashing the prod client at
// load on `RopeSequence.empty`. Dev serves unbundled modules, so only a
// build can catch it. Dynamic imports are excluded: they can't form an
// init-order cycle.
export default function noChunkCycles(): Plugin {
    return {
        name: 'no-chunk-cycles',
        apply: 'build',
        generateBundle(_options, bundle) {
            const imports = new Map<string, string[]>();

            for (const output of Object.values(bundle)) {
                if (output.type === 'chunk')
                    imports.set(output.fileName, output.imports);
            }

            const cycles: string[][] = [];
            const done = new Set<string>();
            const stack: string[] = [];

            const visit = (file: string) => {
                stack.push(file);

                for (const dep of imports.get(file) ?? []) {
                    const at = stack.indexOf(dep);

                    if (at >= 0) cycles.push([...stack.slice(at), dep]);
                    else if (!done.has(dep)) visit(dep);
                }

                stack.pop();
                done.add(file);
            };

            for (const file of imports.keys()) {
                if (!done.has(file)) visit(file);
            }

            if (!cycles.length) return;

            this.error(
                'chunk import cycles:\n' +
                    cycles.map((cycle) => `  ${cycle.join(' -> ')}`).join('\n')
            );
        }
    };
}
