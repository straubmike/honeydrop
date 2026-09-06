export type Tab = 'calendar' | 'ideas'
export type CollectionKind = 'calendar' | 'idea'
export type MediaKind = 'image' | 'video' | 'audio'
export type ItemType = MediaKind | 'link' | 'text'
export type Recurrence = 'none' | 'yearly' | 'monthly'

export interface Reaction {
  emoji: string
  authors: string[]
}

export interface Reply {
  id: string
  author: string
  text: string
  createdAt: string
}

export type AttachmentKind = MediaKind | 'link'

export interface Attachment {
  id: string
  type: AttachmentKind
  content: string
  mime?: string
  source?: 'preview' | 'upload'
}

export interface Item {
  id: string
  type: ItemType
  author: string
  createdAt: string
  content: string
  caption?: string
  mime?: string
  attachments?: Attachment[]
  previewCandidates?: string[]
  previewIndex?: number
  x?: number
  y?: number
  z?: number
  reactions: Reaction[]
  replies: Reply[]
}

export interface NewItemInput {
  type: ItemType
  content?: string
  caption?: string
  files?: File[]
  fileSource?: Attachment['source']
  previewCandidates?: string[]
}

export interface Schedule {
  startDate: string
  endDate: string
  allDay: boolean
  startTime?: string
  endTime?: string
  recurrence: Recurrence
}

export interface CollectionCoverPreview {
  itemId: string
  attachmentId?: string
  candidateUrl?: string
}

export interface Collection {
  id: string
  kind: CollectionKind
  title: string
  description: string
  createdAt: string
  updatedAt: string
  schedule?: Schedule
  coverPreview?: CollectionCoverPreview
  items: Item[]
}

export interface BoardMember {
  userId: string
  name: string
}

export interface IdeaBoard {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  inviteCode: string
  members: BoardMember[]
  collections: Collection[]
}

export interface AppState {
  userId: string
  displayName: string
  boards: IdeaBoard[]
}

/** @deprecated Legacy single-board shape; kept for storage migration. */
export interface LegacyBoardState {
  boardTitle?: string
  displayName?: string
  partnerName?: string
  collections?: Collection[]
}
