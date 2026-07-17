/**
 * Tiny i18n layer: two flat dictionaries and a `t()` lookup with `{param}`
 * interpolation. The active language lives in module state (like the vault's
 * DEK) so non-React code (time formatting, BBCode rendering) can read it; the
 * App root subscribes via `useLang()` and re-renders the tree on change. The
 * persisted choice is `settings.language`; when unset we follow the browser.
 */
import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'bg';

const en = {
  // Shared bits
  'common.cancel': 'Cancel',
  'common.loading': 'Loading…',
  'common.loadingAria': 'Loading',
  'common.loadMore': 'Load more',
  'common.tryAgain': 'Try again',
  'common.back': 'Back',
  'common.reply': 'Reply',
  'common.remove': 'Remove',
  'common.save': 'Save',
  'common.member': 'Member',
  'common.forum': 'Forum',
  'common.noSubject': '(no subject)',
  'common.failedToLoad': 'Failed to load.',
  'common.somethingWrong': 'Something went wrong.',
  'common.viewProfile': "View {name}'s profile",

  // Relative / absolute timestamps (lib/time.ts)
  'time.justNow': 'just now',
  'time.minsAgo': '{m}m ago',
  'time.hoursAgo': '{h}h {m}m ago',
  'time.today': 'Today @ {time}',
  'time.yesterday': 'Yesterday @ {time}',
  'time.stamp': '{day} {month} {year} @ {time}',

  // Post rendering (lib/bbcode.tsx)
  'quote.byAt': '{who} wrote: {when}',
  'quote.by': '{who} wrote:',
  'spoiler.label': 'Spoiler',
  'spoiler.hidden': 'Hidden content',
  'post.lastEdit': '« Last edit: {when} »',
  'post.lastEditBy': '« Last edit: {when} by {who} »',

  // Formatting toolbar
  'format.bold': 'Bold',
  'format.italic': 'Italic',
  'format.underline': 'Underline',
  'format.quote': 'Quote',
  'format.link': 'Link',
  'format.spoiler': 'Spoiler',
  'format.aria': 'Formatting',

  // Tab bar
  'tabs.forums': 'Forums',
  'tabs.messages': 'Messages',
  'tabs.settings': 'Settings',

  // Pager
  'pager.first': 'First page',
  'pager.prev': 'Previous page',
  'pager.next': 'Next page',
  'pager.last': 'Last page',
  'pager.jump': 'Jump to page',
  'pager.go': 'Go',

  // Forums list
  'forums.title': 'Forums',
  'forums.add': 'Add forum',
  'forums.setupRelay': 'Set up your relay first',
  'forums.setupRelayHint':
    'Forum Reader needs a small self-hosted relay to reach forums. Tap to configure it in Settings.',
  'forums.none': 'No forums yet',
  'forums.noneHint': 'Add a phpBB forum that has the Tapatalk plugin to get started.',
  'forums.favSet': 'Set as favorite',
  'forums.favUnset': 'Unset favorite',

  // Board index (Categories)
  'cats.loading': 'Loading forums…',
  'cats.newPosts': 'New posts',
  'cats.unreadReplies': 'Topics with unread replies',
  'cats.search': 'Search',
  'cats.messages': 'Messages',

  // Topic list
  'topics.title': 'Topics',
  'topics.count.one': '1 topic',
  'topics.count.many': '{n} topics',
  'topics.loading': 'Loading topics…',
  'topics.none': 'No topics here.',
  'topics.replies.one': '1 reply',
  'topics.replies.many': '{n} replies',
  'topics.unread': 'Unread',
  'topics.read': 'Read',
  'topics.pinned': 'Pinned',
  'topics.locked': 'Locked',

  // New posts feed
  'newPosts.title': 'New posts',
  'newPosts.loading': 'Loading new posts…',
  'newPosts.caughtUp': "You're all caught up — no unread topics.",

  // Thread
  'thread.topic': 'Topic',
  'thread.loadingPosts': 'Loading posts…',
  'thread.edit': 'Edit',
  'thread.quote': 'Quote',
  'thread.editPlaceholder': 'Edit your post…',
  'thread.replyPlaceholder': 'Write a reply…',
  'thread.postReply': 'Post reply',
  'thread.rejectedReply': 'The forum rejected the reply.',
  'thread.couldNotPost': 'Could not post.',
  'thread.cantEdit': 'This post can no longer be edited.',
  'thread.couldNotLoadPost': 'Could not load the post.',
  'thread.rejectedEdit': 'The forum rejected the edit.',
  'thread.couldNotSave': 'Could not save.',

  // Search
  'search.title': 'Search',
  'search.placeholder': 'Search topics and posts…',
  'search.button': 'Search',
  'search.allSections': 'All sections',
  'search.sectionAria': 'Section to search in',
  'search.prompt': 'Enter a term to search this forum.',
  'search.noResults': 'No results for “{q}”.',
  'search.searching': 'Searching…',

  // Post jump (quote links)
  'jump.title': 'Quoted post',
  'jump.locating': 'Locating post…',
  'jump.failed': 'The forum could not locate the quoted post.',

  // Profile
  'profile.loading': 'Loading profile…',
  'profile.online': 'Online',
  'profile.offline': 'Offline',
  'profile.posts': 'Posts',
  'profile.joined': 'Joined',
  'profile.lastSeen': 'Last seen',
  'profile.signature': 'Signature',
  'profile.sendMessage': 'Send message',

  // Messages (folders)
  'msgs.title': 'Messages',
  'msgs.new': 'New message',
  'msgs.loading': 'Loading messages…',
  'msgs.noFolders': 'No message folders available.',
  'msgs.count.one': '1 message',
  'msgs.count.many': '{n} messages',
  'pm.empty': 'This folder is empty.',

  // Message view
  'mv.message': 'Message',
  'mv.loading': 'Loading message…',
  'mv.to': 'to {names}',
  'mv.replySent': 'Reply sent.',
  'mv.replyTo': 'Reply to {name}…',
  'mv.sendReply': 'Send reply',
  'mv.rejected': 'The forum rejected the message.',
  'mv.couldNotSend': 'Could not send.',

  // Compose
  'compose.title': 'New message',
  'compose.to': 'To',
  'compose.toPlaceholder': 'username, anotheruser',
  'compose.toHint': 'Separate multiple recipients with commas.',
  'compose.subject': 'Subject',
  'compose.message': 'Message',
  'compose.send': 'Send message',
  'compose.addRecipient': 'Add at least one recipient.',
  'compose.writeFirst': 'Write a message first.',

  // Add forum
  'add.title': 'Add forum',
  'add.url': 'Forum URL',
  'add.urlHint': "The board's web address. We'll look for /mobiquo/mobiquo.php.",
  'add.username': 'Username',
  'add.password': 'Password',
  'add.displayName': 'Display name (optional)',
  'add.displayNamePlaceholder': "Leave blank to use the forum's name",
  'add.connect': 'Connect & save',
  'add.connecting': 'Connecting…',
  'add.probing': 'Looking for the Tapatalk plugin…',
  'add.signingIn': 'Signing in…',
  'add.saving': 'Saving…',
  'add.configureRelay': 'Configure your relay URL in Settings before adding a forum.',
  'add.invalidUrl': 'Enter a valid forum URL.',
  'add.noEndpoint':
    'No Tapatalk endpoint responded there. This forum may not have the plugin installed.',
  'add.loginFailed': 'Login failed. Check your username and password.',
  'add.couldNotConnect': 'Could not connect to that forum.',
  'add.couldNotConnectShort': 'Could not connect.',
  'add.privacyNote':
    'Your password is encrypted on this device and only sent to your own forum through your own relay.',

  // Settings
  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.themeSystem': 'System',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.accent': 'Accent',
  'settings.language': 'Language',
  'settings.showMedia': 'Show images & videos',
  'settings.showMediaHint': 'Render media inline in posts.',
  'settings.defaultForum': 'Default forum',
  'settings.defaultForumHint': 'Opened automatically when the app launches.',
  'settings.noDefault': 'No default (show forum list)',
  'settings.relay': 'Relay',
  'settings.relayHint':
    'Forum Reader reaches forums through a small relay you host yourself. See proxy/README.md in the project for setup.',
  'settings.relayUrl': 'Relay URL',
  'settings.relayToken': 'Relay token',
  'settings.relayTokenPlaceholder': 'Your RELAY_TOKEN secret',
  'settings.saveRelay': 'Save relay settings',
  'settings.saved': 'Saved ✓',
  'settings.forums': 'Forums',
  'settings.noForums': 'No forums added.',
  'settings.addForum': 'Add a forum',
  'settings.security': 'Security',
  'settings.securityNote':
    'Logins are stored on this device and open without a prompt, like Tapatalk. Anyone with access to this browser profile can use them.',
  'settings.eraseAll': 'Erase all logins',
  'settings.footer': 'Forum Reader · credentials are stored on this device only.',
  'settings.removeForumTitle': 'Remove forum?',
  'settings.removeForumQ1': 'Remove',
  'settings.removeForumQ2': 'and its saved login from this device?',
  'settings.eraseTitle': 'Erase all logins?',
  'settings.erase1': 'This deletes',
  'settings.erase2': 'all saved forums and logins',
  'settings.erase3': 'from this device. This cannot be undone.',
  'settings.eraseConfirm': 'Erase everything'
};

