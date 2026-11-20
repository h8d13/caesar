// The main loop of the app from the owner's seat: chat, join a voice
// channel two members already sit in, share the screen and drag a member
// into another channel.
import {
    MEMBERS,
    OWNER,
    SECOND_VOICE_CHANNEL,
    TEXT_CHANNEL,
    VOICE_CHANNEL
} from '../cast.mjs';
import {
    iconButton,
    signIn,
    sleep,
    startRecording
} from '../lib.mjs';

export default async ({ name, open }) => {
    const [brutus, cassius] = MEMBERS;
    const others = {};

    // both members already sit in the voice channel
    for (const { identity } of MEMBERS) {
        const session = await open();

        await signIn(session.page, identity);
        await session.page
            .getByRole('button', { name: VOICE_CHANNEL })
            .click({ force: true });
        await session.page.getByRole('button', { name: 'Disconnect' }).waitFor();
        others[identity] = session;
    }

    const { page, actor } = await open();

    await signIn(page, OWNER.identity);
    await page.getByRole('button', { name: TEXT_CHANNEL }).click();
    await page.locator('main').getByText('Would not miss it.').waitFor();

    const recording = await startRecording(page, name);

    await actor.pause(700);

    // brutus writes from the voice channel's neighbour, the text channel
    const theirs = others[brutus.identity].page;

    await theirs.getByRole('button', { name: TEXT_CHANNEL }).click({ force: true });
    await theirs.locator('main [contenteditable=true]').click();
    await theirs.keyboard.type('We are in voice, Caesar. Join us!', { delay: 45 });
    await sleep(300);
    await theirs.keyboard.press('Control+Enter');
    await actor.pause(800);

    await actor.type(page.locator('main [contenteditable=true]'), 'On my way :rocket');
    await actor.press('Enter');
    await actor.click(page.getByRole('button', { name: 'Send' }));
    await actor.pause(500);

    // voice: join, then share the screen
    await actor.click(page.getByRole('button', { name: VOICE_CHANNEL }));
    await actor.pause(1800);
    await actor.click(iconButton(page, 'monitor-off'));
    await actor.pause(4200);

    // moving a member: drag them onto another voice channel
    await actor.drag(
        page.getByRole('button', { name: cassius.identity }).first(),
        page.getByRole('button', { name: SECOND_VOICE_CHANNEL })
    );
    await actor.pause(1200);

    await recording.save();
};
