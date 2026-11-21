// Helpers shared by the scenarios: a visible cursor, human-paced input and
// the sign-up / sign-in steps every scenario starts from.
//
// Selectors: prefer roles, labels and the TestId enum (packages/shared) over
// CSS classes, so restyling the app does not break a scenario.

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);

export const BASE_URL = 'http://localhost:5173';
export const OUT_DIR = '/app/.github/previews';
export const WORK_DIR = '/tmp/previews';
export const DEBUG = !!process.env.PREVIEWS_DEBUG;
// GIF size and frame rate: the readme column is under 1000px wide
const GIF_WIDTH = 960;
const GIF_FPS = 12;
export const VIEWPORT = { width: 1280, height: 720 };
export const PASSWORD = 'correct-horse-battery';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Headless chromium paints no mouse pointer, so the page draws its own. Kept
// out of the accessibility tree and never a pointer target.
const CURSOR_SCRIPT = () => {
    const install = () => {
        if (document.getElementById('__preview-cursor')) return;

        const cursor = document.createElement('div');

        cursor.id = '__preview-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        cursor.innerHTML =
            '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.4 6.9z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        Object.assign(cursor.style, {
            position: 'fixed',
            left: '0',
            top: '0',
            zIndex: '2147483647',
            pointerEvents: 'none',
            // translate, not transform: the scale of a click is applied
            // after `translate` but before `transform`, so a transform
            // offset would be scaled too and the cursor would jump a fifth
            // of the way to the corner on every click
            translate: '-100px -100px',
            transition: 'scale 80ms ease-out',
            transformOrigin: '4px 2px'
        });
        document.documentElement.appendChild(cursor);

        const move = (event) => {
            cursor.style.translate = `${event.clientX - 4}px ${event.clientY - 2}px`;
        };

        // capture: the app may stop propagation (drag and drop does)
        window.addEventListener('pointermove', move, true);
        window.addEventListener('mousemove', move, true);
        window.addEventListener(
            'pointerdown',
            () => (cursor.style.scale = '0.8'),
            true
        );
        window.addEventListener(
            'pointerup',
            () => (cursor.style.scale = '1'),
            true
        );
    };

    if (document.documentElement) install();
    document.addEventListener('DOMContentLoaded', install);
};

export const installCursor = (context) => context.addInitScript(CURSOR_SCRIPT);

// One actor per page: remembers where the pointer is so every move starts
// from the previous spot instead of jumping.
export const createActor = (page) => {
    let pos = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

    const moveToPoint = async (x, y) => {
        const distance = Math.hypot(x - pos.x, y - pos.y);
        const steps = Math.max(6, Math.min(24, Math.round(distance / 26)));

        // eased, so the pointer slows down into its target
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

            await page.mouse.move(
                pos.x + (x - pos.x) * eased,
                pos.y + (y - pos.y) * eased
            );
            await sleep(8);
        }

        pos = { x, y };
    };

    const centerOf = async (locator) => {
        await locator.waitFor({ state: 'visible' });
        await locator.scrollIntoViewIfNeeded();

        const box = await locator.boundingBox();

        if (!box) throw new Error(`No bounding box for ${locator}`);

        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    const moveTo = async (locator) => {
        const { x, y } = await centerOf(locator);

        await moveToPoint(x, y);
    };

    const actor = {
        page,
        moveTo,
        moveToPoint,
        pause: sleep,

        // A real pointer click where the cursor visibly is. Not
        // locator.click(): for members the sidebar rows are dnd-kit
        // draggables marked aria-disabled, which it would wait on forever.
        click: async (locator, { after = 350 } = {}) => {
            await moveTo(locator);
            await sleep(180);
            await page.mouse.down();
            await sleep(60);
            await page.mouse.up();
            await sleep(after);
        },

        // Wheel-scrolls until the element is well inside the viewport,
        // instead of the instant jump scrollIntoViewIfNeeded makes. Stops as
        // soon as the page no longer moves (element at the very top/bottom).
        scrollTo: async (locator) => {
            await locator.waitFor({ state: 'attached' });
            await page.mouse.move(pos.x, pos.y);

            let previous;

            for (let i = 0; i < 100; i++) {
                const box = await locator.boundingBox();

                if (!box) break;

                const middle = box.y + box.height / 2;

                if (middle === previous) break;
                previous = middle;

                if (middle > VIEWPORT.height * 0.8) {
                    await page.mouse.wheel(0, 140);
                } else if (middle < VIEWPORT.height * 0.1) {
                    await page.mouse.wheel(0, -140);
                } else {
                    break;
                }

                await sleep(30);
            }

            await sleep(200);
        },

        hover: async (locator) => {
            await moveTo(locator);
            await sleep(250);
        },

        type: async (locator, text, { delay = 55 } = {}) => {
            await actor.click(locator, { after: 120 });
            await page.keyboard.type(text, { delay });
            await sleep(250);
        },

        press: async (key) => {
            await page.keyboard.press(key);
            await sleep(300);
        },

        // Draws one pen stroke through viewport points (whiteboard).
        stroke: async (points) => {
            const [first, ...rest] = points;

            await moveToPoint(first[0], first[1]);
            await page.mouse.down();

            for (const [x, y] of rest) await moveToPoint(x, y);

            await page.mouse.up();
            await sleep(150);
        },

        // Pointer drag in small steps: dnd-kit only starts a drag after the
        // pointer has moved past its activation distance.
        drag: async (from, to, { hold = 250 } = {}) => {
            await moveTo(from);
            await sleep(200);
            await page.mouse.down();
            await sleep(hold);

            const target = await centerOf(to);

            await moveToPoint(pos.x + 6, pos.y + 6);
            await moveToPoint(target.x, target.y);
            await sleep(hold);
            await page.mouse.up();
            await sleep(400);
        }
    };

    return actor;
};

