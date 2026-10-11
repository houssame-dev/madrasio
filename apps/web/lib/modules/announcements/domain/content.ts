import sanitizeHtml from 'sanitize-html';
import { ValidationError } from '@/lib/errors';

/** Shared write/render allowlist. Stored HTML is never implicitly trusted. */
export function sanitizeAnnouncementHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'a'],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
  });
}

export function acceptedAnnouncementContent(input: { title: string; body: string; bodyFormat?: 'PLAIN_TEXT' | 'HTML' }) {
  const bodyFormat = input.bodyFormat ?? 'PLAIN_TEXT';
  const body = bodyFormat === 'HTML' ? sanitizeAnnouncementHtml(input.body) : input.body;
  if (bodyFormat === 'HTML' && !sanitizeHtml(body, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, ' ').trim()) {
    throw new ValidationError('Announcement content must contain readable text.', { issues: [{ path: ['body'], message: 'Add readable text after unsafe markup is removed.' }] });
  }
  return { title: input.title, body, bodyFormat };
}
