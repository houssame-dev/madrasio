import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUPPORTED_LOCALES, localeDirection } from '@school/shared';
import { AppContextProvider } from '@/components/app/app-context';
import { AnnouncementsWorkspace } from '@/components/announcements/announcements-workspace';
import { AnnouncementDetailWorkspace } from '@/components/announcements/announcement-detail';
import { AnnouncementForm } from '@/components/announcements/announcement-form';
import { AnnouncementTargets } from '@/components/announcements/announcement-targets';
import { AnnouncementPublications } from '@/components/announcements/announcement-publications';
import { AnnouncementAttachments } from '@/components/announcements/announcement-attachments';
import { RecipientAnnouncements, RecipientAnnouncement } from '@/components/announcements/recipient-announcements';
import { NotificationsWorkspace } from '@/components/notifications/notifications-workspace';
import { NotificationDetail } from '@/components/notifications/notification-detail';
import { NotificationUnreadBadge } from '@/components/notifications/notification-unread-badge';
import { PlatformSchools, PlatformSchool, CreateSchoolForm, AddAdminForm } from '@/components/platform/workspace';
import { getCatalog } from '@/i18n/catalogs';
import { useAnnouncementCopy, useNotificationCopy, useNotificationLabels } from '@/i18n/use-delivery-copy';
import { useDeliveryText } from '@/i18n/use-delivery-text';
import { announcementCopy } from '@/lib/frontend/announcements/copy';
import { notificationCopy } from '@/lib/frontend/notifications/copy';
import { ApiClientError } from '@/lib/frontend/api-client';
import { platformApi } from '@/lib/frontend/platform';
import type { Role } from '@/lib/authorization/roles';
import * as a from '../announcements/test-helpers';
import * as n from '../notifications/test-helpers';

const navigation = vi.hoisted(() => ({ path: '/announcements', search: '', replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  usePathname: () => navigation.path,
  useRouter: () => ({ replace: navigation.replace, push: navigation.push }),
}));
type Locale = (typeof SUPPORTED_LOCALES)[number];
const clients: QueryClient[] = [];
function localized(ui: ReactElement, locale: Locale) {
  return <NextIntlClientProvider locale={locale} messages={getCatalog(locale)} timeZone="UTC">
    <div dir={localeDirection(locale)}>{ui}</div>
  </NextIntlClientProvider>;
}
function view(ui: ReactElement, locale: Locale, role: Role = 'SCHOOL_ADMIN', schoolId: string | null = a.schoolId) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(queryClient);
  const result = render(<QueryClientProvider client={queryClient}>
    <AppContextProvider value={{ user: { id: a.userId }, currentSchool: schoolId ? { id: schoolId, role, timezone: 'UTC' } : null,
      memberships: schoolId ? [{ schoolId, schoolName: 'Original School', role, status: 'ACTIVE' }] : [] }}>
      {localized(ui, locale)}
    </AppContextProvider>
  </QueryClientProvider>);
  return { ...result, queryClient };
}
const translator = (locale: Locale) => createTranslator({ locale, messages: getCatalog(locale) });
const publication = { id: a.publicationId, announcementId: a.announcementId, announcementVersionId: a.versionId,
  publicationVersion: 2, versionNumber: 1, status: 'PUBLISHED' as const, scheduledAt: null,
  publishedAt: '2026-01-01T00:00:00.000Z', publishedBy: a.userId, createdAt: a.timestamps.createdAt, recipientCount: 7 };
const recipient = { id: a.publicationId, announcementId: a.announcementId, publicationVersion: 2, versionNumber: 1,
  title: 'Original publication title', body: 'Original publication body — unchanged', bodyFormat: 'PLAIN_TEXT',
  publishedAt: publication.publishedAt };
const school = { id: a.schoolId, name: 'Original School', status: 'ACTIVE' as const, timezone: 'Africa/Casablanca' };
const admin = { id: 'membership-1', userId: 'original-user', email: 'original@example.test', status: 'ACTIVE' as const, userStatus: 'ACTIVE' as const };

