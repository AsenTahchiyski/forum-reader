/**
 * Typed Tapatalk (mobiquo) client. Maps raw XML-RPC structs to the normalized
 * domain types in `types.ts`. Field extraction is deliberately defensive:
 * the mobiquo plugin varies across forum versions, so we probe a few likely
 * key names for each field. Our XML-RPC decoder already turns <base64> values
 * into UTF-8 strings, so response strings arrive ready to use; request params
 * that must be base64 are wrapped with `b64()`.
 */
import { b64, type XmlRpcValue } from '../lib/xmlrpc';
import { rpc, type CallContext } from './transport';
import type {
  ForumConfig,
  ForumNode,
  LoginResult,
  PmBox,
  PmSummary,
  Post,
  PrivateMessage,
  Thread,
  Topic,
  UserProfile
} from './types';

// ---- struct accessors -----------------------------------------------------

type Struct = Record<string, XmlRpcValue>;

function asStruct(v: XmlRpcValue): Struct {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Struct) : {};
}
function asArray(v: XmlRpcValue): XmlRpcValue[] {
  return Array.isArray(v) ? v : [];
}
function pickStr(s: Struct, keys: string[], fallback = ''): string {
  for (const k of keys) {
    const v = s[k];
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return fallback;
}
function pickInt(s: Struct, keys: string[], fallback = 0): number {
  for (const k of keys) {
    const v = s[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
      return Number(v);
    }
  }
  return fallback;
}
function pickBool(s: Struct, keys: string[], fallback = false): boolean {
  for (const k of keys) {
    const v = s[k];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      if (v === '1' || v.toLowerCase() === 'true') return true;
      if (v === '0' || v.toLowerCase() === 'false') return false;
    }
  }
  return fallback;
}

/** mobiquo usually returns author names inside a small struct or as a string. */
function pickPerson(s: Struct, keys: string[]): { name: string; avatar?: string } {
  for (const k of keys) {
    const v = s[k];
    if (typeof v === 'string' && v) return { name: v };
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = v as Struct;
      return {
        name: pickStr(inner, ['username', 'display_name', 'name']),
        avatar: pickStr(inner, ['icon_url', 'avatar']) || undefined
      };
    }
  }
  return { name: '' };
}

export class MobiquoClient {
  constructor(private readonly ctx: CallContext) {}

  /**
   * The forum root, derived from the mobiquo endpoint
   * (e.g. https://x.com/forum/mobiquo/mobiquo.php -> https://x.com/forum/).
   * Used to turn relative avatar/logo paths into absolute URLs the browser
   * can load directly.
   */
  private get forumBase(): string {
    try {
      return new URL('..', this.ctx.mobiquoUrl).href;
    } catch {
      return '';
    }
  }

  /** Absolutize a forum-supplied image URL; relative paths resolve to the
   *  forum root, protocol-relative to https, absolute URLs pass through. */
  private resolveUrl(raw?: string): string | undefined {
    const u = (raw || '').trim();
    if (!u) return undefined;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return `https:${u}`;
    try {
      return new URL(u, this.forumBase).href;
    } catch {
      return u;
    }
  }

  private call(method: string, params: unknown[] = []) {
    return rpc(this.ctx, method, params);
  }

  // ---- config & auth ------------------------------------------------------

  async getConfig(): Promise<ForumConfig> {
    const s = asStruct(await this.call('get_config'));
    return {
      name: pickStr(s, ['forum_name', 'name', 'board_name'], 'Forum'),
      logoUrl: pickStr(s, ['logo_url', 'logo']) || undefined,
      version: pickStr(s, ['version', 'sys_version']) || undefined,
      canPm: !pickBool(s, ['disable_pm']),
      canSearch: !pickBool(s, ['disable_search']),
      canWhosOnline: !pickBool(s, ['disable_whosonline'])
    };
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const s = asStruct(await this.call('login', [b64(username), b64(password)]));
    const success = pickBool(s, ['result']);
    return {
      success,
      userId: pickStr(s, ['user_id']) || undefined,
      username: pickStr(s, ['username']) || username,
      error: success ? undefined : pickStr(s, ['result_text'], 'Login failed.')
    };
  }

  async logout(): Promise<void> {
    try {
      await this.call('logout_user');
    } catch {
      // best effort
    }
  }

  // ---- browsing -----------------------------------------------------------

  async getForums(): Promise<ForumNode[]> {
    const raw = await this.call('get_forum');
    return asArray(raw).map((n) => this.mapForumNode(asStruct(n)));
  }

