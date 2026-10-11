import { sanitizeAnnouncementHtml } from '@/lib/modules/announcements/domain/content';

export function AnnouncementBody({ body, bodyFormat }: { body: string; bodyFormat?: 'PLAIN_TEXT' | 'HTML' }) {
  if (bodyFormat !== 'HTML') return <p className="whitespace-pre-wrap break-words text-sm leading-6">{body}</p>;
  return <div className="break-words text-sm leading-6 [&_p]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_a]:underline [&_h2]:text-xl [&_h3]:text-lg [&_blockquote]:border-l-2 [&_blockquote]:pl-4"
    dangerouslySetInnerHTML={{ __html: sanitizeAnnouncementHtml(body) }} />;
}
