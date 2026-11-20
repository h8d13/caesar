// The owner creates an invite and copies its link; a newcomer opens that
// link, creates an account and says hello.
import { NEWCOMER, OWNER, TEXT_CHANNEL } from '../cast.mjs';
import {
    activePanel,
    iconButton,
    signIn,
    signUp,
    startRecording,
    waitForApp
} from '../lib.mjs';

export default async ({ name, open }) => {
    const owner = await open();
    const newcomer = await open();

    await signIn(owner.page, OWNER.identity);
    await owner.page.getByRole('button', { name: TEXT_CHANNEL }).click();
    await owner.page.locator('main').getByText('Would not miss it.').waitFor();

    const recording = await startRecording(owner.page, name);

    // the owner's side: server settings -> invites -> create, copy the link
    {
        const { page, actor } = owner;
        const panel = activePanel(page);

        await actor.pause(500);
        await actor.click(page.getByRole('button', { name: 'Server settings' }));
        await actor.click(page.getByRole('tab', { name: 'Invites' }));
        await actor.click(panel.getByRole('button', { name: 'Create Invite' }));
        await actor.pause(400);
        await actor.click(
            page.getByRole('dialog').getByRole('button', { name: 'Create Invite' })
        );
        await actor.click(iconButton(panel, 'copy').first());
        await page.getByText('Invite code copied to clipboard').waitFor();
    }

    const link = await owner.page.evaluate(() => navigator.clipboard.readText());

    // the newcomer's side: the link lands on Sign up with the code filled in
    const { page, actor } = newcomer;

    await page.goto(link);
    await page.getByTestId('connect-button').waitFor();
    await owner.actor.pause(600);
    await recording.switchTo(page);

    await actor.pause(900);
    await signUp(actor, NEWCOMER.identity);
    await waitForApp(page);
    await actor.pause(900);

    await actor.click(page.getByRole('button', { name: TEXT_CHANNEL }));
    await actor.type(
        page.locator('main [contenteditable=true]'),
        'Ave Caesar! Thanks for the invite :wave'
    );
    // picks the emoji suggestion
    await actor.press('Enter');
    await actor.click(page.getByRole('button', { name: 'Send' }));
    await actor.pause(600);

    await recording.save();
};
