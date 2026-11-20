// The main loop of the app from the owner's seat: a markdown message with
// a code block, a GIF, then a voice channel two members already sit in,
// a screen share and dragging a member into another channel.
//
// The GIF comes live from GIPHY (needs network), so its picture is whatever
// the search returns that day.
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

const AGENDA = [
    '- Senate meets at noon',
    '- Bodyguards not needed',
    '```js',
    'const ides = new Date(-44, 2, 15);',
    'if (today >= ides) beware();',
    '```'
];

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

    // markdown in, formatted message out: a list and a highlighted code
    // block (the composer takes the markdown literally)
    await actor.click(page.locator('main [contenteditable=true]'), { after: 120 });

    for (const line of AGENDA) {
        await page.keyboard.type(line, { delay: 22 });
        await page.keyboard.press('Enter');
    }

    await actor.click(page.getByRole('button', { name: 'Send' }));
    await actor.pause(1500);

    // a GIF from the picker's GIPHY tab; picking one sends it
    const picker = page.getByRole('dialog').filter({ hasText: 'GIFs' });

    // last: every message's Add Reaction button has the same icon
    await actor.click(iconButton(page.locator('main'), 'smile').last());
    await actor.click(picker.getByRole('tab', { name: 'GIFs' }));
    await actor.type(picker.getByRole('textbox'), 'cat');
    await actor.click(picker.getByRole('tabpanel').getByRole('button').first());
    // the picture loads after the message lands, below the fold
    await actor.scrollTo(page.locator('main img[src*="giphy"]').last());
    await actor.pause(2200);

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