afterEach(() => {
  cleanup(); clients.forEach((client) => client.clear()); clients.length = 0;
  vi.restoreAllMocks(); navigation.path = '/announcements'; navigation.search = '';
  navigation.replace.mockReset(); navigation.push.mockReset();
});
function announcementFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/v1/teachers?')) return Response.json(a.page([], 1, 100));
    if (url.endsWith('/attachments')) return Response.json({ data: [] });
    if (url.startsWith('/api/v1/me/announcements/' + a.publicationId)) return Response.json({ data: recipient });
    if (url.startsWith('/api/v1/me/announcements?')) return Response.json(a.page([recipient]));
    if (url.includes('/academic-years')) return Response.json(a.page([a.year], 1, 100));
    if (url.includes('/classes')) return Response.json(a.page([a.schoolClass], 1, 100));
    if (url.includes('/versions?')) return Response.json(a.page([a.version], 1, 50));
    if (url.includes('/publications?')) return Response.json(a.page([publication], 1, url.includes('pageSize=100') ? 100 : 20));
    if (url.includes('/targets?')) return Response.json({ data: [] });
    if (url === '/api/v1/announcements/' + a.announcementId) return Response.json({ data: a.detail });
    if (url.startsWith('/api/v1/announcements?')) return Response.json(a.page([a.announcement]));
    throw new Error('Unexpected mocked announcement resource');
  });
}
function notificationFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/unread-count')) return Response.json({ data: { count: 2 } });
    if (url.endsWith('/read-all')) return Response.json({ data: { updatedCount: 2 } });
    if (url === '/api/v1/notifications/' + n.notificationId) return Response.json({ data: { ...n.notification, destination: '/announcements/inbox/' + a.publicationId } });
    if (url.startsWith('/api/v1/notifications?')) return Response.json(n.page([n.notification]));
    throw new Error('Unexpected mocked notification resource');
  });
}
function platformReads() {
  vi.spyOn(platformApi, 'list').mockResolvedValue({ data: [school], meta: { total: 1 } });
  vi.spyOn(platformApi, 'school').mockResolvedValue(school);
  vi.spyOn(platformApi, 'admins').mockResolvedValue([admin]);
}