  private mapForumNode(s: Struct): ForumNode {
    return {
      id: pickStr(s, ['forum_id', 'id']),
      title: pickStr(s, ['forum_name', 'name', 'title']),
      description: pickStr(s, ['description', 'forum_desc']) || undefined,
      isCategory: pickBool(s, ['is_category']),
      hasNew: pickBool(s, ['new_post', 'has_new']),
      isProtected: pickBool(s, ['is_protected']),
      logoUrl: this.resolveUrl(pickStr(s, ['logo_url', 'logo', 'icon_url'])),
      subOnly: pickBool(s, ['sub_only']),
      children: asArray(s.child).map((c) => this.mapForumNode(asStruct(c)))
    };
  }

  async getTopics(
    forumId: string,
    start: number,
    end: number
  ): Promise<{ topics: Topic[]; total: number }> {
    const raw = await this.call('get_topic', [forumId, start, end]);
    // Some installs return { total_topic_num, topics: [...] }, others return
    // the topic array directly (then the total is unknown → 0).
    if (Array.isArray(raw)) {
      return { topics: raw.map((t) => this.mapTopic(asStruct(t))), total: 0 };
    }
    const s = asStruct(raw);
    return {
      topics: asArray(s.topics).map((t) => this.mapTopic(asStruct(t))),
      total: pickInt(s, ['total_topic_num', 'total_topic_count', 'total'])
    };
  }

  async getUnreadTopics(
    start: number,
    end: number
  ): Promise<{ topics: Topic[]; total: number }> {
    const raw = await this.call('get_unread_topic', [start, end]);
    // Like get_topic, some installs wrap the array in a struct with a count.
    if (Array.isArray(raw)) {
      return { topics: raw.map((t) => this.mapTopic(asStruct(t))), total: 0 };
    }
    const s = asStruct(raw);
    return {
      topics: asArray(s.topics).map((t) => this.mapTopic(asStruct(t))),
      total: pickInt(s, ['total_unread_num', 'unread_number', 'total_topic_num'])
    };
  }

  /**
   * Full-text search. Tapatalk returns a `search_id` on the first call that
   * pins the result set; passing it back on later pages keeps pagination
   * stable, so callers thread it through. Results are post hits mapped onto the
   * Topic shape (we navigate to the containing topic).
   */
  async search(
    keywords: string,
    start: number,
    end: number,
    searchId?: string
  ): Promise<{ topics: Topic[]; total: number; searchId?: string }> {
    const params: unknown[] = [b64(keywords), start, end];
    if (searchId) params.push(searchId);
    // Use `search_topic`, not `search`: the mobiquo `search` method only accepts
    // a single advanced-search struct, so our positional (base64, int, int[,
    // search_id]) args are rejected with "Parameter Error". `search_topic`
    // declares exactly that positional signature.
    const raw = await this.call('search_topic', params);
    // Results are post hits. Depending on the plugin version they arrive either
    // as a bare array, or wrapped in a struct keyed `topics` or `posts` (with
    // the count under the matching `total_*` name) — probe both, like the other
    // listing endpoints do.
    if (Array.isArray(raw)) {
      return { topics: raw.map((t) => this.mapTopic(asStruct(t))), total: 0 };
    }
    const s = asStruct(raw);
    const hits = s.topics !== undefined ? s.topics : s.posts;
    return {
      topics: asArray(hits).map((t) => this.mapTopic(asStruct(t))),
      total: pickInt(s, ['total_topic_num', 'total_post_num', 'total', 'result_total']),
      searchId: pickStr(s, ['search_id']) || undefined
    };
  }

  private mapTopic(s: Struct): Topic {
    const author = pickPerson(s, ['topic_author']);
    return {
      id: pickStr(s, ['topic_id', 'id']),
      title: pickStr(s, ['topic_title', 'title']),
      forumName: pickStr(s, ['forum_name']) || undefined,
      author: author.name || pickStr(s, ['topic_author_name', 'post_author_name', 'author_name']),
      authorId: pickStr(s, ['topic_author_id', 'post_author_id', 'author_id']) || undefined,
      replyCount: pickInt(s, ['reply_number', 'reply_count', 'replies']),
      viewCount: pickInt(s, ['view_number', 'view_count', 'views']),
      lastReplyAt: pickStr(s, ['last_reply_time', 'last_reply_date']) || undefined,
      isSticky: pickBool(s, ['is_sticky', 'sticky']),
      isLocked: pickBool(s, ['is_closed', 'closed', 'is_locked']),
      hasNew: pickBool(s, ['new_post', 'has_new']),
      shortContent: pickStr(s, ['short_content', 'post_content']) || undefined,
      // Count of already-read posts (the 0-based index of the first unread
      // post), per Tapatalk's get_unread_topic ("new posts") endpoint. Regular
      // get_topic browsing omits it on our reference plugin. The first unread
      // post's 1-based number is this + 1 (see Thread.tsx).
      unreadPosition: pickInt(s, ['position', 'unread_position']) || undefined
    };
  }

