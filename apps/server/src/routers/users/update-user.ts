import { DELETED_USER_IDENTITY_AND_NAME } from '@caesar/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@server/db';
import { publishUser } from '@server/db/publishers';
import { users } from '@server/db/schema';
import { protectedProcedure } from '@server/utils/trpc';

const updateUserRoute = protectedProcedure
  .input(
    z.object({
      name: z
        .string()
        .min(1)
        .max(24)
        .refine((val) => val !== DELETED_USER_IDENTITY_AND_NAME, {
          message: 'Protected username'
        }),
      bannerColor: z
        .string()
        .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color'),
      bio: z.string().max(160).optional(),
      birthday: z
        .string()
        .regex(
          /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
          'Use YYYY-MM-DD format'
        )
        .nullable()
        .optional()
    })
  )
  .mutation(async ({ ctx, input }) => {
    const updatedUser = await db
      .update(users)
      .set({
        name: input.name,
        bannerColor: input.bannerColor,
        bio: input.bio ?? null,
        birthday: input.birthday ?? null
      })
      .where(eq(users.id, ctx.userId))
      .returning()
      .get();

    publishUser(updatedUser.id, 'update');
  });

export { updateUserRoute };
