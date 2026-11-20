// The owner edits their profile, creates a coloured "Senator" role in the
// server settings, then promotes Brutus to it from the moderation view.
import { MEMBERS, OWNER, TEXT_CHANNEL } from '../cast.mjs';
import {
    activePanel,
    iconButton,
    signIn,
    startRecording,
    switchFor
} from '../lib.mjs';

// Tyrian purple, the stripe on a senator's toga
const SENATOR_COLOR = '#c026d3';

export default async ({ name, open }) => {
    const [brutus] = MEMBERS;
    const { page, actor } = await open();
    const panel = activePanel(page);

    await signIn(page, OWNER.identity);
    await page.getByRole('button', { name: TEXT_CHANNEL }).click();
    await page.locator('main').getByText('Would not miss it.').waitFor();

    const recording = await startRecording(page, name);

    await actor.pause(500);

    // user settings: devices, then profile
    await actor.click(page.getByRole('button', { name: 'User settings' }));
    await actor.pause(600);
    await actor.click(page.getByRole('tab', { name: 'Profile' }));
    await actor.type(
        panel.getByPlaceholder('Tell us about yourself...'),
        'Dictator perpetuo. Veni, vidi, vici.',
        { delay: 40 }
    );
    await actor.click(panel.getByRole('button', { name: 'Save Changes' }));
    await actor.pause(500);
    await actor.click(iconButton(page, 'chevron-left'));

    // server settings: a role with a colour and a few permissions
    await actor.click(page.getByRole('button', { name: 'Server settings' }));
    await actor.pause(400);
    await actor.click(page.getByRole('tab', { name: 'Roles' }));
    await actor.click(iconButton(panel, 'plus'));

    const roleName = panel.getByRole('textbox', { name: 'Role Name' });

    await actor.click(roleName);
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Senator', { delay: 55 });

    // the hex field next to the colour swatch
    await actor.click(
        panel
            .getByRole('textbox', { name: 'Role Color' })
            .locator('xpath=following::input[1]')
    );
    await page.keyboard.press('Control+A');
    await page.keyboard.type(SENATOR_COLOR, { delay: 55 });

    for (const permission of ['Send messages', 'Upload files']) {
        await actor.click(switchFor(panel, permission), { after: 150 });
    }

    const saveRole = panel.getByRole('button', { name: 'Save Role' });

    await actor.scrollTo(saveRole);
    await actor.click(saveRole);
    await actor.pause(400);
    await actor.click(iconButton(page, 'chevron-left'));

    // promotion: member card -> moderation view -> assign the new role
    await actor.click(page.getByText(brutus.identity, { exact: true }).last());
    await actor.click(page.getByRole('button', { name: 'Moderation View' }));
    await actor.pause(900);
    await actor.click(page.getByRole('button', { name: 'Assign Role' }));

    const dialog = page.getByRole('alertdialog', { name: /^Assign role/ });

    await actor.click(dialog.getByRole('combobox'));
    await actor.click(page.getByRole('option', { name: 'Senator' }));
    await actor.click(dialog.getByRole('button', { name: 'Assign Role' }));
    await actor.pause(1200);

    await recording.save();
};
