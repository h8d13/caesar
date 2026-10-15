import { sql, type SQL } from 'drizzle-orm';
import { db } from '..';

type TInviteTreeDirection = 'up' | 'down';

// Ids only: the client resolves names/avatars from its user store.
// identity is redacted per caller by the route.
type TInviteTreeNode = {
  id: number;
  identity: string;
  invitedBy: number | null;
  depth: number;
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
    SELECT users.id, users.identity, users.invited_by AS invitedBy,
      tree.depth
    FROM tree JOIN users ON users.id = tree.id
    ORDER BY tree.depth, users.id
  `);

export { getInviteTree };
