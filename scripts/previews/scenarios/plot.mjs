// Direct messages and activities, from Brutus's seat: an end-to-end
// encrypted conversation with Cassius, then the shared whiteboard and the
// casino.
import { MEMBERS, TEXT_CHANNEL } from '../cast.mjs';
import { iconButton, signIn, sleep, startRecording } from '../lib.mjs';

export default async ({ name, open }) => {
    const [brutus, cassius] = MEMBERS;

    const other = await open();

    await signIn(other.page, cassius.identity);
    await other.page
        .getByRole('button', { name: 'Direct Messages' })
        .click({ force: true });

    const { page, actor } = await open();

    await signIn(page, brutus.identity);
    await page.getByRole('button', { name: TEXT_CHANNEL }).click({ force: true });
    await page.locator('main').getByText('Would not miss it.').waitFor();

    const recording = await startRecording(page, name);

    await actor.pause(600);

    // a new conversation, switched to end-to-end encrypted messages
    await actor.click(page.getByRole('button', { name: 'Direct Messages' }));
    await actor.click(page.getByRole('button', { name: 'Start new conversation' }));
    await actor.click(page.getByRole('menuitem', { name: cassius.identity }));
    await actor.click(page.getByRole('button', { name: 'Normal DMs' }));
    await page.getByText('End-to-end encrypted').waitFor();
    await actor.pause(500);

    const editor = page.locator('main [contenteditable=true]');

    await actor.type(editor, 'Dictator for life, he says. It has to be the Ides.', {
        delay: 40
    });
    await actor.click(page.getByRole('button', { name: 'Send' }));

    // Cassius answers from his own browser
    const theirs = other.page;

    await theirs.getByRole('button', { name: brutus.identity }).first().click();
    await theirs.locator('main [contenteditable=true]').click();
    await theirs.keyboard.type('Agreed. Theatre of Pompey. Bring a :dagger', {
        delay: 40
    });
    await sleep(400);
    // picks the emoji suggestion, then sends
    await theirs.keyboard.press('Enter');
    await theirs.keyboard.press('Control+Enter');
    await actor.pause(1500);

    // activities: the Ides (XV) on the whiteboard
    await actor.click(page.getByRole('button', { name: 'Activities' }));
    await actor.click(page.getByRole('menuitem', { name: 'Whiteboard' }));
    await actor.click(page.getByRole('button', { name: 'Pen', exact: true }));
    await actor.stroke([[520, 280], [600, 400]]);
    await actor.stroke([[600, 280], [520, 400]]);
    await actor.stroke([[640, 280], [690, 400], [740, 280]]);
    await actor.pause(900);
    await actor.click(iconButton(page, 'chevron-left'));

    // activities: the casino
    await actor.click(page.getByRole('button', { name: 'Activities' }));
    await actor.click(page.getByRole('menuitem', { name: 'Casino' }));
    await actor.pause(4000);

    await recording.save();
};
