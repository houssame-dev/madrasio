import { describe, expect, it } from 'vitest';
import { acceptedAnnouncementContent, sanitizeAnnouncementHtml } from '@/lib/modules/announcements/domain/content';

describe('Announcement HTML allowlist', () => {
  it('preserves safe formatting, lists, quotes and links deterministically', () => {
    const value = '<h2>News</h2><p><strong>Bold</strong> <em>Emphasis</em> <u>Underline</u></p><ul><li>One</li></ul><blockquote>Quote</blockquote><a href="https://example.test/info" title="Info">Read</a>';
    expect(sanitizeAnnouncementHtml(value)).toBe(value);
    expect(sanitizeAnnouncementHtml(sanitizeAnnouncementHtml(value))).toBe(value);
  });
  it.each([
    '<script>alert(1)</script><p>Safe</p>',
    '<p onclick="alert(1)">Safe<img src=x onerror="alert(1)"></p>',
    '<svg><g onload="alert(1)"></g></svg><p>Safe</p>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><p>Safe</p>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">Safe',
  ])('removes executable markup and attributes: %s', (value) => {
    const html = sanitizeAnnouncementHtml(value);
    const template = document.createElement('template');
    template.innerHTML = html;
    expect(template.content.querySelector('script, svg, math, iframe, style, img')).toBeNull();
    for (const element of template.content.querySelectorAll('*')) {
      expect([...element.attributes].some((attribute) => /^on/i.test(attribute.name))).toBe(false);
    }
    expect(sanitizeAnnouncementHtml(html)).toBe(html);
  });
  it.each(['javascript:alert(1)', 'java&#x73;cript:alert(1)', 'java&#10;script:alert(1)', 'data:text/html,attack', '//evil.test'])('strips dangerous/protocol-relative href %s', (href) => {
    expect(sanitizeAnnouncementHtml(`<a href="${href}" target="_blank" style="color:red">Read</a>`)).toBe('<a>Read</a>');
  });
  it('repairs malformed nesting and never reinterprets legacy text as HTML', () => {
    const value = '<p><strong>Hello</p><ul><li>World';
    expect(sanitizeAnnouncementHtml(value)).toContain('<strong>Hello</strong>');
    expect(acceptedAnnouncementContent({ title: 'Legacy', body: '<b>literal</b>' })).toEqual({ title: 'Legacy', body: '<b>literal</b>', bodyFormat: 'PLAIN_TEXT' });
    expect(() => acceptedAnnouncementContent({ title: 'Empty', body: '<script>attack()</script>', bodyFormat: 'HTML' })).toThrow();
  });
});