  async getThread(
    topicId: string,
    start: number,
    end: number
  ): Promise<Thread> {
    // Last param requests pre-rendered HTML content where supported.
    const s = asStruct(await this.call('get_thread', [topicId, start, end, true]));
    // Note: get_thread's `position` field is not a reliable first-unread marker
    // on our reference plugin (it reads back as 1 regardless of the page), so we
    // deliberately do not surface it here. Landing uses the topic's
    // unreadPosition (when available) or the last-page fallback instead.
    return {
      topicId,
      forumId: pickStr(s, ['forum_id']) || undefined,
      title: pickStr(s, ['topic_title', 'title']),
      totalPosts: pickInt(s, ['total_post_num', 'total_post_count']),
      canReply: pickBool(s, ['can_reply'], true),
      posts: asArray(s.posts).map((p) => this.mapPost(asStruct(p)))
    };
  }

  private mapPost(s: Struct): Post {
    const author = pickPerson(s, ['post_author']);
    return {
      id: pickStr(s, ['post_id', 'id']),
      author: author.name || pickStr(s, ['post_author_name', 'author_name']),
      authorId: pickStr(s, ['post_author_id', 'author_id']) || undefined,
      authorAvatar: this.resolveUrl(
        author.avatar || pickStr(s, ['icon_url', 'avatar_url'])
      ),
      postTime: pickStr(s, ['post_time', 'post_date']) || undefined,
      content: pickStr(s, ['post_content', 'content', 'text_body']),
      canEdit: pickBool(s, ['can_edit'])
    };
  }

  async replyToTopic(
    forumId: string,
    topicId: string,
    subject: string,
    body: string
  ): Promise<{ ok: boolean; message?: string }> {
    const s = asStruct(
      await this.call('reply_post', [forumId, topicId, b64(subject), b64(body)])
    );
    return {
      ok: pickBool(s, ['result']),
      message: pickStr(s, ['result_text']) || undefined
    };
  }

  /**
   * Fetch a post's raw (BBCode) body for editing, via get_raw_post. On success
   * the plugin returns the post's title and editable content (no `result` key);
   * on failure it returns the standard `{ result: false, result_text }` struct
   * (e.g. the edit window has passed, the post is edit-locked, or it isn't ours).
   */
  async getRawPost(
    postId: string
  ): Promise<{ ok: boolean; subject: string; content: string; error?: string }> {
    const s = asStruct(await this.call('get_raw_post', [postId]));
    const ok = !('result' in s) || pickBool(s, ['result']);
    return {
      ok,
      subject: pickStr(s, ['post_title', 'subject', 'title']),
      content: pickStr(s, ['post_content', 'content', 'text_body']),
      error: ok ? undefined : pickStr(s, ['result_text'], 'This post can no longer be edited.')
    };
  }

  /**
   * Save an edited post via save_raw_post. The subject must be sent back even
   * when unchanged (the plugin requires it), so pass the value from getRawPost.
   * Returns the freshly rendered HTML so the caller can update the post in place.
   */
  async saveRawPost(
    postId: string,
    subject: string,
    body: string
  ): Promise<{ ok: boolean; message?: string; content?: string }> {
    const s = asStruct(
      await this.call('save_raw_post', [postId, b64(subject), b64(body)])
    );
    const ok = pickBool(s, ['result']);
    return {
      ok,
      message: pickStr(s, ['result_text']) || undefined,
      content: ok ? pickStr(s, ['post_content', 'content']) || undefined : undefined
    };
  }

  // ---- users --------------------------------------------------------------

