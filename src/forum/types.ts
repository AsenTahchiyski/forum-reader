/** Normalized domain types the UI consumes, mapped from raw mobiquo structs. */

export interface ForumConfig {
  name: string;
  logoUrl?: string;
  version?: string;
  /** Feature flags reported by get_config (best effort). */
  canPm: boolean;
  canSearch: boolean;
  canWhosOnline: boolean;
}

export interface LoginResult {
  success: boolean;
  userId?: string;
  username?: string;
  error?: string;
}

/** A node in the board tree — either a category (container) or a forum. */
export interface ForumNode {
  id: string;
  title: string;
  description?: string;
  /** True for category containers that hold sub-forums but no topics. */
  isCategory: boolean;
  hasNew: boolean;
  isProtected: boolean;
  logoUrl?: string;
  subOnly: boolean;
  children: ForumNode[];
}

export interface Topic {
  id: string;
  title: string;
  /** Containing sub-forum name, when the source carries it (e.g. unread feed). */
  forumName?: string;
  author: string;
  authorId?: string;
  replyCount: number;
  viewCount: number;
  lastReplyAt?: string;
  isSticky: boolean;
  isLocked: boolean;
  hasNew: boolean;
  shortContent?: string;
  /**
   * Count of already-read posts (0-based index of the first unread post), when
   * the plugin reports it. First unread post's 1-based number is this + 1.
   */
  unreadPosition?: number;
}

export interface Post {
  id: string;
  author: string;
  authorId?: string;
  authorAvatar?: string;
  postTime?: string;
  /** Raw content (HTML or BBCode) as returned by mobiquo. */
  content: string;
  canEdit: boolean;
  /** When / by whom the post was last edited, when the plugin reports it. */
  editTime?: string;
  editAuthor?: string;
}

export interface Thread {
  topicId: string;
  forumId?: string;
  title: string;
  posts: Post[];
  totalPosts: number;
  canReply: boolean;
}

export interface PmBox {
  id: string;
  title: string;
  unreadCount: number;
  total: number;
}

export interface PmSummary {
  id: string;
  title: string;
  /** Sender (inbox) or recipient list (sent). */
  party: string;
  partyAvatar?: string;
  sentAt?: string;
  isUnread: boolean;
  shortContent?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  /** Omitted when the plugin doesn't report it (distinct from a real 0). */
  postCount?: number;
  registeredAt?: string;
  lastActivityAt?: string;
  isOnline: boolean;
  /** Raw signature (HTML or BBCode), when present. */
  signature?: string;
  customFields: { name: string; value: string }[];
  /** Whether the viewer may PM this user, when the plugin reports it. */
  canPm?: boolean;
}

export interface PrivateMessage {
  id: string;
  title: string;
  from: string;
  fromAvatar?: string;
  to: string[];
  sentAt?: string;
  /** Raw content (HTML or BBCode). */
  content: string;
}
