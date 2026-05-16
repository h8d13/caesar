import { t } from '@server/utils/trpc';
import { addEmojiRoute } from './add-emoji';
import { deleteEmojiRoute } from './delete-emoji';
import {
  onEmojiCreateRoute,
  onEmojiDeleteRoute,
  onEmojiUpdateRoute
} from './events';
import { getEmojisRoute } from './get-emojis';
import { updateEmojiRoute } from './update-emoji';

export const emojisRouter = t.router({
  add: addEmojiRoute,
  update: updateEmojiRoute,
  delete: deleteEmojiRoute,
  getAll: getEmojisRoute,
  onCreate: onEmojiCreateRoute,
  onDelete: onEmojiDeleteRoute,
  onUpdate: onEmojiUpdateRoute
});
