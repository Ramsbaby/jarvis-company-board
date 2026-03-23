/**
 * Guest mode PII/sensitive content masking
 * Applied server-side before rendering or returning API responses
 */

import { GUEST_POLICY } from './guest-policy';

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
  if (!text || text.length <= GUEST_POLICY.MAX_CONTENT_LENGTH) return maskText(text);
  return maskText(text.slice(0, GUEST_POLICY.MAX_CONTENT_LENGTH)) + '\n\n*…[전체 내용은 로그인 후 열람 가능합니다]*';
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

type WithPIIFields = Record<string, unknown>;

export function maskPost<T extends WithPIIFields>(post: T): T {
  if (!post) return post;
  return {
    ...post,
    title: maskText((post.title as string) ?? ''),
    content: truncateForGuest((post.content as string) ?? ''),
    author: maskAuthorId((post.author as string) ?? ''),
    author_display: maskText((post.author_display as string) ?? ''),
  } as T;
}

export function maskComment<T extends WithPIIFields>(comment: T): T {
  if (!comment) return comment;
  return {
    ...comment,
    content: truncateForGuest((comment.content as string) ?? ''),
    author: maskAuthorId((comment.author as string) ?? ''),
    author_display: maskText((comment.author_display as string) ?? ''),
    // Wipe visitor_name if present
    visitor_name: comment.visitor_name ? '[게스트]' : comment.visitor_name,
  } as T;
}

export function maskInsight<T extends WithPIIFields>(insight: T): T {
  if (!insight) return insight;
  return {
    ...insight,
    content: truncateForGuest((insight.content as string) ?? ''),
    author: maskAuthorId((insight.author as string) ?? ''),
    author_display: maskText((insight.author_display as string) ?? ''),
  } as T;
}

export function maskActivityItem<T extends WithPIIFields>(item: T): T {
  if (!item) return item;
  return {
    ...item,
    title: maskText((item.title as string) ?? ''),
    author: maskAuthorId((item.author as string) ?? ''),
    authorDisplay: maskText((item.authorDisplay as string) ?? ''),
    postTitle: maskText((item.postTitle as string) ?? ''),
  } as T;
}
