import { users } from '@caesar/shared/db/schema';
import { eq, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '..';

type TInviteTreeDirection = 'up' | 'down';

type TInviteTreeNode = {
  id: number;
  name: string;
  identity: string;
  invitedBy: number | null;
  inviteCode: string | null;
  depth: number;
};

type TInviteLink = {
  invitedBy: { id: number; name: string } | null;
  inviteCode: string | null;
};

const inviters = alias(users, 'inviters');

const getInviteLink = async (userId: number): Promise<TInviteLink> => {
  const row = await db
    .select({
      inviteCode: users.inviteCode,
      inviterId: inviters.id,
      inviterName: inviters.name
    })
    .from(users)
    .leftJoin(inviters, eq(inviters.id, users.invitedBy))
    .where(eq(users.id, userId))
    .get();

  return {
    invitedBy:
      row?.inviterId != null
        ? { id: row.inviterId, name: row.inviterName! }
        : null,
    inviteCode: row?.inviteCode ?? null
  };
};

// Recursive CTE bodies yielding (id, depth). 'up' follows invited_by
// towards genesis, 'down' collects everyone that came in through the
// user's branch. Raw column names: the step aliases users as u, which
// ${users.id} can't express.
const walks: Record<
  TInviteTreeDirection,
  (userId: number, maxDepth: number) => SQL
> = {
  up: (userId, maxDepth) => sql`
    SELECT invited_by, 1 FROM users
    WHERE id = ${userId} AND invited_by IS NOT NULL
    UNION ALL
    SELECT u.invited_by, tree.depth + 1 FROM users u
    JOIN tree ON u.id = tree.id
    WHERE u.invited_by IS NOT NULL AND tree.depth < ${maxDepth}`,
  down: (userId, maxDepth) => sql`
    SELECT id, 1 FROM users WHERE invited_by = ${userId}
    UNION ALL
    SELECT u.id, tree.depth + 1 FROM users u
    JOIN tree ON u.invited_by = tree.id
    WHERE tree.depth < ${maxDepth}`
};

// maxDepth bounds the walk: invited_by is set once at signup and only ever
// points at an older user, so no cycles, but a deep chain stays capped.
const getInviteTree = async (
  userId: number,
  direction: TInviteTreeDirection,
  maxDepth: number
): Promise<TInviteTreeNode[]> =>
  db.all<TInviteTreeNode>(sql`
    WITH RECURSIVE tree(id, depth) AS (${walks[direction](userId, maxDepth)})
    SELECT users.id, users.name, users.identity,
      users.invited_by AS invitedBy, users.invite_code AS inviteCode,
      tree.depth
    FROM tree JOIN users ON users.id = tree.id
    ORDER BY tree.depth, users.id
  `);

export { getInviteLink, getInviteTree };
