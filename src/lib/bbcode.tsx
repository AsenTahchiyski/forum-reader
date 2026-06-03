/**
 * Render forum post content (HTML or BBCode) as close to the original as
 * practical. mobiquo may return either; we normalize BBCode to HTML, surface
 * YouTube links as click-to-load embeds, and sanitize everything with
 * DOMPurify before injecting. Images and embeds honor the `showMedia` setting.
 */
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef } from 'react';

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
 * Pull an author name out of a [quote …] tag's attributes. Runs *after*
 * escapeHtml, so any quote characters arrive as &quot;. Handles:
 *   [quote=Bob]                     → Bob
 *   [quote="Bob"] / [quote=Bob;99]  → Bob   (vBulletin author;postid)
 *   [quote name="Bob" time=…]       → Bob
 *   [quote author="Bob" …]          → Bob
 * Returns '' for attribute-only tags (e.g. just time=…) so we don't caption a
 * quote with a bare timestamp.
 */
function quoteAuthor(attr: string): string {
  const named = attr.match(/(?:^|\s)(?:name|author)\s*=\s*(?:&quot;|")?([^&";\]]+)/i);
  if (named) return named[1].trim();
  // Bare value form ([quote=Bob]); skip if the attrs are named fields only.
  if (!attr.includes('=')) {
    return attr.replace(/^(?:&quot;|")|(?:&quot;|")$/g, '').split(';')[0].trim();
  }
  return '';
}

function bbcodeToHtml(input: string): string {
  // Mixed content often carries real <br> line breaks. Normalize them to
  // newlines before escaping so they survive as breaks (see trailing
  // \n → <br /> step) instead of being escaped into literal text.
  let s = escapeHtml(input.replace(/<br\s*\/?>/gi, '\n'));

  // Block / inline tags.
  s = s
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<b>$1</b>')
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<i>$1</i>')
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
    .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>')
    .replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre><code>$1</code></pre>')
    .replace(
      // Accept [quote], [quote=Author] and [quote name="…" time=… …] alike:
      // anything after `quote` up to the closing ] is treated as attributes.
      /\[quote(?:[=\s]([^\]]*))?\]([\s\S]*?)\[\/quote\]/gi,
      (_m, attr, body) => {
        const who = quoteAuthor(attr || '');
        const cite = who ? `<cite>${who} wrote:</cite>` : '';
        return `<blockquote>${cite}${body}</blockquote>`;
      }
    )
    // [hide] / [hide=10] / [hidethanks] etc.: content the forum gates behind a
    // reply. The API already handed us the body, so reveal it in a labeled box
    // rather than leaving the raw tags in the text.
    .replace(
      /\[(hide(?:thanks|-thanks|-reply)?)(?:[=\s][^\]]*)?\]([\s\S]*?)\[\/\1\]/gi,
      '<div class="spoiler"><span class="spoiler-label">Hidden content</span>$2</div>'
    )
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

function buildHtml(raw: string, showMedia: boolean): string {
  let html = hasBBCode(raw) && !looksLikeHtml(raw) ? bbcodeToHtml(raw) : raw;
  if (hasBBCode(raw) && looksLikeHtml(raw)) html = bbcodeToHtml(raw); // mixed → normalize

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
      'blockquote', 'cite', 'ul', 'ol', 'li', 'pre', 'code', 'img'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'data-yt', 'loading'],
    ALLOW_DATA_ATTR: false
  });
}

interface Props {
  content: string;
  showMedia: boolean;
}

export function PostContent({ content, showMedia }: Props) {
  const html = useMemo(() => buildHtml(content, showMedia), [content, showMedia]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const embed = (e.target as HTMLElement).closest<HTMLElement>('.yt-embed');
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
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [html]);

  return (
    <div
      ref={ref}
      className="post-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