describe.each(SUPPORTED_LOCALES)('%s announcement, notification and platform source', (locale) => {
  it('offers Teacher Inbox and return links even without active authoring assignments', async () => {
    announcementFetch(); const t = translator(locale);
    const management = view(<AnnouncementsWorkspace />, locale, 'TEACHER');
    await screen.findByText(a.version.title);
    const inbox = screen.getByRole('link', { name: t('announcementUi.inbox') });
    expect(inbox).toHaveAttribute('href', '/announcements/inbox');
    expect(inbox).toHaveClass('focus-visible:ring-2');
    expect(screen.queryByRole('button', { name: t('announcementUi.create') })).not.toBeInTheDocument();
    management.unmount(); navigation.path = '/announcements/inbox';
    view(<RecipientAnnouncements />, locale, 'TEACHER');
    expect(await screen.findByRole('link', { name: recipient.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('announcementUi.inbox') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('announcementUi.back') })).toHaveAttribute('href', '/announcements');
  });
  it('/announcements translates UI but retains saved text and filter machine values', async () => {
    announcementFetch(); const t = translator(locale);
    const result = view(<AnnouncementsWorkspace />, locale);
    expect(await screen.findByText(a.version.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('announcementUi.create') })).toBeInTheDocument();
    expect(screen.getAllByText(t('domainEnums.DRAFT')).length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText(t('homework.status')), 'SCHEDULED');
    expect(navigation.replace).toHaveBeenCalledWith('/announcements?status=SCHEDULED&page=1', { scroll: false });
    expect(result.queryClient.getQueryCache().getAll().some((q) => q.queryKey.includes(a.schoolId))).toBe(true);
    expect(result.container.querySelector('[dir="' + localeDirection(locale) + '"]')).toBeTruthy();
  });
  it('/announcements/[id] preserves content, Version and recipient counts', async () => {
    announcementFetch(); const t = translator(locale);
    view(<AnnouncementDetailWorkspace announcementId={a.announcementId} />, locale);
    expect(await screen.findByRole('heading', { name: a.version.title, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(a.version.body).length).toBeGreaterThan(0);
    expect(await screen.findByRole('heading', { name: t('announcementUi.versionHistory') })).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getAllByText(t('domainEnums.PUBLISHED')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: t('announcementUi.back') }).querySelector('.rtl\\:rotate-180')).toBeTruthy();
  });
  it('/announcements/inbox preserves publication identity and original title', async () => {
    announcementFetch(); const t = translator(locale);
    navigation.path = '/announcements/inbox';
    view(<RecipientAnnouncements />, locale, 'PARENT');
    expect(await screen.findByRole('link', { name: recipient.title })).toHaveAttribute('href', '/announcements/inbox/' + a.publicationId);
    expect(screen.getByText(t('deliveryUi.publicationCaption', { publication: 2, version: 1 }), { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t('navigation.items.announcements') })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: t('announcementUi.back') })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: t('announcementUi.inbox') })).not.toBeInTheDocument();
  });
  it('/announcements/inbox/[id] retains exact historical content and timestamp', async () => {
    announcementFetch(); const t = translator(locale);
    view(<RecipientAnnouncement publicationId={a.publicationId} />, locale, 'PARENT');
    expect(await screen.findByRole('heading', { name: recipient.title })).toBeInTheDocument();
    expect(screen.getByText(recipient.body)).toHaveAttribute('dir', 'auto');
    expect(screen.getByText(t('deliveryUi.snapshotHint'))).toBeInTheDocument();
    expect(document.querySelector('time[datetime="' + publication.publishedAt + '"]')).toHaveAttribute('dir', 'ltr');
  });
  it('/notifications translates labels, scoped filters and bulk-read feedback without altering delivery text', async () => {
    notificationFetch(); const t = translator(locale); navigation.path = '/notifications';
    const result = view(<NotificationsWorkspace />, locale, 'PARENT');
    const label = t('deliveryUi.notificationLabel', { state: t('notificationUi.unread'), title: n.notification.title });
    expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    expect(screen.getByText(n.notification.body)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(t('notificationUi.source')), 'RESULT_PUBLICATION');
    expect(navigation.replace).toHaveBeenCalledWith('/notifications?sourceType=RESULT_PUBLICATION&page=1', { scroll: false });
    await userEvent.click(screen.getByRole('button', { name: t('notificationUi.markAllRead') }));
    expect(await screen.findByRole('status')).toHaveTextContent(t('notificationUi.markedAllRead', { count: 2 }));
    expect(result.queryClient.getQueryCache().getAll().some((q) => q.queryKey.includes(a.schoolId))).toBe(true);
  });
  it('/platform/schools localizes actions while preserving school name, URL and timezone', async () => {
    platformReads(); const t = translator(locale);
    view(<PlatformSchools />, locale);
    expect(await screen.findByRole('link', { name: school.name })).toHaveAttribute('href', '/platform/schools/' + school.id);
    expect(screen.getByText(school.timezone)).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('button', { name: t('platformUi.create') })).toBeInTheDocument();
  });
  it('/platform/schools/[schoolId] retains scoped membership payloads and recovery navigation', async () => {
    platformReads(); const status = vi.spyOn(platformApi, 'status').mockResolvedValue({});
    const t = translator(locale); view(<PlatformSchool schoolId={school.id} />, locale);
    const label = t('platformUi.adminAction', { action: t('domainUi.deactivate'), email: admin.email });
    await userEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(status).toHaveBeenCalledWith(school.id, admin.id, 'INACTIVE'));
    expect(screen.getByText(admin.email)).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('link', { name: t('platformUi.recoveryLink') })).toHaveAttribute('href', '/auth/recover');
    expect(await screen.findByText(t('platformUi.membershipUpdated'))).toBeInTheDocument();
  });
  it('translates notification detail and preserves destination and original content', async () => {
    notificationFetch(); const t = translator(locale);
    view(<NotificationDetail schoolId={a.schoolId} notificationId={n.notificationId} onClose={vi.fn()} />, locale);
    expect(await screen.findByText(n.notification.body)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('deliveryUi.announcementLink') })).toHaveAttribute('href', '/announcements/inbox/' + a.publicationId);
  });
  it('retains machine values in target selection with translated audience labels', async () => {
    announcementFetch(); const t = translator(locale);
    view(<AnnouncementTargets schoolId={a.schoolId} announcementId={a.announcementId} version={a.version} years={[a.year]} classes={[a.schoolClass]} editable />, locale);
    const audience = screen.getByLabelText(t('announcementUi.audience'));
    await userEvent.selectOptions(audience, 'TEACHERS');
    expect(audience).toHaveValue('TEACHERS');
    expect(screen.getByRole('option', { name: t('deliveryUi.TEACHERS') })).toHaveValue('TEACHERS');
    expect(screen.getByRole('option', { name: t('deliveryUi.SCHOOL') })).toHaveValue('SCHOOL');
  });
  it('keeps authoring inaccessible to Parents and disables queries without a school', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    view(<AnnouncementsWorkspace />, locale, 'PARENT');
    expect(screen.queryByRole('button', { name: translator(locale)('announcementUi.create') })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    cleanup();
    view(<NotificationsWorkspace />, locale, 'PARENT', null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps published/cancelled history immutable and hides scheduled controls for read-only access', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(a.page([{ ...publication, status: 'CANCELLED' }])));
    const t = translator(locale);
    view(<AnnouncementPublications schoolId={a.schoolId} announcementId={a.announcementId} versions={[a.version]} canPublish={false} />, locale);
    expect(await screen.findByText(t('deliveryUi.CANCELLED'))).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('deliveryUi.cancelNumber', { number: 2 }) })).not.toBeInTheDocument();
  });
  it('preserves attachment filename/download identity and uses localized removal/size copy', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [{ id: 'file-1', name: 'Original_ملف.pdf', mediaType: 'application/pdf', byteSize: 1024, state: 'READY' }] }));
    const t = translator(locale);
    view(<AnnouncementAttachments announcementId={a.announcementId} versionId={a.versionId} editable />, locale);
    expect(await screen.findByRole('link', { name: 'Original_ملف.pdf' })).toHaveAttribute('download');
    expect(screen.getByRole('button', { name: t('deliveryUi.removeName', { name: 'Original_ملف.pdf' }) })).toBeInTheDocument();
    expect(screen.getByText(t('domainUi.size', { size: 1 }))).toBeInTheDocument();
  });
  it('localizes validation without submitting invalid announcement content', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch'); const t = translator(locale);
    view(<AnnouncementForm schoolId={a.schoolId} onCancel={vi.fn()} />, locale);
    await userEvent.click(screen.getByRole('button', { name: t('announcementUi.create') }));
    expect(await screen.findByText(t('deliveryUi.bodyRequired'))).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserves school creation input and LTR timezone while translating validation', async () => {
    const create = vi.spyOn(platformApi, 'create').mockResolvedValue(school);
    const t = translator(locale); view(<CreateSchoolForm onSaved={async () => {}} onCancel={vi.fn()} />, locale);
    await userEvent.click(screen.getByRole('button', { name: t('platformUi.create') }));
    await waitFor(() => expect(screen.getByLabelText(t('platformUi.schoolName'), { exact: false })).toHaveAttribute('aria-invalid', 'true'));
    expect(create).not.toHaveBeenCalled();
    const timezone = screen.getByLabelText(t('platformUi.timezone'), { exact: false });
    expect(timezone).toHaveAttribute('dir', 'ltr');
    await userEvent.type(screen.getByLabelText(t('platformUi.schoolName'), { exact: false }), 'Untranslated School');
    await userEvent.click(screen.getByRole('button', { name: t('platformUi.create') }));
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'Untranslated School', timezone: 'UTC' }, expect.anything()));
  });
  it.each([
    ['ACCOUNT_ROLE_CONFLICT', 'platformUi.roleConflict'],
    ['ACCOUNT_PROVISIONING_COMPENSATION_REQUIRED', 'platformUi.compensation'],
    ['ACCOUNT_IDENTITY_RECONCILIATION_REQUIRED', 'platformUi.identity'],
  ] as const)('preserves %s classification, no-retry behavior and provider privacy', async (code, message) => {
    const invite = vi.spyOn(platformApi, 'invite').mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', featureCode: code, message: 'private-provider-details' }));
    const t = translator(locale); view(<AddAdminForm schoolId={school.id} />, locale);
    await userEvent.type(screen.getByLabelText(t('platformUi.adminEmail'), { exact: false }), 'new@example.test');
    await userEvent.click(screen.getByRole('button', { name: t('platformUi.invite') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t(message));
    expect(invite).toHaveBeenCalledTimes(1);
    expect(invite).toHaveBeenCalledWith(school.id, { email: 'new@example.test' });
    expect(screen.queryByText('private-provider-details')).not.toBeInTheDocument();
  });
  it.each(['INVITED', 'LINKED', 'ALREADY_LINKED'] as const)('keeps %s invitation state and email unchanged', async (state) => {
    const invite = vi.spyOn(platformApi, 'invite').mockResolvedValue({ state });
    const t = translator(locale); view(<AddAdminForm schoolId={school.id} />, locale);
    await userEvent.type(screen.getByLabelText(t('platformUi.adminEmail'), { exact: false }), admin.email);
    expect(screen.getByLabelText(t('platformUi.adminEmail'), { exact: false })).toHaveAttribute('dir', 'ltr');
    await userEvent.click(screen.getByRole('button', { name: t('platformUi.invite') }));
    expect(await screen.findByRole('status')).toHaveTextContent(t(state === 'INVITED' ? 'platformUi.invited' : 'platformUi.linked'));
    expect(invite).toHaveBeenCalledWith(school.id, { email: admin.email });
  });
  it('reuses existing localized unread badge accessibility and Arabic plural branches', async () => {
    notificationFetch(); const t = translator(locale);
    view(<NotificationUnreadBadge />, locale, 'PARENT');
    expect(await screen.findByRole('link', { name: t('notificationBadge.unread', { count: 2 }) })).toHaveAttribute('href', '/notifications');
    for (const count of [0, 1, 2, 3, 11, 100]) {
      expect(t('notificationUi.markedAllRead', { count })).not.toMatch(/[{}]/);
      expect(t('notificationUi.unreadCount', { count })).not.toMatch(/[{}]/);
    }
  });
  it('prevents duplicate invitations while showing the localized pending action', async () => {
    let finish: ((value: { state: 'INVITED' }) => void) | undefined;
    const invite = vi.spyOn(platformApi, 'invite').mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const t = translator(locale); view(<AddAdminForm schoolId={school.id} />, locale);
    await userEvent.type(screen.getByLabelText(t('platformUi.adminEmail'), { exact: false }), admin.email);
    await userEvent.dblClick(screen.getByRole('button', { name: t('platformUi.invite') }));
    expect(screen.getByRole('button', { name: t('platformUi.saving') })).toBeDisabled();
    expect(invite).toHaveBeenCalledTimes(1);
    await act(async () => { if (finish) finish({ state: 'INVITED' }); });
    expect(await screen.findByRole('status')).toHaveTextContent(t('platformUi.invited'));
  });
  it('keeps Teacher target choices within assigned Classes with machine-valued options', async () => {
    announcementFetch(); const t = translator(locale);
    view(<AnnouncementTargets schoolId={a.schoolId} announcementId={a.announcementId} version={a.version}
      years={[a.year]} classes={[a.schoolClass, { ...a.schoolClass, id: 'unassigned', name: 'Unassigned Class' }]}
      teacherClassIds={new Set([a.classId])} editable />, locale, 'TEACHER');
    expect(screen.queryByRole('option', { name: t('deliveryUi.SCHOOL') })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(t('homework.academicYear')), a.yearId);
    expect(screen.getByRole('option', { name: a.schoolClass.name })).toHaveValue(a.classId);
    expect(screen.queryByRole('option', { name: 'Unassigned Class' })).not.toBeInTheDocument();
  });
  it('renders localized notification emptiness and hides controls after platform denial', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => String(input).endsWith('/unread-count')
      ? Response.json({ data: { count: 0 } }) : Response.json(n.page([])));
    const t = translator(locale); view(<NotificationsWorkspace />, locale, 'PARENT');
    expect(await screen.findByRole('heading', { name: t('notificationUi.empty') })).toBeInTheDocument();
    cleanup();
    vi.spyOn(platformApi, 'list').mockRejectedValue(new ApiClientError(403, { code: 'FORBIDDEN', message: 'private-denial' }));
    view(<PlatformSchools />, locale);
    expect(await screen.findByText(t('platformUi.denied'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('platformUi.create') })).not.toBeInTheDocument();
    expect(screen.queryByText('private-denial')).not.toBeInTheDocument();
  });
});

it('retains legacy English copy adapter keys, except the corrected attachment guidance', () => {
  const { result } = renderHook(() => ({ announcements: useAnnouncementCopy(), notifications: useNotificationCopy(), labels: useNotificationLabels(), text: useDeliveryText() }), {
    wrapper: ({ children }) => <NextIntlClientProvider locale="en" messages={getCatalog('en')} timeZone="UTC">{children}</NextIntlClientProvider>,
  });
  expect(Object.keys(result.current.announcements).sort()).toEqual(Object.keys(announcementCopy).sort());
  for (const [key, value] of Object.entries(announcementCopy)) {
    if (key === 'plainText') continue;
    expect(Reflect.get(result.current.announcements, key), key).toEqual(value);
  }
  expect(result.current.announcements.plainText).toContain('Private attachments are managed separately.');
  for (const [key, value] of Object.entries(notificationCopy)) {
    if (typeof value !== 'function') expect(Reflect.get(result.current.notifications, key), key).toEqual(value);
  }
  expect(result.current.labels.notificationSourceLabels.RESULT_PUBLICATION).toBe('Result');
  expect(result.current.text('unexpected internal failure')).toBe(getCatalog('en').domainUi.invalid);
});
