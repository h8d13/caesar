// Records the readme previews: prepares a small demo server through the UI,
// then plays each scenario in scenarios/ and writes one GIF per scenario.
// Started by entry.sh inside the previews container; see record.sh.
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    MEMBERS,
    NEWCOMER,
    OWNER,
    SECOND_VOICE_CHANNEL,
    TEXT_CHANNEL
} from './cast.mjs';
import {
    activePanel,
    avatarOf,
    BASE_URL,
    DEBUG,
    iconButton,
    makeAvatars,
    openSession,
    OUT_DIR,
    quickSignUp,
    sleep
} from './lib.mjs';

const SCENARIOS = ['signup', 'settings', 'features', 'plot'];

const waitForServer = async () => {
    for (let i = 0; i < 120; i++) {
        const ok = await fetch(`${BASE_URL}/info`)
            .then((response) => response.ok)
            .catch(() => false);

        if (ok) return;
        await sleep(500);
    }

    throw new Error('The dev server did not come up within 60s');
};

const setAvatar = async (page, identity) => {
    await page.getByRole('button', { name: 'User settings' }).click();
    await page.getByRole('tab', { name: 'Profile' }).click();

    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        // force: an upload hint fades in over the avatar on hover
        activePanel(page)
            .locator('[data-slot=avatar]')
            .first()
            .click({ force: true })
    ]);

    await chooser.setFiles(avatarOf(identity));
    await page.getByText('Avatar updated successfully!').waitFor();
    await page.keyboard.press('Escape');
};

const sendMessage = async (page, text) => {
    await page.getByRole('button', { name: TEXT_CHANNEL }).click({ force: true });

    const editor = page.locator('main [contenteditable=true]');

    await editor.click();
    await editor.pressSequentially(text);
    await page.keyboard.press('Control+Enter');
    // delivered, not merely typed: the text also sits in the editor until
    // the message is sent
    await page
        .locator('main')
        .getByText(text)
        .and(page.locator(':not([contenteditable] *)'))
        .waitFor();
};

// Everything the scenarios assume is already there: an owner, two members
// with avatars, a second voice channel and a little chat history.
const setup = async () => {
    const owner = await openSession();

    // The first load makes vite optimize dependencies and reload the page;
    // let that settle before touching the form.
    await owner.page.goto(BASE_URL);
    await owner.page.getByTestId('connect-button').waitFor();
    await sleep(1500);

    await quickSignUp(owner.page, OWNER.identity);
    // the token the dev server prints on first start (db/seed.ts)
    await owner.page.evaluate(() => window.useToken('dev'));
    await owner.page.getByRole('button', { name: 'Server settings' }).waitFor();

    const page = owner.page;

    await page.getByRole('button', { name: 'Server settings' }).click();
    await page
        .getByRole('textbox', { name: 'Enter server description' })
        .fill('Voice, video and text. Self-hosted, invite only.');
    await activePanel(page).getByRole('button', { name: 'Save Changes' }).click();

    await page.getByRole('tab', { name: 'Invites' }).click();
    await activePanel(page).getByRole('button', { name: 'Create Invite' }).click();
    await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Create Invite' })
        .click();

    const invite = (
        await activePanel(page).locator('code').first().textContent()
    ).trim();

    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Create channel' }).nth(1).click();

    const dialog = page.getByRole('dialog');

    await dialog.getByText('Voice Channel', { exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Channel name' }).fill(SECOND_VOICE_CHANNEL);
    await dialog.getByRole('button', { name: 'Create channel' }).click();
    await page.getByRole('button', { name: SECOND_VOICE_CHANNEL }).waitFor();

    await setAvatar(page, OWNER.identity);

    // 44 BC, a few days before the Ides of March
    const chat = [
        ['caesar', 'The Senate meets on the Ides, at the Theatre of Pompey.'],
        ['brutus', 'We will all be there, Caesar.'],
        ['cassius', 'Would not miss it.']
    ];

    const sessions = { [OWNER.identity]: owner };

    for (const { identity } of MEMBERS) {
        const session = await openSession();

        await quickSignUp(session.page, identity, invite);
        await setAvatar(session.page, identity);
        sessions[identity] = session;
    }

    for (const [identity, text] of chat) {
        await sendMessage(sessions[identity].page, text);
    }

    // The members are in: drop the invite they used, so the one created
    // on camera in the signup scenario is the only one listed.
    await page.getByRole('button', { name: 'Server settings' }).click();
    await page.getByRole('tab', { name: 'Invites' }).click();
    await iconButton(activePanel(page), 'ellipsis-vertical').first().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Delete' })
        .click();
    await activePanel(page).getByText('No invites found').waitFor();

    await Promise.all(Object.values(sessions).map((session) => session.close()));
};

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !SCENARIOS.includes(name));

if (unknown.length > 0) {
    console.error(`Unknown scenario: ${unknown.join(', ')}. Have: ${SCENARIOS.join(', ')}`);
    process.exit(2);
}

const names = requested.length > 0 ? requested : SCENARIOS;

await waitForServer();
await makeAvatars([OWNER, ...MEMBERS, NEWCOMER]);

console.log('Preparing the demo server...');

await setup().catch((error) => {
    console.error(`Preparing the demo server FAILED: ${error.message}`);
    process.exit(1);
});
let failed = false;

for (const name of names) {
    console.log(`Recording ${name}...`);

    const { default: scenario } = await import(`./scenarios/${name}.mjs`);
    // every session a scenario opens, so a failure can be screenshotted
    // and nothing is left running
    const sessions = [];
    const open = async (options) => {
        const session = await openSession(options);

        sessions.push(session);

        return session;
    };

    try {
        await scenario({ name, open });
    } catch (error) {
        failed = true;
        console.error(`  FAILED: ${error.message}`);

        if (DEBUG) {
            const dir = path.join(OUT_DIR, 'debug');

            await fs.mkdir(dir, { recursive: true });
            await Promise.all(
                sessions.map(({ page }, i) =>
                    page
                        .screenshot({ path: path.join(dir, `${name}-${i}.png`) })
                        .catch(() => {})
                )
            );
            console.error(`  screenshots: .github/previews/debug/${name}-*.png`);
        }
    }

    await Promise.all(sessions.map((session) => session.close().catch(() => {})));
}

process.exit(failed ? 1 : 0);
