import { t } from '@server/utils/trpc';
import { deleteFileRoute } from './delete-file';
import { deleteTemporaryFileRoute } from './delete-temporary-file';

export const filesRouter = t.router({
  delete: deleteFileRoute,
  deleteTemporary: deleteTemporaryFileRoute
});