const testId = (page, id) => page.getByTestId(id);

// Human-paced sign-up for a recording. The page was opened from an invite
// link (/?invite=CODE), which lands on the Sign up tab with the code filled.
export const signUp = async (actor, identity) => {
    const { page } = actor;

    await actor.type(testId(page, 'connect-identity-input'), identity);
    await actor.type(testId(page, 'connect-password-input'), PASSWORD, {
        delay: 35
    });
    await actor.type(testId(page, 'connect-confirm-password-input'), PASSWORD, {
        delay: 35
    });
    await actor.click(testId(page, 'connect-button'));
};

// Instant sign-up, for accounts created outside a recording. Without an
// invite this is the first account of an empty server (bootstrap).
export const quickSignUp = async (page, identity, invite) => {
    await page.goto(invite ? `${BASE_URL}/?invite=${invite}` : BASE_URL);

    if (!invite) await testId(page, 'connect-sign-up-tab').click();

    await testId(page, 'connect-identity-input').fill(identity);
    await testId(page, 'connect-password-input').fill(PASSWORD);
    await testId(page, 'connect-confirm-password-input').fill(PASSWORD);
    // Enter, not the button: it stays disabled without an invite code,
    // which the bootstrap account does not have
    await page.keyboard.press('Enter');
    await waitForApp(page);
};

// Waits until the server view is up (the sidebar's own controls rendered).
export const waitForApp = (page) =>
    page.getByRole('button', { name: 'User settings' }).waitFor();

export const signIn = async (page, identity) => {
    await page.goto(BASE_URL);
    await testId(page, 'connect-identity-input').fill(identity);
    await testId(page, 'connect-password-input').fill(PASSWORD);
    await page.keyboard.press('Enter');
    await waitForApp(page);
};

// Icon-only buttons carry no accessible name: address them by their lucide
// icon (lucide-react renders <svg class="lucide lucide-video-off">).
export const iconButton = (scope, icon) =>
    scope.locator(`button:has(svg.lucide-${icon})`);

// The switch of a labelled settings row ("Manage channels" + description on
// the left, switch on the right).
export const switchFor = (scope, label) =>
    scope
        .getByText(label, { exact: true })
        .locator(
            'xpath=ancestor::*[.//button[@role="switch"]][1]//button[@role="switch"]'
        );

export const activePanel = (page) =>
    page.locator('[role=tabpanel][data-state=active]');

