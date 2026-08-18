/**
 * Render forum post content (HTML or BBCode) as close to the original as
 * practical. mobiquo may return either; we normalize BBCode to HTML, surface
 * YouTube links as click-to-load embeds, and sanitize everything with
 * DOMPurify before injecting. Images and embeds honor the `showMedia` setting.
 */
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageViewer } from '../components/ImageViewer';
import { t, useLang } from './i18n';
import { formatEpoch, parseForumDate } from './time';

function escapeHtml(s: string): string {
  return s
    // Only escape a bare `&` — leave existing entities (&amp; &gt; &#39; …)
    // intact so mixed BBCode/HTML content isn't double-escaped.
    .replace(/&(?!(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pull the 11-char video id out of any common YouTube URL form. */
export function youTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/i
  );
  return m ? m[1] : null;
}

function ytPlaceholder(id: string): string {
  return (
    `<a class="yt-embed" data-yt="${id}" href="https://youtu.be/${id}" ` +
    `target="_blank" rel="noopener noreferrer">` +
    `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="YouTube video" loading="lazy" />` +
    `<span class="yt-play" aria-hidden="true">►</span></a>`
  );
}

const looksLikeHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);
const hasBBCode = (s: string) => /\[[a-z*][^\]]*\]/i.test(s);

/**
 * Build a BBCode [quote] block from a post for the reply composer, as a
 * fallback when the forum's get_quote_post isn't available. The stored content
 * may be HTML or BBCode; we flatten it to plain text — except nested quotes,
 * which keep their [quote=Author …] attribution (BBCode) or are rebuilt as
 * [quote] blocks with the cite line as text (HTML), so quoting a post that
 * itself quotes someone doesn't lose the original author and timestamp. The
 * whole thing is wrapped in [quote=Author …] the forum will re-render. When
 * the post's id/time are known they're included in phpBB's `post_id=`/`time=`
 * attribute form so the quote can link back to the post.
 */
