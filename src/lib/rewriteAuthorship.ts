import type { Collection, IdeaBoard, Item, Reaction, Reply } from '../types'

function rewriteItem(item: Item, fromUserId: string, toUserId: string): Item {
  const reactions: Reaction[] = item.reactions.map((reaction) => ({
    ...reaction,
    authorIds: (reaction.authorIds ?? []).map((id) => (id === fromUserId ? toUserId : id)),
  }))
  const replies: Reply[] = item.replies.map((reply) => ({
    ...reply,
    authorUserId: reply.authorUserId === fromUserId ? toUserId : reply.authorUserId,
  }))
  return {
    ...item,
    authorUserId: item.authorUserId === fromUserId ? toUserId : item.authorUserId,
    reactions,
    replies,
  }
}

function rewriteCollection(
  collection: Collection,
  fromUserId: string,
  toUserId: string,
): Collection {
  return {
    ...collection,
    items: collection.items.map((item) => rewriteItem(item, fromUserId, toUserId)),
  }
}

/** After a device-link claim, rewrite authorship ids so “mine” still works. */
export function rewriteBoardAuthorship(
  board: IdeaBoard,
  fromUserId: string,
  toUserId: string,
): IdeaBoard {
  if (fromUserId === toUserId) return board
  return {
    ...board,
    pendingDeletion:
      board.pendingDeletion?.requestedBy === fromUserId
        ? { ...board.pendingDeletion, requestedBy: toUserId }
        : board.pendingDeletion,
    collections: board.collections.map((collection) =>
      rewriteCollection(collection, fromUserId, toUserId),
    ),
  }
}
