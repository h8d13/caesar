import {
  ChannelPermission,
  MESSAGE_MAX_LENGTH,
  Permission
} from '@caesar/shared';
import { messages, rolePermissions, settings } from '@caesar/shared/db/schema';
import { initTest, uploadFile } from '@server/__tests__/helpers';
import { tdb } from '@server/__tests__/setup';
import { setRateLimitingDisabled } from '@server/utils/rate-limiters';
import { and, eq } from 'drizzle-orm';
import { describe, expect, test } from 'vite-plus/test';

describe('messages router', () => {
  test('should throw when user lacks permissions (edit - not own message)', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    await caller1.messages.send({
      channelId: 1,
      content: 'Original message',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await expect(
      caller2.messages.edit({
        messageId,
        content: 'Edited message'
      })
    ).rejects.toThrow('You can only edit your own messages');
  });

  test('should throw when user lacks permissions (delete - not own message)', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    await caller1.messages.send({
      channelId: 1,
      content: 'Message to delete',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await expect(
      caller2.messages.delete({
        messageId
      })
    ).rejects.toThrow('You do not have permission to delete this message');
  });

  test('should throw when user lacks permissions (toggleReaction)', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    await caller1.messages.send({
      channelId: 1,
      content: 'Message to react to',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await expect(
      caller2.messages.toggleReaction({
        messageId,
        emoji: '👍'
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should send a new message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Test message content',
      files: []
    });

    const messages = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    expect(messages.messages).toBeDefined();
    expect(messages.messages.length).toBeGreaterThan(0);

    const sentMessage = messages.messages[0];

    expect(sentMessage!.content).toBe('Test message content');
    expect(sentMessage!.channelId).toBe(1);
    expect(sentMessage!.userId).toBe(1);
  });

  test('should get messages from channel', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 2,
      content: 'Message 1',
      files: []
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Message 2',
      files: []
    });

    await caller.messages.send({
      channelId: 2,
      content: 'Message 3',
      files: []
    });

    const result = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    expect(result.messages).toBeDefined();
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages.length).toBe(3);
  });

  test('should get pinned messages from channel', async () => {
    const { caller } = await initTest();

    const firstMessageId = await caller.messages.send({
      channelId: 1,
      content: 'Pinned message 1',
      files: []
    });

    const secondMessageId = await caller.messages.send({
      channelId: 1,
      content: 'Not pinned message',
      files: []
    });

    const thirdMessageId = await caller.messages.send({
      channelId: 1,
      content: 'Pinned message 2',
      files: []
    });

    await caller.messages.togglePin({ messageId: firstMessageId });
    await caller.messages.togglePin({ messageId: thirdMessageId });

    const pinnedMessages = await caller.messages.getPinned({ channelId: 1 });

    expect(Array.isArray(pinnedMessages)).toBe(true);
    expect(pinnedMessages.length).toBe(2);
    expect(pinnedMessages.every((message) => message.pinned)).toBe(true);
    expect(
      pinnedMessages.find((message) => message.id === secondMessageId)
    ).toBe(undefined);
  });

  test('should throw when user lacks channel permissions (getPinned)', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller2 } = await initTest(2);

    await caller1.channels.update({
      channelId: 1,
      name: 'General',
      topic: 'General text channel',
      private: true
    });

    await caller1.channels.updatePermissions({
      channelId: 1,
      roleId: 2,
      permissions: [ChannelPermission.SEND_MESSAGES]
    });

    await expect(
      caller2.messages.getPinned({
        channelId: 1
      })
    ).rejects.toThrow('Insufficient channel permissions');
  });

  test('should edit own message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Original content',
      files: []
    });

    const messagesBefore = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messagesBefore.messages[0]!.id;

    await caller.messages.edit({
      messageId,
      content: 'Edited content'
    });

    const messagesAfter = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const editedMessage = messagesAfter.messages.find(
      (m) => m.id === messageId
    );

    expect(editedMessage).toBeDefined();
    expect(editedMessage!.content).toBe('Edited content');
    expect(editedMessage!.editedAt).toBeDefined();
    expect(editedMessage!.editedAt).not.toBeNull();

    // updatedAt is server-side bookkeeping and no longer travels to the
    // client, so assert it on the row rather than on the response.
    const row = await tdb
      .select({ updatedAt: messages.updatedAt })
      .from(messages)
      .where(eq(messages.id, messageId))
      .get();

    expect(row?.updatedAt).not.toBeNull();
  });

  test('should not let an admin edit another user message', async () => {
    const { caller: caller2 } = await initTest(2);
    const { caller: caller1 } = await initTest(1);

    await caller2.messages.send({
      channelId: 1,
      content: 'User 2 message',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await expect(
      caller1.messages.edit({
        messageId,
        content: 'Edited by admin'
      })
    ).rejects.toThrow('You can only edit your own messages');

    const messagesAfter = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const message = messagesAfter.messages.find((m) => m.id === messageId);

    expect(message!.content).not.toContain('Edited by admin');
  });

  test('should delete own message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Message to delete',
      files: []
    });

    const messagesBefore = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messagesBefore.messages[0]!.id;
    const messageCountBefore = messagesBefore.messages.length;

    await caller.messages.delete({
      messageId
    });

    const messagesAfter = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    expect(
      messagesAfter.messages.find((m) => m.id === messageId)
    ).toBeUndefined();
    expect(messagesAfter.messages.length).toBe(messageCountBefore - 1);
  });

  test('should allow admin to delete any message', async () => {
    const { caller: caller2 } = await initTest(2);
    const { caller: caller1 } = await initTest(1);

    await caller2.messages.send({
      channelId: 1,
      content: 'User 2 message to delete',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await caller1.messages.delete({
      messageId
    });

    const messagesAfter = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    expect(
      messagesAfter.messages.find((m) => m.id === messageId)
    ).toBeUndefined();
  });

  test('should not let a non-owner moderator delete owner messages', async () => {
    const { caller: owner } = await initTest(1);
    const { caller: moderator } = await initTest(2);

    // user 2 moderates via their default role
    await tdb.insert(rolePermissions).values({
      roleId: 2,
      permission: Permission.MANAGE_MESSAGES,
      createdAt: Date.now()
    });

    await owner.messages.send({
      channelId: 1,
      content: 'Owner message',
      files: []
    });

    const { messages: before } = await owner.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = before[0]!.id;

    await expect(moderator.messages.delete({ messageId })).rejects.toThrow(
      'You cannot delete messages of the server owner.'
    );

    const { messages: after } = await owner.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    expect(after.find((m) => m.id === messageId)).toBeDefined();
  });

  test('should throw when editing non-existing message', async () => {
    const { caller } = await initTest();

    await expect(
      caller.messages.edit({
        messageId: 999999,
        content: 'Edited content'
      })
    ).rejects.toThrow('Message not found');
  });

  test('should throw when deleting non-existing message', async () => {
    const { caller } = await initTest();

    await expect(
      caller.messages.delete({
        messageId: 999999
      })
    ).rejects.toThrow('Message not found');
  });

  test('should not store a message when one of its files fails', async () => {
    const { caller, mockedToken } = await initTest();

    const response = await uploadFile(
      new File(['ok'], 'ok.txt', { type: 'text/plain' }),
      mockedToken
    );
    const { id: goodFileId } = (await response.json()) as { id: string };

    const before = await tdb.select().from(messages);

    await expect(
      caller.messages.send({
        channelId: 1,
        content: 'with files',
        files: [goodFileId, 'missing-temp-file']
      })
    ).rejects.toThrow();

    const after = await tdb.select().from(messages);

    expect(after).toHaveLength(before.length);
  });

  test('should reject messages over the max length', async () => {
    const { caller } = await initTest();

    await expect(
      caller.messages.send({
        channelId: 1,
        content: 'a'.repeat(MESSAGE_MAX_LENGTH + 1),
        files: []
      })
    ).rejects.toThrow();
  });

  test('should reject reactions that are not an emoji', async () => {
    const { caller } = await initTest();

    await caller.messages.send({ channelId: 1, content: 'react', files: [] });

    const page = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });
    const messageId = page.messages[0]!.id;

    await expect(
      caller.messages.toggleReaction({ messageId, emoji: 'not an emoji <b>' })
    ).rejects.toThrow('Unknown emoji');

    await expect(
      caller.messages.toggleReaction({ messageId, emoji: 'x'.repeat(65) })
    ).rejects.toThrow();

    await caller.messages.toggleReaction({ messageId, emoji: 'thumbsup' });
    await caller.messages.toggleReaction({ messageId, emoji: '👍🏽' });
  });

  test('should toggle reaction on message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Message to react to',
      files: []
    });

    const messages = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await caller.messages.toggleReaction({
      messageId,
      emoji: '👍'
    });

    const messagesAfterAdd = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageWithReaction = messagesAfterAdd.messages.find(
      (m) => m.id === messageId
    );

    expect(messageWithReaction!.reactions).toBeDefined();
    expect(messageWithReaction!.reactions.length).toBe(1);
    expect(messageWithReaction!.reactions[0]!.emoji).toBe('👍');
    expect(messageWithReaction!.reactions[0]!.userId).toBe(1);

    await caller.messages.toggleReaction({
      messageId,
      emoji: '👍'
    });

    const messagesAfterRemove = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageWithoutReaction = messagesAfterRemove.messages.find(
      (m) => m.id === messageId
    );

    expect(messageWithoutReaction!.reactions.length).toBe(0);
  });

  test('should allow multiple users to react to the same message', async () => {
    const { caller: caller1 } = await initTest(1);

    await caller1.messages.send({
      channelId: 1,
      content: 'Message for multiple reactions',
      files: []
    });

    const messages = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await caller1.messages.toggleReaction({
      messageId,
      emoji: '👍'
    });

    await caller1.messages.toggleReaction({
      messageId,
      emoji: '❤️'
    });

    const messagesAfter = await caller1.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageWithReactions = messagesAfter.messages.find(
      (m) => m.id === messageId
    );

    expect(messageWithReactions!.reactions.length).toBe(2);

    const emojis = messageWithReactions!.reactions.map((r) => r.emoji);

    expect(emojis).toContain('👍');
    expect(emojis).toContain('❤️');
  });

  test('should allow multiple different reactions on the same message', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Message for different reactions',
      files: []
    });

    const messages = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messages.messages[0]!.id;

    await caller.messages.toggleReaction({
      messageId,
      emoji: '👍'
    });

    await caller.messages.toggleReaction({
      messageId,
      emoji: '❤️'
    });

    await caller.messages.toggleReaction({
      messageId,
      emoji: '😂'
    });

    const messagesAfter = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageWithReactions = messagesAfter.messages.find(
      (m) => m.id === messageId
    );

    expect(messageWithReactions!.reactions.length).toBe(3);

    const emojis = messageWithReactions!.reactions.map((r) => r.emoji);

    expect(emojis).toContain('👍');
    expect(emojis).toContain('❤️');
    expect(emojis).toContain('😂');
  });

  test('should send multiple messages', async () => {
    const { caller } = await initTest();

    const messageCount = 5;
    const promises = [];

    for (let i = 0; i < messageCount; i++) {
      promises.push(
        caller.messages.send({
          channelId: 2,
          content: `Message ${i + 1}`,
          files: []
        })
      );
    }

    await Promise.all(promises);

    const messages = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    expect(messages.messages.length).toBe(messageCount);
  });

  test('should signal typing in channel', async () => {
    const { caller } = await initTest();

    await caller.messages.signalTyping({
      channelId: 1
    });
  });

  test('should throw when user lacks permissions (signalTyping)', async () => {
    const { caller } = await initTest(2);

    await tdb
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, 2),
          eq(rolePermissions.permission, Permission.SEND_MESSAGES)
        )
      );

    await expect(
      caller.messages.signalTyping({
        channelId: 1
      })
    ).rejects.toThrow('Insufficient permissions');
  });

  test('should paginate messages with cursor', async () => {
    const { caller } = await initTest();

    // send 10 messages
    for (let i = 0; i < 10; i++) {
      await caller.messages.send({
        channelId: 1,
        content: `Message ${i + 1}`,
        files: []
      });
    }

    // get first page
    const firstPage = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 5
    });

    expect(firstPage.messages.length).toBe(5);
    expect(firstPage.nextCursor).toBeDefined();
    expect(firstPage.nextCursor).not.toBeNull();

    // get second page
    const secondPage = await caller.messages.get({
      channelId: 1,
      cursor: firstPage.nextCursor,
      limit: 5
    });

    expect(secondPage.messages.length).toBeGreaterThan(0);

    // ensure no overlap between pages
    const firstPageIds = firstPage.messages.map((m) => m.id);
    const secondPageIds = new Set(secondPage.messages.map((m) => m.id));

    const intersection = firstPageIds.filter((id) => secondPageIds.has(id));

    expect(intersection.length).toBe(0);
  });

  test('should fetch all messages until targetMessageId plus 20 older', async () => {
    setRateLimitingDisabled(true);

    const { caller } = await initTest();

    const sentMessageIds: number[] = [];

    for (let i = 0; i < 10; i++) {
      const messageId = await caller.messages.send({
        channelId: 2,
        content: `Message ${i + 1}`,
        files: []
      });

      sentMessageIds.push(messageId);
    }

    // target the newest message should return all 10 + up to 20 older (0 exist)
    const newestId = sentMessageIds[9]!;

    const result = await caller.messages.get({
      channelId: 2,
      cursor: null,
      targetMessageId: newestId,
      limit: 1
    });

    // only the target itself + 0 newer + 9 older (capped by available)
    expect(result.messages.length).toBe(10);
    expect(result.nextCursor).toBeNull();
    expect(result.messages.some((message) => message.id === newestId)).toBe(
      true
    );

    // target the 3rd message (index 2) 7 newer + target + 2 older = 10
    const middleId = sentMessageIds[2]!;

    const result2 = await caller.messages.get({
      channelId: 2,
      cursor: null,
      targetMessageId: middleId,
      limit: 1
    });

    expect(result2.messages.length).toBe(10);
    expect(result2.messages.some((message) => message.id === middleId)).toBe(
      true
    );

    // target the oldest 9 newer + target + 0 older = 10
    const oldestId = sentMessageIds[0]!;

    const result3 = await caller.messages.get({
      channelId: 2,
      cursor: null,
      targetMessageId: oldestId,
      limit: 1
    });

    expect(result3.messages.length).toBe(10);
    expect(result3.messages.some((message) => message.id === oldestId)).toBe(
      true
    );

    setRateLimitingDisabled(false);
  });

  test('should throw when targetMessageId is not in channel', async () => {
    const { caller } = await initTest();

    const messageInChannelOne = await caller.messages.send({
      channelId: 1,
      content: 'Message in channel 1',
      files: []
    });

    await expect(
      caller.messages.get({
        channelId: 2,
        cursor: null,
        targetMessageId: messageInChannelOne,
        limit: 50
      })
    ).rejects.toThrow('Target message not found');
  });

  test('should return empty messages for empty channel', async () => {
    const { caller } = await initTest();

    const messages = await caller.messages.get({
      channelId: 2,
      cursor: null,
      limit: 50
    });

    expect(messages.messages).toBeDefined();
    expect(Array.isArray(messages.messages)).toBe(true);
    expect(messages.nextCursor).toBeNull();
  });

  test('should send message with empty files array', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Message without files',
      files: []
    });

    const messages = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const sentMessage = messages.messages[0];

    expect(sentMessage!.content).toBe('Message without files');
    expect(sentMessage!.files).toBeDefined();
    expect(sentMessage!.files.length).toBe(0);
  });

  test('should trim attached files to configured max files per message', async () => {
    const { caller, mockedToken } = await initTest();

    await tdb
      .update(settings)
      .set({
        storageMaxFilesPerMessage: 2
      })
      .execute();

    const file1 = new File(['file one'], 'one.txt', { type: 'text/plain' });
    const file2 = new File(['file two'], 'two.txt', { type: 'text/plain' });
    const file3 = new File(['file three'], 'three.txt', { type: 'text/plain' });

    const response1 = await uploadFile(file1, mockedToken);
    const response2 = await uploadFile(file2, mockedToken);
    const response3 = await uploadFile(file3, mockedToken);

    const temp1 = (await response1.json()) as { id: string };
    const temp2 = (await response2.json()) as { id: string };
    const temp3 = (await response3.json()) as { id: string };

    const messageId = await caller.messages.send({
      channelId: 1,
      content: 'Message with limited attachments',
      files: [temp1.id, temp2.id, temp3.id]
    });

    const messages = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const sentMessage = messages.messages.find((m) => m.id === messageId);

    expect(sentMessage).toBeDefined();
    expect(sentMessage!.files.length).toBe(2);

    const names = sentMessage!.files.map((f) => f.originalName);

    expect(names).toContain('one.txt');
    expect(names).toContain('two.txt');
    expect(names).not.toContain('three.txt');
  });

  test('should discard all attached files when max files per message is 0', async () => {
    const { caller, mockedToken } = await initTest();

    await tdb
      .update(settings)
      .set({
        storageMaxFilesPerMessage: 0
      })
      .execute();

    const file1 = new File(['file one'], 'one.txt', { type: 'text/plain' });
    const file2 = new File(['file two'], 'two.txt', { type: 'text/plain' });

    const response1 = await uploadFile(file1, mockedToken);
    const response2 = await uploadFile(file2, mockedToken);

    const temp1 = (await response1.json()) as { id: string };
    const temp2 = (await response2.json()) as { id: string };

    const messageId = await caller.messages.send({
      channelId: 1,
      content: 'Message with files while limit is zero',
      files: [temp1.id, temp2.id]
    });

    const messages = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const sentMessage = messages.messages.find((m) => m.id === messageId);

    expect(sentMessage).toBeDefined();
    expect(sentMessage!.files.length).toBe(0);
  });

  test('should update message updatedAt timestamp on edit', async () => {
    const { caller } = await initTest();

    await caller.messages.send({
      channelId: 1,
      content: 'Original message',
      files: []
    });

    const messagesBefore = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const messageId = messagesBefore.messages[0]!.id;

    const readUpdatedAt = async () =>
      (
        await tdb
          .select({ updatedAt: messages.updatedAt })
          .from(messages)
          .where(eq(messages.id, messageId))
          .get()
      )?.updatedAt;

    const originalUpdatedAt = await readUpdatedAt();

    await new Promise((r) => setTimeout(r, 10));

    await caller.messages.edit({
      messageId,
      content: 'Edited message'
    });

    const messagesAfter = await caller.messages.get({
      channelId: 1,
      cursor: null,
      limit: 50
    });

    const editedMessage = messagesAfter.messages.find(
      (m) => m.id === messageId
    );

    expect(editedMessage!.editedAt).not.toBeNull();

    const updatedAt = await readUpdatedAt();

    expect(updatedAt).toBeDefined();
    expect(updatedAt).not.toBe(originalUpdatedAt);
    expect(updatedAt).toBeGreaterThan(
      originalUpdatedAt ?? editedMessage!.createdAt
    );
  });

  test('should rate limit excessive send message attempts', async () => {
    const { caller } = await initTest(1);

    for (let i = 0; i < 15; i++) {
      await caller.messages.send({
        channelId: 1,
        content: `Message ${i}`,
        files: []
      });
    }

    await expect(
      caller.messages.send({
        channelId: 1,
        content: 'One too many',
        files: []
      })
    ).rejects.toThrow('Too many requests. Please try again shortly.');
  });

  test('should rate limit excessive edit message attempts', async () => {
    const { caller } = await initTest(1);

    const messageId = await caller.messages.send({
      channelId: 1,
      content: 'Message to edit',
      files: []
    });

    for (let i = 0; i < 15; i++) {
      await caller.messages.edit({
        messageId,
        content: `Edit ${i}`
      });
    }

    await expect(
      caller.messages.edit({
        messageId,
        content: 'One too many'
      })
    ).rejects.toThrow('Too many requests. Please try again shortly.');
  });

  test('should reject file attachments in direct messages when disabled', async () => {
    const { caller: caller1, mockedToken } = await initTest(1);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await tdb
      .update(settings)
      .set({
        storageFileSharingInDirectMessages: false
      })
      .execute();

    const file = new File(['dm attachment'], 'dm.txt', {
      type: 'text/plain'
    });

    const uploadResponse = await uploadFile(file, mockedToken);
    const uploaded = (await uploadResponse.json()) as { id: string };

    await expect(
      caller1.messages.send({
        channelId,
        content: 'hello with file',
        files: [uploaded.id]
      })
    ).rejects.toThrow(
      'File sharing in direct messages is disabled on this server'
    );
  });

  test('should reject sending and fetching direct messages when dms are disabled', async () => {
    const { caller: caller1 } = await initTest(1);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await tdb
      .update(settings)
      .set({
        directMessagesEnabled: false
      })
      .execute();

    await expect(
      caller1.messages.send({
        channelId,
        content: 'blocked dm',
        files: []
      })
    ).rejects.toThrow('Direct messages are disabled on this server');

    await expect(
      caller1.messages.get({
        channelId,
        cursor: null,
        limit: 50
      })
    ).rejects.toThrow('Direct messages are disabled on this server');
  });

  test('should throw when non-participant tries to fetch direct messages', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller3 } = await initTest(3);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await expect(
      caller3.messages.get({
        channelId,
        cursor: null,
        limit: 50
      })
    ).rejects.toThrow('You are not a participant in this DM channel');
  });

  test('should throw when non-participant tries to send message in direct messages', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller3 } = await initTest(3);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await expect(
      caller3.messages.send({
        channelId,
        content: 'Intruding DM',
        files: []
      })
    ).rejects.toThrow('You are not a participant in this DM channel');
  });

  test('should throw when non-participant tries to signal typing in direct messages', async () => {
    const { caller: caller1 } = await initTest(1);
    const { caller: caller3 } = await initTest(3);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    await expect(
      caller3.messages.signalTyping({
        channelId
      })
    ).rejects.toThrow('You are not a participant in this DM channel');
  });

  test('should send a message in direct messages', async () => {
    const { caller: caller1 } = await initTest(3);
    const { caller: caller2 } = await initTest(4);

    const messagesBefore = await caller2.messages.get({
      channelId: 3, // DM channel between user 3 and 4
      cursor: null,
      limit: 50
    });

    await caller1.messages.send({
      channelId: 3, // DM channel between user 3 and 4
      content: 'Hello in DM',
      files: []
    });

    const messagesAfter = await caller2.messages.get({
      channelId: 3, // DM channel between user 3 and 4
      cursor: null,
      limit: 50
    });

    expect(messagesBefore.messages.length).toBe(1); // first dm is already mocked
    expect(messagesAfter.messages.length).toBe(2);
    expect(messagesAfter.messages[0]!.content).toBe('Hello in DM');
  });

  test('should throw when non-participant tries to pin a DM message', async () => {
    // User 1 is not a participant in DM channel 3 (message id 2 is from seed)
    const { caller } = await initTest(1);

    await expect(caller.messages.togglePin({ messageId: 2 })).rejects.toThrow(
      'You are not a participant in this DM channel'
    );
  });

  test('should throw when pinning a DM message with DMs disabled', async () => {
    const { caller } = await initTest(3);

    // give user 3 PIN_MESSAGES permission via their default role
    await tdb.insert(rolePermissions).values({
      roleId: 2,
      permission: Permission.PIN_MESSAGES,
      createdAt: Date.now()
    });

    await tdb.update(settings).set({ directMessagesEnabled: false }).execute();

    await expect(caller.messages.togglePin({ messageId: 2 })).rejects.toThrow(
      'Direct messages are disabled on this server'
    );
  });

  test('should throw when fetching pinned DM messages as non-participant', async () => {
    const { caller } = await initTest(1);

    await expect(caller.messages.getPinned({ channelId: 3 })).rejects.toThrow(
      'You are not a participant in this DM channel'
    );
  });

  test('should throw when fetching pinned DM messages with DMs disabled', async () => {
    const { caller } = await initTest(3);

    await tdb.update(settings).set({ directMessagesEnabled: false }).execute();

    await expect(caller.messages.getPinned({ channelId: 3 })).rejects.toThrow(
      'Direct messages are disabled on this server'
    );
  });

  test('should throw when fetching a single DM message with DMs disabled', async () => {
    const { caller } = await initTest(3);

    await tdb.update(settings).set({ directMessagesEnabled: false }).execute();

    await expect(caller.messages.getOne({ messageId: 2 })).rejects.toThrow(
      'Direct messages are disabled on this server'
    );
  });

  test('should throw when editing a DM message with DMs disabled', async () => {
    const { caller } = await initTest(3);

    await tdb.update(settings).set({ directMessagesEnabled: false }).execute();

    await expect(
      caller.messages.edit({ messageId: 2, content: 'edited' })
    ).rejects.toThrow('Direct messages are disabled on this server');
  });

  test('should throw when deleting a DM message with DMs disabled', async () => {
    const { caller } = await initTest(3);

    await tdb.update(settings).set({ directMessagesEnabled: false }).execute();

    await expect(caller.messages.delete({ messageId: 2 })).rejects.toThrow(
      'Direct messages are disabled on this server'
    );
  });

  test('should throw when reacting to a DM message with DMs disabled', async () => {
    const { caller } = await initTest(3);

    // give user 3 REACT_TO_MESSAGES permission via their default role
    await tdb.insert(rolePermissions).values({
      roleId: 2,
      permission: Permission.REACT_TO_MESSAGES,
      createdAt: Date.now()
    });

    await tdb.update(settings).set({ directMessagesEnabled: false }).execute();

    await expect(
      caller.messages.toggleReaction({ messageId: 2, emoji: '👍' })
    ).rejects.toThrow('Direct messages are disabled on this server');
  });

  test('should reject file attachments in DMs when file uploads are globally disabled', async () => {
    const { caller: caller1, mockedToken } = await initTest(1);

    const { channelId } = await caller1.dms.open({ userId: 2 });

    // upload file while uploads are still enabled
    const file = new File(['dm attachment'], 'dm.txt', {
      type: 'text/plain'
    });

    const uploadResponse = await uploadFile(file, mockedToken);
    const uploaded = (await uploadResponse.json()) as { id: string };

    // disable uploads but keep DM file sharing enabled
    await tdb
      .update(settings)
      .set({
        storageUploadEnabled: false,
        storageFileSharingInDirectMessages: true
      })
      .execute();

    await expect(
      caller1.messages.send({
        channelId,
        content: 'hello with file',
        files: [uploaded.id]
      })
    ).rejects.toThrow('File uploads are disabled on this server');
  });

  test('should reject file attachments in regular channels when file uploads are globally disabled', async () => {
    const { caller, mockedToken } = await initTest(1);

    // upload file while uploads are still enabled
    const file = new File(['test file'], 'test.txt', {
      type: 'text/plain'
    });

    const uploadResponse = await uploadFile(file, mockedToken);
    const uploaded = (await uploadResponse.json()) as { id: string };

    // disable uploads globally
    await tdb.update(settings).set({ storageUploadEnabled: false }).execute();

    await expect(
      caller.messages.send({
        channelId: 1,
        content: 'hello with file',
        files: [uploaded.id]
      })
    ).rejects.toThrow('File uploads are disabled on this server');
  });

  test('should rate limit excessive search attempts', async () => {
    const { caller } = await initTest(1);

    for (let i = 0; i < 20; i++) {
      await caller.messages.search({ query: 'hello', limit: 1 });
    }

    await expect(
      caller.messages.search({ query: 'hello', limit: 1 })
    ).rejects.toThrow('Too many requests. Please try again shortly.');
  });

  test('should rate limit excessive delete message attempts', async () => {
    const { caller } = await initTest(1);

    for (let i = 0; i < 30; i++) {
      await expect(
        caller.messages.delete({ messageId: 999999 })
      ).rejects.toThrow('Message not found');
    }

    await expect(caller.messages.delete({ messageId: 999999 })).rejects.toThrow(
      'Too many requests. Please try again shortly.'
    );
  });

  test('should rate limit excessive toggle pin attempts', async () => {
    const { caller } = await initTest(1);

    for (let i = 0; i < 30; i++) {
      await expect(
        caller.messages.togglePin({ messageId: 999999 })
      ).rejects.toThrow('Message not found');
    }

    await expect(
      caller.messages.togglePin({ messageId: 999999 })
    ).rejects.toThrow('Too many requests. Please try again shortly.');
  });

  test('should rate limit excessive social credit vote attempts', async () => {
    const { caller } = await initTest(1);

    for (let i = 0; i < 30; i++) {
      await expect(
        caller.messages.toggleScVote({ messageId: 999999, type: 'upvote' })
      ).rejects.toThrow('Message not found');
    }

    await expect(
      caller.messages.toggleScVote({ messageId: 999999, type: 'upvote' })
    ).rejects.toThrow('Too many requests. Please try again shortly.');
  });

  test('rejects unbounded page sizes', async () => {
    const { caller } = await initTest(1);

    for (const limit of [10_000, 0, -1]) {
      await expect(
        caller.messages.get({ channelId: 1, cursor: null, limit })
      ).rejects.toThrow();
    }

    await expect(
      caller.messages.search({ query: 'x', limit: 10_000 })
    ).rejects.toThrow();
  });
});
