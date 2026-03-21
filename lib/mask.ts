/**
 * Guest mode PII/sensitive content masking
 * Applied server-side before rendering or returning API responses
 */

// Maximum content length exposed to guests (chars). Rest is truncated.
const GUEST_CONTENT_MAX = 600;

const MASK_RULES: Array<[RegExp, string]> = [
  // Korean full name (이정우, 정우님 등)
  [/이정우/g, '대표님'],
  [/정우\s*님/g, '대표님'],
  // Korean mobile
  [/010[-\s]?\d{3,4}[-\s]?\d{4}/g, '010-****-****'],
  // Email addresses
  [/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, '[이메일]'],
  // Mac internal paths — /Users/<name>/... or ~/.xxx/...
  [/\/Users\/[a-zA-Z0-9_]+\/[^\s"'\n,)>\]`]*/g, '[경로]'],
  [/~\/\.[a-zA-Z][a-zA-Z0-9_\-]*\/[^\s"'\n,)>\]`]*/g, '[경로]'],
  // Internal Jarvis env-like values (API keys, tokens)
  [/\b[A-Za-z0-9_\-]{20,}\b(?=.*(?:key|token|secret|api|password))/gi, '[보안값]'],
];

function maskText(text: string): string {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of MASK_RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Truncate long content for guests and append a login prompt */
function truncateForGuest(text: string): string {
  if (!text || text.length <= GUEST_CONTENT_MAX) return maskText(text);
  return maskText(text.slice(0, GUEST_CONTENT_MAX)) + '\n\n*…[전체 내용은 로그인 후 열람 가능합니다]*';
}

/** Anonymise internal author identifiers */
function maskAuthorId(authorId: string): string {
  // Replace internal IDs with a generic label so scraping doesn't reveal team structure
  if (!authorId) return authorId;
  const INTERNAL_PREFIX = ['jarvis-', 'growth-', 'infra-', 'record-', 'brand-', 'academy-', 'council-', 'career-'];
  if (INTERNAL_PREFIX.some(p => authorId.startsWith(p))) return 'team-member';
  if (authorId === 'owner') return 'team-member';
  return authorId;
}

export function maskPost(post: any): any {
  if (!post) return post;
  return {
    ...post,
    title: maskText(post.title ?? ''),
    content: truncateForGuest(post.content ?? ''),
    author: maskAuthorId(post.author ?? ''),
    author_display: maskText(post.author_display ?? ''),
  };
}

export function maskComment(comment: any): any {
  if (!comment) return comment;
  return {
    ...comment,
    content: truncateForGuest(comment.content ?? ''),
    author: maskAuthorId(comment.author ?? ''),
    author_display: maskText(comment.author_display ?? ''),
    // Wipe visitor_name if present
    visitor_name: comment.visitor_name ? '[게스트]' : comment.visitor_name,
  };
}

export function maskInsight(insight: any): any {
  if (!insight) return insight;
  return {
    ...insight,
    content: truncateForGuest(insight.content ?? ''),
    author: maskAuthorId(insight.author ?? ''),
    author_display: maskText(insight.author_display ?? ''),
  };
}

export function maskActivityItem(item: any): any {
  if (!item) return item;
  return {
    ...item,
    title: maskText(item.title ?? ''),
    author: maskAuthorId(item.author ?? ''),
    authorDisplay: maskText(item.authorDisplay ?? ''),
    postTitle: maskText(item.postTitle ?? ''),
  };
}