export function quotePost(
  author: string,
  content: string,
  meta?: { postId?: string; postTime?: string }
): string {
  const text = content
    // Nested HTML quotes: keep the attribution as a plain text line and turn
    // the blockquote back into a [quote] pair the forum will re-render.
    .replace(
      /<cite[^>]*>([\s\S]*?)<\/cite>/gi,
      (_m, inner: string) => `${inner.replace(/<[^>]+>/g, '').trim()}\n`
    )
    .replace(/<blockquote[^>]*>/gi, '[quote]\n')
    .replace(/<\/blockquote>/gi, '\n[/quote]\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '') // strip remaining HTML tags
    .replace(/\[(?!\/?quote\b)[^\]]*\]/g, '') // strip BBCode tags except nested quotes
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const name = author.replace(/"/g, '');
  let attrs = name ? `=${/[\s\]]/.test(name) ? `"${name}"` : name}` : '';
  if (meta?.postId) attrs += ` post_id=${meta.postId}`;
  const posted = parseForumDate(meta?.postTime);
  if (posted) attrs += ` time=${Math.floor(posted.getTime() / 1000)}`;
  return `[quote${attrs}]\n${text}\n[/quote]\n\n`;
}

/**
 * phpBB-style smilie codes → Unicode emoji. The Tapatalk plugin sometimes
 * hands back the raw codes instead of rendered <img> smilies, so we convert
 * the common set ourselves. Codes are matched longest-first (see SMILIE_RE)
 * so ":-)" wins over ":)" and ":?:" over ":?".
 */
const SMILIES: Record<string, string> = {
  ':D': '😃', ':-D': '😃',
  ':)': '🙂', ':-)': '🙂',
  ';)': '😉', ';-)': '😉', ':wink:': '😉',
  ':(': '🙁', ':-(': '🙁',
  ':o': '😮', ':-o': '😮',
  ':P': '😛', ':-P': '😛', ':p': '😛',
  '8-)': '😎', '8)': '😎',
  ':x': '😡', ':-x': '😡',
  ':?': '😕', ':-?': '😕',
  ':|': '😐', ':-|': '😐',
  ':lol:': '😆',
  ':mrgreen:': '😁',
  ':oops:': '😳',
  ':cry:': '😢',
  ':evil:': '👿',
  ':twisted:': '😈',
  ':roll:': '🙄',
  ':idea:': '💡',
  ':arrow:': '➡️',
  ':shock:': '😲',
  ':!:': '❗',
  ':?:': '❓',
  ':geek:': '🤓',
  ':ugeek:': '🤓'
};

// Require a whitespace/edge boundary on each side so codes embedded in words
// or URLs (e.g. "http://…", a trailing ":/") are left alone.
const SMILIE_RE = new RegExp(
  '(^|\\s)(' +
    Object.keys(SMILIES)
      .sort((a, b) => b.length - a.length)
      .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|') +
    ')(?=\\s|$)',
  'g'
);

function replaceSmilies(html: string): string {
  // Only rewrite text between tags, never the contents of a tag, so href/src
  // and other attributes can't be corrupted.
  return html
    .split(/(<[^>]*>)/)
    .map((tok, i) =>
      i % 2 === 0
        ? tok.replace(SMILIE_RE, (_m, pre, code) => pre + (SMILIES[code] ?? code))
        : tok
    )
    .join('');
}

/**
 * Pull the author name, quoted-post id and unix timestamp out of a [quote …]
 * tag's attributes. Runs *after* escapeHtml, so any quote characters arrive
 * as &quot;. Handles:
 *   [quote=Bob]                             → Bob
 *   [quote="Bob"] / [quote=Bob;99]          → Bob   (vBulletin author;postid)
 *   [quote name="Bob" time=…]               → Bob + time
 *   [quote author="Bob" …]                  → Bob
 *   [quote=Bob post_id=9 time=5 user_id=3]  → Bob + post id + time (phpBB 3.2+)
 *   [quote name="Bob" post=42 timestamp=5]  → Bob + post id + time (SMF via
 *                                             Tapatalk: the plugin rewrites the
 *                                             stored SMF attrs into this form
 *                                             before returning post content —
 *                                             see mobiquo_common.php in
 *                                             tapatalk-smf2)
 *   [quote author=Jo Doe link=topic=8.msg42#msg42 date=5]
 *                                           → Jo Doe + post id + time (raw SMF,
 *                                             e.g. get_quote_post/get_raw_post;
 *                                             link=msg=42 is the 2.1 form)
 * `who` is '' for attribute-only tags (e.g. just time=…); the cite then falls
 * back to the timestamp alone.
 */
function quoteMeta(attr: string): { who: string; postId: string; time: number } {
  const postId =
    attr.match(/(?:^|\s)post(?:_id)?\s*=\s*(?:&quot;|")?(\d+)/i)?.[1] ??
    // SMF link= attribute; the msg number is the post id.
    attr.match(/(?:^|\s)link\s*=\s*(?:&quot;|")?[^\s\]]*?msg=?(\d+)/i)?.[1] ??
    '';
  const time = Number(
    attr.match(/(?:^|\s)(?:timestamp|time|date)\s*=\s*(?:&quot;|")?(\d+)/i)?.[1] ?? 0
  );

  let who = '';
  // The unquoted value (SMF allows spaces in it: author=Jo Doe link=…) runs
  // until the next attribute, a closing quote, or the end.
  const named = attr.match(
    /(?:^|\s)(?:name|author)\s*=\s*(?:&quot;|")?(.+?)(?=\s+\w+\s*=|\s*(?:&quot;|")|$)/i
  );
  const quoted = attr.match(/^(?:&quot;|")([\s\S]+?)(?:&quot;|")/); // "Bob" post_id=…
  const bare = attr.match(/^(.+?)\s+\w+\s*=/); // Bob post_id=…
  if (named) who = named[1].trim();
  else if (quoted) who = quoted[1].trim();
  else if (!attr.includes('=')) {
    // Bare value form ([quote=Bob]); skip if the attrs are named fields only.
    who = attr.replace(/^(?:&quot;|")|(?:&quot;|")$/g, '').split(';')[0].trim();
  } else if (bare) who = bare[1].trim();

  return { who, postId, time };
}

/**
 * Resolve [spoiler]/[hide…] tags into click-to-expand <details> boxes. Like
 * quotes these can nest, so we rewrite the *innermost* boxes first (those whose
 * body holds no further spoiler/hide open/close tag) and loop outward until
 * none remain. [hide…] is content the forum gates behind a reply; the API
 * already handed us the body, so we just collapse it rather than leaving the
 * raw tags in the text. [spoiler=Title] uses its attribute as the summary.
 */
function expandSpoilers(s: string): string {
  const INNER =
    /\[(spoiler|hide(?:thanks|-thanks|-reply)?)(?:[=\s]([^\]]*))?\]((?:(?!\[\/?(?:spoiler|hide))[\s\S])*?)\[\/\1\]/gi;
  let prev: string;
  do {
    prev = s;
    s = s.replace(INNER, (_m, tag, attr, body) => {
      const label = /^spoiler$/i.test(tag)
        ? (attr || '').replace(/^(?:&quot;|")|(?:&quot;|")$/g, '').trim() || t('spoiler.label')
        : t('spoiler.hidden');
      return (
        `<details class="spoiler"><summary class="spoiler-label">${label}</summary>` +
        `<div class="spoiler-body">${body}</div></details>`
      );
    });
  } while (s !== prev);
  return s;
}

/**
 * Resolve [quote] tags, including nested ones, into <blockquote>s. A single
 * regex pass can't handle nesting: a non-greedy match stops at the first
 * [/quote] (the inner one), mismatching the outer pair. Instead we repeatedly
 * rewrite the *innermost* quotes — those whose body contains no further
 * [quote]/[/quote] — until none remain, so each pass works outward by one
 * level.
 *
 * The cite line carries the quoted post's timestamp when the tag has a
 * `time=` attribute, and — given a `post_id=` and the forum account id — the
 * whole line links to the quoted post via the /f/:forumId/p/:postId route.
 */
function expandQuotes(s: string, forumId?: string): string {
  // Body must not contain a nested quote open/close, so this only matches the
  // innermost quotes on each pass.
  const INNER = /\[quote(?:[=\s]([^\]]*))?\]((?:(?!\[\/?quote)[\s\S])*?)\[\/quote\]/gi;
  let prev: string;
  do {
    prev = s;
    s = s.replace(INNER, (_m, attr, body) => {
      const { who, postId, time } = quoteMeta(attr || '');
      const when = time ? formatEpoch(time) : '';
      const label = who
        ? when
          ? t('quote.byAt', { who, when })
          : t('quote.by', { who })
        : when;
      const cite = !label
        ? ''
        : postId && forumId
          ? `<cite><a href="#/f/${forumId}/p/${postId}">${label}</a></cite>`
          : `<cite>${label}</cite>`;
      return `<blockquote>${cite}${body}</blockquote>`;
    });
  } while (s !== prev);
  return s;
}

function bbcodeToHtml(input: string, escape = true, forumId?: string): string {
  // Mixed content often carries real <br> line breaks. Normalize them to
  // newlines before escaping so they survive as breaks (see trailing
  // \n → <br /> step) instead of being escaped into literal text.
  //
  // `escape` is disabled for mixed BBCode+HTML content: escaping there would
  // turn genuine <b>/<i>/… tags into literal &lt;b&gt; text. We skip it and
  // rely on the DOMPurify pass in buildHtml to neutralize anything unsafe.
  const normalized = input.replace(/<br\s*\/?>/gi, '\n');
  let s = escape ? escapeHtml(normalized) : normalized;

  // Block / inline tags.
  s = s
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<b>$1</b>')
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<i>$1</i>')
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
    .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>')
    .replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre><code>$1</code></pre>');

  // Accept [quote], [quote=Author] and [quote name="…" time=… …] alike:
  // anything after `quote` up to the closing ] is treated as attributes.
  // Handled separately so nested quotes resolve correctly (see expandQuotes).
  s = expandQuotes(s, forumId);

  // [spoiler]/[hide…] → collapsible <details> boxes (handles nesting).
  s = expandSpoilers(s);

  s = s
    .replace(/\[list[^\]]*\]([\s\S]*?)\[\/list\]/gi, '<ul>$1</ul>')
    .replace(/\[\*\]\s?/gi, '</li><li>')
    .replace(/<ul><\/li>/gi, '<ul>')
    .replace(/\[img\]([\s\S]*?)\[\/img\]/gi, '<img src="$1" loading="lazy" />')
    .replace(
      /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>'
    )
    .replace(
      /\[url\]([\s\S]*?)\[\/url\]/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    .replace(
      /\[(?:youtube|video)\]([\s\S]*?)\[\/(?:youtube|video)\]/gi,
      (_m, body) => {
        const id = youTubeId(body) || (/^[\w-]{11}$/.test(body) ? body : null);
        return id ? ytPlaceholder(id) : escapeHtml(body);
      }
    );

  return s.replace(/\n/g, '<br />');
}

/** Replace <a href="…youtube…"> and bare youtube links with embeds. */
function embedYouTube(html: string): string {
  // Anchor form.
  html = html.replace(
    /<a\b[^>]*href="([^"]*(?:youtube\.com|youtu\.be)[^"]*)"[^>]*>[\s\S]*?<\/a>/gi,
    (whole, href) => {
      const id = youTubeId(href);
      return id ? ytPlaceholder(id) : whole;
    }
  );
  // Bare URL form (outside of attributes/tags).
  html = html.replace(
    /(^|[\s>])(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]{11}[^\s<]*)/gi,
    (_m, pre, url) => {
      const id = youTubeId(url);
      return id ? `${pre}${ytPlaceholder(id)}` : `${pre}${url}`;
    }
  );
  return html;
}

function buildHtml(raw: string, showMedia: boolean, forumId?: string): string {
  let html = hasBBCode(raw) && !looksLikeHtml(raw) ? bbcodeToHtml(raw, true, forumId) : raw;
  if (hasBBCode(raw) && looksLikeHtml(raw)) html = bbcodeToHtml(raw, false, forumId); // mixed → normalize, keep real HTML tags

  html = embedYouTube(html);
  html = replaceSmilies(html);

  if (!showMedia) {
    // Replace media with simple links so text stays readable. YouTube embeds
    // must be collapsed first: they wrap a thumbnail <img>, so running the
    // generic <img> rule first would gut the embed and leave the yt rule to
    // stop at the injected </a>, mangling the markup.
    html = html
      .replace(
        /<a class="yt-embed" data-yt="([^"]*)"[\s\S]*?<\/a>/gi,
        '<a href="https://youtu.be/$1" target="_blank" rel="noopener noreferrer">[YouTube video]</a>'
      )
      .replace(/<img\b[^>]*src="([^"]*)"[^>]*>/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">[image]</a>');
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a', 'b', 'i', 'u', 's', 'strong', 'em', 'br', 'p', 'span', 'div',
      'blockquote', 'cite', 'ul', 'ol', 'li', 'pre', 'code', 'img',
      'details', 'summary'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'data-yt', 'loading'],
    ALLOW_DATA_ATTR: false
  });
}