export type MsgKey = keyof typeof en;

const bg: Record<MsgKey, string> = {
  'common.cancel': 'Отказ',
  'common.loading': 'Зареждане…',
  'common.loadingAria': 'Зареждане',
  'common.loadMore': 'Зареди още',
  'common.tryAgain': 'Опитай отново',
  'common.back': 'Назад',
  'common.reply': 'Отговори',
  'common.remove': 'Премахни',
  'common.save': 'Запази',
  'common.member': 'Потребител',
  'common.forum': 'Форум',
  'common.noSubject': '(без тема)',
  'common.failedToLoad': 'Зареждането не успя.',
  'common.somethingWrong': 'Нещо се обърка.',
  'common.viewProfile': 'Профил на {name}',

  'time.justNow': 'току-що',
  'time.minsAgo': 'преди {m} мин',
  'time.hoursAgo': 'преди {h} ч {m} мин',
  'time.today': 'Днес в {time}',
  'time.yesterday': 'Вчера в {time}',
  'time.stamp': '{day} {month} {year} в {time}',

  'quote.byAt': 'Цитат на: {who} на {when}',
  'quote.by': 'Цитат на: {who}',
  'spoiler.label': 'Спойлер',
  'spoiler.hidden': 'Скрито съдържание',
  'post.lastEdit': '« Последна редакция: {when} »',
  'post.lastEditBy': '« Последна редакция: {when} от {who} »',

  'format.bold': 'Удебелен',
  'format.italic': 'Курсив',
  'format.underline': 'Подчертан',
  'format.quote': 'Цитат',
  'format.link': 'Връзка',
  'format.spoiler': 'Спойлер',
  'format.aria': 'Форматиране',

  'tabs.forums': 'Форуми',
  'tabs.messages': 'Съобщения',
  'tabs.settings': 'Настройки',

  'pager.first': 'Първа страница',
  'pager.prev': 'Предишна страница',
  'pager.next': 'Следваща страница',
  'pager.last': 'Последна страница',
  'pager.jump': 'Към страница',
  'pager.go': 'Отиди',

  'forums.title': 'Форуми',
  'forums.add': 'Добави форум',
  'forums.setupRelay': 'Първо настрой релето',
  'forums.setupRelayHint':
    'Forum Reader има нужда от малко самостоятелно хоствано реле, за да достига форумите. Докосни, за да го настроиш в Настройки.',
  'forums.none': 'Още няма форуми',
  'forums.noneHint': 'Добави phpBB форум с Tapatalk плъгин, за да започнеш.',
  'forums.favSet': 'Направи любим',
  'forums.favUnset': 'Премахни от любими',

  'cats.loading': 'Зареждане на раздели…',
  'cats.newPosts': 'Нови публикации',
  'cats.unreadReplies': 'Теми с непрочетени отговори',
  'cats.search': 'Търсене',
  'cats.messages': 'Съобщения',

  'topics.title': 'Теми',
  'topics.count.one': '1 тема',
  'topics.count.many': '{n} теми',
  'topics.loading': 'Зареждане на теми…',
  'topics.none': 'Тук няма теми.',
  'topics.replies.one': '1 отговор',
  'topics.replies.many': '{n} отговора',
  'topics.unread': 'Непрочетена',
  'topics.read': 'Прочетена',
  'topics.pinned': 'Закачена',
  'topics.locked': 'Заключена',

  'newPosts.title': 'Нови публикации',
  'newPosts.loading': 'Зареждане на новите публикации…',
  'newPosts.caughtUp': 'Всичко е прочетено — няма непрочетени теми.',

  'thread.topic': 'Тема',
  'thread.loadingPosts': 'Зареждане на публикациите…',
  'thread.edit': 'Редактирай',
  'thread.quote': 'Цитирай',
  'thread.editPlaceholder': 'Редактирай публикацията…',
  'thread.replyPlaceholder': 'Напиши отговор…',
  'thread.postReply': 'Публикувай',
  'thread.rejectedReply': 'Форумът отхвърли отговора.',
  'thread.couldNotPost': 'Публикуването не успя.',
  'thread.cantEdit': 'Тази публикация вече не може да се редактира.',
  'thread.couldNotLoadPost': 'Публикацията не можа да се зареди.',
  'thread.rejectedEdit': 'Форумът отхвърли редакцията.',
  'thread.couldNotSave': 'Записът не успя.',

  'search.title': 'Търсене',
  'search.placeholder': 'Търси теми и публикации…',
  'search.button': 'Търси',
  'search.allSections': 'Всички раздели',
  'search.sectionAria': 'Раздел за търсене',
  'search.prompt': 'Въведи дума за търсене в този форум.',
  'search.noResults': 'Няма резултати за „{q}“.',
  'search.searching': 'Търсене…',

  'jump.title': 'Цитирана публикация',
  'jump.locating': 'Търсене на публикацията…',
  'jump.failed': 'Форумът не намери цитираната публикация.',

  'profile.loading': 'Зареждане на профила…',
  'profile.online': 'На линия',
  'profile.offline': 'Извън линия',
  'profile.posts': 'Публикации',
  'profile.joined': 'Регистрация',
  'profile.lastSeen': 'Последно на линия',
  'profile.signature': 'Подпис',
  'profile.sendMessage': 'Изпрати съобщение',

  'msgs.title': 'Съобщения',
  'msgs.new': 'Ново съобщение',
  'msgs.loading': 'Зареждане на съобщенията…',
  'msgs.noFolders': 'Няма папки със съобщения.',
  'msgs.count.one': '1 съобщение',
  'msgs.count.many': '{n} съобщения',
  'pm.empty': 'Папката е празна.',

  'mv.message': 'Съобщение',
  'mv.loading': 'Зареждане на съобщението…',
  'mv.to': 'до {names}',
  'mv.replySent': 'Отговорът е изпратен.',
  'mv.replyTo': 'Отговори на {name}…',
  'mv.sendReply': 'Изпрати отговор',
  'mv.rejected': 'Форумът отхвърли съобщението.',
  'mv.couldNotSend': 'Изпращането не успя.',

  'compose.title': 'Ново съобщение',
  'compose.to': 'До',
  'compose.toPlaceholder': 'потребител, друг-потребител',
  'compose.toHint': 'Раздели получателите със запетаи.',
  'compose.subject': 'Тема',
  'compose.message': 'Съобщение',
  'compose.send': 'Изпрати съобщението',
  'compose.addRecipient': 'Добави поне един получател.',
  'compose.writeFirst': 'Първо напиши съобщение.',

  'add.title': 'Добавяне на форум',
  'add.url': 'Адрес на форума',
  'add.urlHint': 'Уеб адресът на форума. Ще потърсим /mobiquo/mobiquo.php.',
  'add.username': 'Потребителско име',
  'add.password': 'Парола',
  'add.displayName': 'Показвано име (по избор)',
  'add.displayNamePlaceholder': 'Остави празно, за да се използва името на форума',
  'add.connect': 'Свържи и запази',
  'add.connecting': 'Свързване…',
  'add.probing': 'Търсене на Tapatalk плъгина…',
  'add.signingIn': 'Вписване…',
  'add.saving': 'Запазване…',
  'add.configureRelay': 'Настрой адреса на релето в Настройки, преди да добавиш форум.',
  'add.invalidUrl': 'Въведи валиден адрес на форум.',
  'add.noEndpoint':
    'Няма отговор от Tapatalk на този адрес. Форумът може да няма инсталиран плъгин.',
  'add.loginFailed': 'Вписването не успя. Провери потребителското име и паролата.',
  'add.couldNotConnect': 'Свързването с този форум не успя.',
  'add.couldNotConnectShort': 'Свързването не успя.',
  'add.privacyNote':
    'Паролата ти се шифрова на това устройство и се изпраща само до твоя форум през твоето реле.',

  'settings.title': 'Настройки',
  'settings.appearance': 'Външен вид',
  'settings.theme': 'Тема',
  'settings.themeSystem': 'Системна',
  'settings.themeLight': 'Светла',
  'settings.themeDark': 'Тъмна',
  'settings.accent': 'Акцент',
  'settings.language': 'Език',
  'settings.showMedia': 'Показвай снимки и видео',
  'settings.showMediaHint': 'Показва медията директно в публикациите.',
  'settings.defaultForum': 'Форум по подразбиране',
  'settings.defaultForumHint': 'Отваря се автоматично при стартиране.',
  'settings.noDefault': 'Без подразбиране (списък с форуми)',
  'settings.relay': 'Реле',
  'settings.relayHint':
    'Forum Reader достига форумите през малко реле, което хостваш сам. Виж proxy/README.md в проекта за настройка.',
  'settings.relayUrl': 'Адрес на релето',
  'settings.relayToken': 'Токен на релето',
  'settings.relayTokenPlaceholder': 'Твоята RELAY_TOKEN тайна',
  'settings.saveRelay': 'Запази настройките на релето',
  'settings.saved': 'Запазено ✓',
  'settings.forums': 'Форуми',
  'settings.noForums': 'Няма добавени форуми.',
  'settings.addForum': 'Добави форум',
  'settings.security': 'Сигурност',
  'settings.securityNote':
    'Данните за вход се пазят на това устройство и се отварят без запитване, като Tapatalk. Всеки с достъп до този браузърен профил може да ги използва.',
  'settings.eraseAll': 'Изтрий всички данни за вход',
  'settings.footer': 'Forum Reader · данните за вход се пазят само на това устройство.',
  'settings.removeForumTitle': 'Премахване на форума?',
  'settings.removeForumQ1': 'Да се премахне ли',
  'settings.removeForumQ2': 'и запазеният вход от това устройство?',
  'settings.eraseTitle': 'Изтриване на всички данни за вход?',
  'settings.erase1': 'Това изтрива',
  'settings.erase2': 'всички запазени форуми и данни за вход',
  'settings.erase3': 'от това устройство. Действието е необратимо.',
  'settings.eraseConfirm': 'Изтрий всичко'
};

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_BG = ['яну', 'фев', 'мар', 'апр', 'май', 'юни', 'юли', 'авг', 'сеп', 'окт', 'ное', 'дек'];

/** Browser-derived default, used until (or unless) the user picks a language. */
export function defaultLang(): Lang {
  return /^bg\b/i.test(navigator.language || '') ? 'bg' : 'en';
}

let current: Lang = defaultLang();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  listeners.forEach((fn) => fn());
}

/** Subscribe a component to language changes (used once, at the App root). */
export function useLang(): Lang {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current
  );
}

export function t(key: MsgKey, params?: Record<string, string | number>): string {
  let s = (current === 'bg' ? bg : en)[key] ?? en[key];
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  }
  return s;
}

/** 0-based short month name in the active language. */
export function monthShort(index: number): string {
  return (current === 'bg' ? MONTHS_BG : MONTHS_EN)[index] ?? '';
}