  /**
   * Look up a member's profile. Tapatalk's get_user_info keys on the username
   * (base64); we pass the user_id too when we have it, since some plugins use
   * it to disambiguate. Either identifier is enough on its own.
   */
  async getUserInfo(username: string, userId?: string): Promise<UserProfile> {
    const params: unknown[] = [b64(username || '')];
    if (userId) params.push(userId);
    const s = asStruct(await this.call('get_user_info', params));
    const hasPosts = ['post_count', 'posts'].some((k) => k in s);
    return {
      id: pickStr(s, ['user_id', 'userid', 'id'], userId || ''),
      username: pickStr(s, ['username', 'user_name'], username),
      displayName: pickStr(s, ['display_name', 'displayname']) || undefined,
      avatar: this.resolveUrl(pickStr(s, ['icon_url', 'avatar_url', 'avatar'])),
      postCount: hasPosts ? pickInt(s, ['post_count', 'posts']) : undefined,
      registeredAt:
        pickStr(s, ['register_time', 'registration_time', 'reg_time']) || undefined,
      lastActivityAt:
        pickStr(s, ['last_activity_time', 'last_activity', 'lastactivity']) ||
        undefined,
      isOnline: pickBool(s, ['is_online', 'online']),
      signature: pickStr(s, ['signature', 'sig']) || undefined,
      customFields: asArray(s.custom_fields_list)
        .map((f) => {
          const fs = asStruct(f);
          return {
            name: pickStr(fs, ['name', 'field_name', 'title']),
            value: pickStr(fs, ['value', 'field_value'])
          };
        })
        .filter((f) => f.name && f.value),
      canPm: ['can_pm', 'can_send_pm', 'allow_pm'].some((k) => k in s)
        ? pickBool(s, ['can_pm', 'can_send_pm', 'allow_pm'])
        : undefined
    };
  }

  // ---- private messages ---------------------------------------------------

  async getBoxes(): Promise<PmBox[]> {
    const raw = await this.call('get_box_info');
    const list = Array.isArray(raw) ? raw : asArray(asStruct(raw).list);
    return list.map((b) => {
      const s = asStruct(b);
      return {
        id: pickStr(s, ['box_id', 'id']),
        title: pickStr(s, ['box_name', 'name']),
        unreadCount: pickInt(s, ['unread_count', 'msg_unread_count']),
        total: pickInt(s, ['msg_count', 'total'])
      };
    });
  }

  async getBox(boxId: string, start: number, end: number): Promise<PmSummary[]> {
    const raw = await this.call('get_box', [boxId, start, end]);
    const list = Array.isArray(raw) ? raw : asArray(asStruct(raw).list);
    return list.map((m) => this.mapPmSummary(asStruct(m)));
  }

  private mapPmSummary(s: Struct): PmSummary {
    const from = pickPerson(s, ['msg_from']);
    let party = from.name;
    if (!party) {
      const to = asArray(s.msg_to).map((t) => pickPerson({ x: t }, ['x']).name);
      party = to.filter(Boolean).join(', ');
    }
    return {
      id: pickStr(s, ['msg_id', 'id']),
      title: pickStr(s, ['msg_title', 'subject', 'title']),
      party,
      partyAvatar: this.resolveUrl(from.avatar),
      sentAt: pickStr(s, ['sent_date', 'msg_time']) || undefined,
      isUnread: pickBool(s, ['is_unread', 'msg_state']),
      shortContent: pickStr(s, ['short_content']) || undefined
    };
  }

  async getMessage(msgId: string, boxId: string): Promise<PrivateMessage> {
    const s = asStruct(await this.call('get_message', [msgId, boxId]));
    const from = pickPerson(s, ['msg_from']);
    return {
      id: pickStr(s, ['msg_id', 'id'], msgId),
      title: pickStr(s, ['msg_title', 'subject', 'title']),
      from: from.name,
      fromAvatar: this.resolveUrl(from.avatar),
      to: asArray(s.msg_to).map((t) => pickPerson({ x: t }, ['x']).name).filter(Boolean),
      sentAt: pickStr(s, ['sent_date', 'msg_time']) || undefined,
      content: pickStr(s, ['text_body', 'message_content', 'content'])
    };
  }

  async sendMessage(
    to: string[],
    subject: string,
    body: string
  ): Promise<{ ok: boolean; message?: string }> {
    const recipients = to.map((u) => b64(u));
    // create_message(MsgTo[], Subject, TextBody, Action)
    const s = asStruct(
      await this.call('create_message', [recipients, b64(subject), b64(body), 0])
    );
    return {
      ok: pickBool(s, ['result']),
      message: pickStr(s, ['result_text']) || undefined
    };
  }
}