interface Props {
  content: string;
  showMedia: boolean;
  /** Forum account id; enables quote cites to link to their quoted post. */
  forumId?: string;
}

export function PostContent({ content, showMedia, forumId }: Props) {
  // Cite/spoiler labels depend on the active language, so it's a memo input.
  const lang = useLang();
  const html = useMemo(
    () => buildHtml(content, showMedia, forumId),
    [content, showMedia, forumId, lang]
  );
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const embed = target.closest<HTMLElement>('.yt-embed');
      if (embed) {
        e.preventDefault();
        const id = embed.getAttribute('data-yt');
        if (!id) return;
        const frame = document.createElement('div');
        frame.className = 'yt-frame';
        frame.innerHTML =
          `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" ` +
          `title="YouTube video" frameborder="0" allow="accelerometer; autoplay; ` +
          `clipboard-write; encrypted-media; gyroscope; picture-in-picture" ` +
          `allowfullscreen></iframe>`;
        embed.replaceWith(frame);
        return;
      }
      // Smilies come through as tiny images; leave those alone.
      const img = target.closest('img');
      if (!img || img.clientWidth < 48) return;
      const link = img.closest('a');
      // A wrapping link usually points at the full-size image — prefer it, but
      // let a link to anything else open normally.
      const href = link?.getAttribute('href') || '';
      const full = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i.test(href) ? href : null;
      if (!full && link) return;
      e.preventDefault();
      setPreview(full || img.src);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [html]);

  return (
    <>
      <div
        ref={ref}
        className="post-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <ImageViewer src={preview} onClose={() => setPreview(null)} />
    </>
  );
}
