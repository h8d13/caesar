// A roulette round with many winners, from the owner's seat: lightning
// numbers left of the wheel, the winners list right of it.
//
// Layout check rather than a readme preview. The server takes 15 single
// bets per betting phase from one address, so the list is built up over a
// few rounds off camera: every player covers all twelve outside bets with
// Auto on, which re-places them each round in one request and wins five of
// them on anything but zero. On camera the players add bets that are known
// to win: the scenario reads the round's number from the server's database
// (the previews container runs both).
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MEMBERS, OWNER } from '../cast.mjs';
import { OUT_DIR, signIn, sleep, startRecording } from '../lib.mjs';

const DB_PATH = '/app/apps/server/data/db.sqlite';
const RED = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

// chip: a preset of the chip selector; extra: winning bets added on camera
// (14 in all, one short of the limit)
const PLAYERS = [
    { identity: OWNER.identity, chip: 100, extra: 5 },
    { identity: MEMBERS[0].identity, chip: 50, extra: 5 },
    { identity: MEMBERS[1].identity, chip: 25, extra: 4 }
];

const OUTSIDE_BETS = 12;

const openDb = () => {
    const db = new DatabaseSync(DB_PATH);

    // the server writes to it too
    db.exec('PRAGMA busy_timeout = 5000');

    return db;
};

// Nobody has social credit on a fresh server.
const fund = (db) => {
    const users = db.prepare('SELECT * FROM users').all();
    const insert = db.prepare(
        'INSERT INTO social_credit_ledger (target_id, ledgerable_type, amount, created_at) VALUES (?, ?, ?, ?)'
    );

    for (const { identity } of PLAYERS) {
        const user = users.find(
            (row) => row.identity === identity || row.name === identity
        );

        if (!user) throw new Error(`No user ${identity} in the database`);

        insert.run(user.id, 'preview', 50_000, Date.now());
    }
};

const latestRound = (db) =>
    db
        .prepare(
            'SELECT id, winning_number, lightning_numbers, started_at, ended_at FROM roulette_rounds ORDER BY id DESC LIMIT 1'
        )
        .get();

// The next betting phase to open, as soon as it does. `wanted` skips
// rounds: each one lasts 26 seconds.
const waitForRound = async (db, wanted = () => true) => {
    let seen = latestRound(db)?.id ?? 0;

    for (let i = 0; i < 3000; i++) {
        const round = latestRound(db);

        if (round && round.id !== seen) {
            if (wanted(round)) return round;
            seen = round.id;
        }

        await sleep(100);
    }

    throw new Error('No suitable roulette round within 5 minutes');
};

const button = (page, name) =>
    page.getByRole('button', { name, exact: true });

// All twelve outside bets, as board buttons.
const outsideCells = (page) => [
    ...[0, 1, 2].map((row) => button(page, '← 3:1').nth(row)),
    ...['1st', '2nd', '3rd', '1-18', 'EVEN', 'RED', 'BLACK', 'ODD', '19-36'].map(
        (label) => button(page, label)
    )
];

// The outside bets that win on `n`, as board buttons.
const winningCells = (page, n) => [
    // the three column buttons share a label; top row is column 3
    button(page, '← 3:1').nth(n % 3 === 0 ? 0 : n % 3 === 2 ? 1 : 2),
    button(page, n <= 12 ? '1st' : n <= 24 ? '2nd' : '3rd'),
    button(page, RED.has(n) ? 'RED' : 'BLACK'),
    button(page, n % 2 === 0 ? 'EVEN' : 'ODD'),
    button(page, n <= 18 ? '1-18' : '19-36')
];

export default async ({ name, open }) => {
    const db = openDb();

    fund(db);

    const seats = [];

    for (const player of PLAYERS) {
        const session = await open();
        const { page } = session;

        await signIn(page, player.identity);
        await page.getByRole('button', { name: 'Activities' }).click();
        await page.getByRole('menuitem', { name: 'Casino' }).click();
        // first: crash and coinflip have chips and an Auto of their own
        await button(page, String(player.chip)).first().click();
        await button(page, 'Auto').first().click();
        seats.push({ ...player, ...session });
    }

    // one player per round: twelve single bets, under the limit of 15
    for (const seat of seats) {
        await waitForRound(db);

        for (const cell of outsideCells(seat.page)) await cell.click();

        await seat.page
            .getByText(`Clear All Bets (${OUTSIDE_BETS})`)
            .waitFor();
    }

    const [owner, ...others] = seats;
    const { page, actor } = owner;

    // not zero (every outside bet loses) and with lightning numbers to show
    const round = await waitForRound(
        db,
        ({ winning_number, lightning_numbers }) =>
            winning_number !== 0 && JSON.parse(lightning_numbers).length > 0
    );

    db.close();

    const recording = await startRecording(page, name);

    // Auto has re-placed everyone's twelve by now
    await page.getByText(`Bets (${OUTSIDE_BETS * seats.length})`).waitFor();

    const addWinningBets = async (seat, click) => {
        const cells = winningCells(seat.page, round.winning_number);

        for (const cell of cells.slice(0, seat.extra)) await click(cell);
    };

    await Promise.all([
        addWinningBets(owner, (cell) => actor.click(cell, { after: 150 })),
        ...others.map((seat) =>
            addWinningBets(seat, async (cell) => {
                await cell.click();
                await sleep(250);
            })
        )
    ]);

    // out of the way of the wheel row
    await actor.moveToPoint(640, 660);

    // betting ends, the wheel spins, then every winning bet is listed
    await page.getByText(/^\+\d+ SC$/).first().waitFor({ timeout: 40_000 });
    // the entries slide in one after the other
    await actor.pause(4300);
    await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
    await actor.pause(400);

    await recording.save();
};