// What a screen share shows. Headless chromium has no screen to capture, so
// getDisplayMedia hands out a canvas drawn to look like a desktop: wallpaper,
// a taskbar and a terminal window that keeps printing.
const SCREEN_SHARE_SCRIPT = () => {
    const lines = [
        '$ docker compose up -d',
        ' ✔ Container caddy   Started',
        ' ✔ Container caesar  Started',
        '$ curl -s https://localhost/healthz',
        '{"status":"ok"}',
        '$ _'
    ];

    navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas');

        canvas.width = 1280;
        canvas.height = 720;

        const ctx = canvas.getContext('2d');
        const startedAt = performance.now();

        const draw = () => {
            const elapsed = (performance.now() - startedAt) / 1000;
            const wallpaper = ctx.createLinearGradient(0, 0, 1280, 720);

            wallpaper.addColorStop(0, '#4c1d95');
            wallpaper.addColorStop(1, '#0e7490');
            ctx.fillStyle = wallpaper;
            ctx.fillRect(0, 0, 1280, 720);

            // taskbar
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(0, 672, 1280, 48);
            ['#38bdf8', '#f472b6', '#facc15', '#4ade80'].forEach((color, i) => {
                ctx.fillStyle = color;
                ctx.fillRect(24 + i * 52, 682, 28, 28);
            });

            // terminal window
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(150, 80, 980, 520);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(150, 80, 980, 44);
            ['#ef4444', '#f59e0b', '#22c55e'].forEach((color, i) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(178 + i * 26, 102, 8, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.font = '28px monospace';
            // one more line every 0.6s
            lines.slice(0, 1 + Math.floor(elapsed / 0.6)).forEach((line, i) => {
                ctx.fillStyle = line.startsWith('$') ? '#e2e8f0' : '#4ade80';
                ctx.fillText(line, 186, 180 + i * 50);
            });
        };

        draw();
        setInterval(draw, 100);

        return canvas.captureStream(15);
    };
};

// One browser per user. The fake media flags give each a silent beeping
// microphone, so voice channels connect without real devices.
export const openSession = async () => {
    const browser = await chromium.launch({
        args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream'
        ]
    });
    const context = await browser.newContext({
        viewport: VIEWPORT,
        colorScheme: 'dark',
        locale: 'en-GB',
        timezoneId: 'Europe/Lisbon'
    });

    context.setDefaultTimeout(15_000);
    // the invite table's copy button writes the link to the clipboard
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await installCursor(context);
    await context.addInitScript(SCREEN_SHARE_SCRIPT);

    const page = await context.newPage();

    return { browser, page, actor: createActor(page), close: () => browser.close() };
};

// Records the page from start() until save(): frames come straight from
// the compositor (sharper than Playwright's webm video) and only between
// those two calls, so sign-in and other preparation stay out of the GIF.
export const startRecording = async (page, name) => {
    const dir = path.join(WORK_DIR, name);
    const frames = [];
    const writes = [];

    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });

    let current;

    const capture = async (target) => {
        if (current) await current.screencast.stop();

        current = target;
        await target.screencast.start({
            size: VIEWPORT,
            quality: 95,
            onFrame: ({ data }) => {
                const file = `f${String(frames.length).padStart(5, '0')}.jpg`;

                frames.push({ file, at: performance.now() });
                writes.push(fs.writeFile(path.join(dir, file), data));
            }
        });
    };

    await capture(page);

    return {
        // cuts to another user's page; the GIF continues there
        switchTo: capture,

        // holdMs: how long the last frame stays before the GIF loops
        save: async ({ holdMs = 1800 } = {}) => {
            const endedAt = performance.now();

            await current.screencast.stop();
            await Promise.all(writes);

            if (frames.length === 0) throw new Error(`${name}: no frames`);

            // Frames only arrive when the page repaints, so each one lasts
            // until the next: a concat list with explicit durations.
            const list = frames.flatMap(({ file, at }, i) => {
                const next = frames[i + 1]?.at ?? endedAt + holdMs;

                return [
                    `file '${file}'`,
                    `duration ${((next - at) / 1000).toFixed(3)}`
                ];
            });

            // the concat demuxer ignores the last duration unless the
            // file is listed once more
            list.push(`file '${frames.at(-1).file}'`);
            await fs.writeFile(path.join(dir, 'frames.txt'), list.join('\n'));

            const out = path.join(OUT_DIR, `${name}.gif`);

            await fs.mkdir(OUT_DIR, { recursive: true });
            await run('ffmpeg', [
                '-v', 'error', '-y',
                '-f', 'concat', '-i', path.join(dir, 'frames.txt'),
                '-vf',
                `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];` +
                    '[a]palettegen=stats_mode=diff[p];' +
                    '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
                out
            ]);

            const { size } = await fs.stat(out);
            const seconds = (endedAt + holdMs - frames[0].at) / 1000;

            console.log(
                `  ${path.basename(out)}: ${seconds.toFixed(1)}s, ${(size / 1e6).toFixed(1)} MB`
            );
        }
    };
};

// Avatars, generated so no binary assets live in the repo.
export const makeAvatars = async (users) => {
    await fs.mkdir(WORK_DIR, { recursive: true });

    for (const { identity, colors } of users) {
        const [c0, c1] = colors;

        await run('ffmpeg', [
            '-v', 'error', '-y', '-f', 'lavfi', '-i',
            `gradients=s=256x256:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=256:y1=256`,
            '-frames:v', '1', path.join(WORK_DIR, `${identity}.png`)
        ]);
    }
};

export const avatarOf = (identity) => path.join(WORK_DIR, `${identity}.png`);
