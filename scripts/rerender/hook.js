// Redundant re-render scanner. Paste into a page of the prod-dev profiling
// build (CAESAR_PROFILE=1, see compose.prod-dev.yaml) with React DevTools
// installed: wraps the DevTools hook's onCommitFiberRoot and diffs every
// fiber that did work in a commit against its previous version.
//
// A render is classified by what changed since the last one:
//   changed   a prop/state/context value really differs -> legit
//   unstable  new reference, structurally equal (inline object, selector
//             returning a fresh array, provider value rebuilt) -> redundant
//   fn        new function reference -> redundant unless the fn body reads
//             different closure values, worth a look
//   cascade   nothing differs, parent re-rendered and component isn't memo
// A render with no `changed` cause counts as redundant.
//
// Redundant renders are also credited to their cut root: the topmost
// redundant fiber under a parent that re-rendered for a real reason. That
// is where a memo() or a stable prop stops the whole cascade, `wasted`
// counts every redundant render below it, library leaves included.
//
// Timing: the profiling build (CAESAR_PROFILE aliases react-dom/profiling)
// sets selfBaseDuration on every fiber, its own render time without
// children. Renders and redundant renders also sum it, so a row reads as
// "how much time went to renders that changed nothing". Other builds
// report 0ms.
//
// API (window.__rr): reset(), mark(label) starts a named scenario,
// async report({ top = 25, scenario }) -> text, cut roots by wasted count,
// totals() -> per scenario `redundant/renders redundantMs/ms`.
// Pasting again swaps the implementation in place (single hook wrapper).
(() => {
	const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;

	if (!hook) throw new Error('no __REACT_DEVTOOLS_GLOBAL_HOOK__');

	const PERFORMED_WORK = 1;
	const FUNCTION = 0;
	const CLASS = 1;
	const FORWARD_REF = 11;
	const SIMPLE_MEMO = 15;
	// MemoComponent (14) never does work itself, its tag-0 child does
	const RENDERING = new Set([FUNCTION, CLASS, FORWARD_REF, SIMPLE_MEMO]);
	const DEEP_LIMIT = 6;
	const MAX_ERRORS = 5;

	let scenario = 'default';
	let commits = 0;
	// scenario -> type -> { renders, redundant, causes: Map }
	let stats = new Map();
	// scenario -> cut root type -> { cuts, wasted, parents: Map }
	let cuts = new Map();
	const errors = [];

	const isObject = (v) => v !== null && typeof v === 'object';

	// structural equality; functions only equal by reference, so an
	// inline callback nested in an object reports as a real change
	const deepEqual = (a, b, depth = 0) => {
		if (Object.is(a, b)) return true;
		if (!isObject(a) || !isObject(b) || depth > DEEP_LIMIT) return false;
		if (Array.isArray(a) !== Array.isArray(b)) return false;
		if (a instanceof Map || a instanceof Set) return false;

		const ka = Object.keys(a);
		const kb = Object.keys(b);

		if (ka.length !== kb.length) return false;

		return ka.every((k) => k === '_owner' || k === '_store'
			|| deepEqual(a[k], b[k], depth + 1));
	};

	const classify = (prev, next) => {
		if (Object.is(prev, next)) return null;
		if (typeof prev === 'function' && typeof next === 'function')
			return 'fn';
		return deepEqual(prev, next) ? 'unstable' : 'changed';
	};

	const diffProps = (prev, next, causes) => {
		if (prev === next) return;

		const keys = new Set([
			...Object.keys(prev ?? {}),
			...Object.keys(next ?? {})
		]);

		for (const k of keys) {
			const kind = classify(prev?.[k], next?.[k]);

			if (kind) causes.push([kind, `prop:${k}`]);
		}
	};

	// hooks with a queue hold state (useState/useReducer/useSES/
	// useActionState); memo/ref/effect slots get rebuilt every render
	const diffHooks = (prevHook, nextHook, causes) => {
		for (let i = 0; prevHook && nextHook; i++) {
			if (nextHook.queue) {
				const kind = classify(
					prevHook.memoizedState,
					nextHook.memoizedState
				);

				if (kind) causes.push([kind, `hook#${i}`]);
			}
			prevHook = prevHook.next;
			nextHook = nextHook.next;
		}
	};

	const diffContexts = (prev, next, causes) => {
		let p = prev?.dependencies?.firstContext;
		let n = next?.dependencies?.firstContext;

		for (let i = 0; p && n; i++) {
			const kind = classify(p.memoizedValue, n.memoizedValue);

			if (kind) causes.push([kind, `ctx#${i}`]);
			p = p.next;
			n = n.next;
		}
	};

	const typeKey = (fiber) =>
		fiber.tag === FORWARD_REF ? fiber.type.render : fiber.type;

	const bucket = (all, type, init) => {
		let byType = all.get(scenario);

		if (!byType) all.set(scenario, (byType = new Map()));

		let s = byType.get(type);

		if (!s) byType.set(type, (s = init()));

		return s;
	};

	const newStat = () => ({
		renders: 0,
		redundant: 0,
		ms: 0,
		redundantMs: 0,
		causes: new Map()
	});
	const newCut = () => ({ cuts: 0, wasted: 0, ms: 0, parents: new Map() });
	const selfMs = (fiber) => fiber.selfBaseDuration ?? 0;
	const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

	const record = (prev, next) => {
		const causes = [];

		diffProps(prev.memoizedProps, next.memoizedProps, causes);
		if (next.tag === CLASS) {
			const kind = classify(prev.memoizedState, next.memoizedState);

			if (kind) causes.push([kind, 'state']);
		} else {
			diffHooks(prev.memoizedState, next.memoizedState, causes);
		}
		diffContexts(prev, next, causes);

		const s = bucket(stats, typeKey(next), newStat);
		const redundant = !causes.some(([kind]) => kind === 'changed');

		s.renders++;
		s.ms += selfMs(next);
		if (!redundant) return false;

		s.redundant++;
		s.redundantMs += selfMs(next);
		if (causes.length === 0) causes.push(['cascade', '']);
		for (const [kind, what] of causes) {
			bump(s.causes, what ? `${kind} ${what}` : kind);
		}

		return true;
	};

	// parent = nearest ancestor that rendered in this commit
	const credit = (fiber, parent, verdicts, roots) => {
		let root = parent && verdicts.get(parent) ? roots.get(parent) : null;

		if (!root) {
			root = fiber;

			const cut = bucket(cuts, typeKey(fiber), newCut);

			cut.cuts++;
			bump(cut.parents, parent ? typeKey(parent) : null);
		}

		const c = bucket(cuts, typeKey(root), newCut);

		c.wasted++;
		c.ms += selfMs(fiber);
		roots.set(fiber, root);
	};

	// Same walk as DevTools: a subtree whose child pointer is shared with
	// the previous tree bailed out and keeps stale flags, skip it. Each
	// stack entry carries its nearest rendered ancestor, so crediting a
	// cut root never walks back up.
	const walk = (next) => {
		const stack = [[next, null]];
		const verdicts = new Map();
		const roots = new Map();

		while (stack.length) {
			const [fiber, parent] = stack.pop();
			const prev = fiber.alternate;
			let nearest = parent;

			if (prev && RENDERING.has(fiber.tag)
				&& (fiber.flags & PERFORMED_WORK)) {
				const redundant = record(prev, fiber);

				verdicts.set(fiber, redundant);
				if (redundant) credit(fiber, parent, verdicts, roots);
				nearest = fiber;
			}
			if (prev && fiber.child === prev.child) continue;
			for (let c = fiber.child; c; c = c.sibling) {
				stack.push([c, nearest]);
			}
		}
	};

	const scan = (root) => {
		try {
			commits++;
			walk(root.current);
		} catch (e) {
			if (errors.length < MAX_ERRORS) {
				errors.push(String(e?.stack ?? e));
			}
		}
	};

	if (!hook.__rrWrapped) {
		const orig = hook.onCommitFiberRoot;

		hook.onCommitFiberRoot = function (id, root, ...rest) {
			window.__rr?.scan(root);

			return orig?.call(this, id, root, ...rest);
		};
		hook.__rrWrapped = true;
	}

	// --- sourcemap resolution: fn source text -> chunk offset -> source ---

	const B64 =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

	// one VLQ segment -> its signed fields
	const decodeVlq = (seg) => {
		const vals = [];
		let v = 0;
		let shift = 0;

		for (const ch of seg) {
			const d = B64.indexOf(ch);

			v += (d & 31) << shift;
			if (d & 32) {
				shift += 5;
				continue;
			}
			vals.push(v & 1 ? -(v >>> 1) : v >>> 1);
			v = 0;
			shift = 0;
		}

		return vals;
	};

	// per generated line: [col, sourceIndex, sourceLine] segments
	const decodeMappings = (mappings) => {
		const lines = [];
		const st = [0, 0, 0];

		for (const line of mappings.split(';')) {
			const segs = [];
			let col = 0;

			for (const seg of line.split(',')) {
				if (!seg) continue;

				const vals = decodeVlq(seg);

				col += vals[0];
				if (vals.length < 4) continue;
				for (let i = 0; i < 3; i++) st[i] += vals[i + 1];
				segs.push([col, st[0], st[1]]);
			}
			lines.push(segs);
		}

		return lines;
	};

	// maps decode lazily (tens of MB as arrays), only for chunks a
	// component is found in
	const chunks = new Map();
	const located = new Map();

	const loadChunks = async () => {
		const urls = performance.getEntriesByType('resource')
			.map((e) => e.name)
			.filter((u) => /\/assets\/.*\.js$/.test(u) && !chunks.has(u));

		await Promise.all([...new Set(urls)].map(async (url) => {
			const [code, map] = await Promise.all([
				fetch(url).then((r) => r.text()),
				fetch(`${url}.map`).then((r) => (r.ok ? r.json() : null))
			]);

			chunks.set(url, { code, map, lines: null });
		}));
	};

	const shortSource = (path) => path
		.replace(/^(\.\.\/)+/, '')
		.replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, 'npm:');

	const locateIn = (url, c, at) => {
		let line = 0;
		let lineStart = 0;

		for (let i = c.code.indexOf('\n'); i !== -1 && i < at;
			i = c.code.indexOf('\n', i + 1)) {
			line++;
			lineStart = i + 1;
		}
		c.lines ??= decodeMappings(c.map.mappings);

		let hit = null;

		for (const s of c.lines[line] ?? []) {
			if (s[0] > at - lineStart) break;
			hit = s;
		}

		return hit
			? `${shortSource(c.map.sources[hit[1]])}:${hit[2] + 1}`
			: `${url.split('/').pop()}:${line + 1}`;
	};

	const locate = (fn) => {
		if (typeof fn !== 'function') return '?';
		if (located.has(fn)) return located.get(fn);

		const src = fn.toString();
		let out = `unresolved:${fn.name || 'anon'}`;

		for (const [url, c] of chunks) {
			const at = c.code.indexOf(src);

			if (at < 0 || !c.map) continue;
			out = locateIn(url, c, at);
			break;
		}
		located.set(fn, out);

		return out;
	};

	const topKeys = (map, n, fmt = (k) => k) => [...map]
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([k, v]) => `${fmt(k)} x${v}`)
		.join(', ');

	const where = (type) => type ? locate(type) : '<root>';

	// one line per cut root: wasted renders below it, how often it was
	// the cut, its own render stats and causes, the parents re-rendering it
	const report = async ({ top = 25, scenario: only } = {}) => {
		await loadChunks();

		const lines = [`commits=${commits} errors=${errors.length}`];

		for (const [name, byType] of cuts) {
			if (only && name !== only) continue;

			lines.push(`## ${name}`);
			for (const [type, c] of [...byType]
				.filter(([, c]) => c.cuts > 0)
				.sort((a, b) => b[1].wasted - a[1].wasted)
				.slice(0, top)) {
				const s = stats.get(name).get(type);

				lines.push([
					`wasted=${c.wasted} ${c.ms.toFixed(2)}ms cuts=${c.cuts}`,
					`${s.redundant}/${s.renders}`,
					where(type),
					`[${topKeys(s.causes, 3)}]`,
					`<- ${topKeys(c.parents, 2, where)}`
				].join(' | '));
			}
		}
		lines.push(...errors);

		return lines.join('\n');
	};

	const totals = () => {
		const out = {};

		for (const [name, byType] of stats) {
			let renders = 0;
			let redundant = 0;
			let ms = 0;
			let redundantMs = 0;

			for (const s of byType.values()) {
				renders += s.renders;
				redundant += s.redundant;
				ms += s.ms;
				redundantMs += s.redundantMs;
			}
			out[name] = `${redundant}/${renders} `
				+ `${redundantMs.toFixed(2)}/${ms.toFixed(2)}ms`;
		}

		return out;
	};

	window.__rr = {
		scan,
		reset() {
			stats = new Map();
			cuts = new Map();
			commits = 0;
			errors.length = 0;
		},
		mark(label) {
			scenario = label;
		},
		report,
		totals
	};

	return 'installed';
})();
