import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { getCatalog } from '../i18n/catalogs';
import { builderFixture, tid } from '../__tests__/timetable/builder-fixture';
import { publishedFixture } from '../__tests__/timetable/publication-fixture';
import { searchCategories, searchQuerySchema, type SearchRecord } from '../lib/modules/search/contracts';
type Role = 'SCHOOL_ADMIN' | 'TEACHER' | 'PARENT';
const person = { id: tid(37), firstName: 'Amine', lastName: 'Benali', studentCode: 'S-42', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
async function fixture(context: BrowserContext, baseURL: string, role: Role) {
  const f = { fail: false, delay: 0, calls: [] as string[], unexpected: [] as string[], role, schoolId: tid(1), multiple: false, expired: false, signedOut: false };
  const me = () => ({ user: { id: tid(14) }, currentSchool: { id: f.schoolId, role: f.role, timezone: 'UTC' }, memberships: [{ schoolId: tid(1), schoolName: 'Local Search School', role, status: 'ACTIVE' }, ...(f.multiple ? [{ schoolId: tid(99), schoolName: 'Second Local School', role: 'PARENT', status: 'ACTIVE' }] : [])] });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()); if (url.origin !== new URL(baseURL).origin) return route.abort();
    if (!url.pathname.startsWith('/api/v1/')) return route.continue();
    let data: unknown;
    if (url.pathname === '/api/v1/me') {
      if (f.signedOut) return route.fulfill({ status:401,json:{error:{code:'UNAUTHENTICATED',message:'Authentication required.'}} });
      data = me();
    }
    else if (url.pathname === '/api/v1/me/current-school') { expect(route.request().postDataJSON()).toEqual({schoolId:tid(99)}); f.schoolId=tid(99);f.role='PARENT';data=me(); }
    else if (url.pathname === '/api/v1/auth/logout') {f.signedOut=true;data={signedOut:true};}
    else if (url.pathname === '/api/v1/dashboard/context') data = { date: '2026-10-28', timezone: 'UTC', academicYear: null };
    else if (url.pathname === '/api/v1/notifications/unread-count') data = { count: 0 };
    else if (url.pathname === '/api/v1/search') {
      const { q, category } = searchQuerySchema.parse(Object.fromEntries(url.searchParams)); f.calls.push(url.search);
      if(f.expired) return route.fulfill({status:401,json:{error:{code:'UNAUTHENTICATED',message:'Authentication required.'}}});
      if (f.delay) await new Promise(resolve => setTimeout(resolve, f.delay));
      if (f.fail) return route.fulfill({ status: 503, json: { error: { code: 'INTERNAL_ERROR', message: 'Safe unavailable' } } });
      const rows: SearchRecord[] = searchCategories(f.role).flatMap(value => {
        if(f.schoolId===tid(99)) return [];
        if (category !== 'all' && category !== value) return [];
        const name = value === 'classes' ? 'Class A' : 'Amine Benali';
        if (!name.toLowerCase().includes(q.toLowerCase()) && q !== 'Long') return [];
        return [{ id: value === 'classes' ? tid(4) : tid(37), category: value, name: q === 'Long' ? 'اسم طويل جداً Établissement — '+ 'long '.repeat(22) : name, detail: value === 'classes' ? '2025/2026' : 'S-42', href: value === 'classes' ? `/academic?section=classes&yearId=${tid(2)}&search=Class+A` : `/${value === 'children' ? 'children' : value}/${tid(37)}` }];
      });
      return route.fulfill({ json: { data: rows, scope: { userId: tid(14), schoolId: f.schoolId, role:f.role } } });
    }
    else if (url.pathname === '/api/v1/timetable') data = builderFixture().state;
    else if (url.pathname === '/api/v1/timetable/published') data = publishedFixture(role);
    else if (url.pathname === `/api/v1/students/${tid(37)}`) data = person;
    else if (url.pathname === '/api/v1/academic-years' || url.pathname === '/api/v1/classes' || url.pathname === `/api/v1/students/${tid(37)}/enrollments`) return route.fulfill({ json: { data: [], meta: { page: 1, pageSize: 100, total: 0 } } });
    else if (url.pathname === '/api/v1/me/parent-profiles') data = f.schoolId===tid(99)?[]:[{ parent: { id: tid(39), firstName: 'Local', lastName: 'Parent', status: 'ACTIVE' }, children: [{ relationshipId: tid(40), student: person }] }];
    else if (url.pathname === `/api/v1/parent/children/${tid(37)}/academic-years`) data = [];
    else if (url.pathname === `/api/v1/parent/children/${tid(37)}/tuition`) data = { currency: 'MAD', today: '2026-10-28', studentId: tid(37), summary: { netCents: 0, paidCents: 0, outstandingCents: 0 }, charges: [], payments: [], chargeTotal: 0, paymentTotal: 0, page: 1 };
    else { f.unexpected.push(url.pathname); return route.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR', message: 'Unexpected fixture request' } } }); }
    await route.fulfill({ json: { data } });
  });
  return f;
}
async function measure(page: Page) {
  return page.locator('.global-search-popup').evaluate(root => {
    const color = (v: string) => (v.match(/[\d.]+/g) ?? []).map(Number);
    const over = (a: number[], b: number[]) => [0, 1, 2].map(i => a[i] * (a[3] ?? 1) + b[i] * (1 - (a[3] ?? 1)));
    const bg = (e: Element | null): number[] => e ? over(color(getComputedStyle(e).backgroundColor), bg(e.parentElement)) : [255,255,255];
    const lum = (v: number[]) => v.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
    const rows = Array.from(root.querySelectorAll('*')).filter(e=>e.getBoundingClientRect().width && Array.from(e.childNodes).some(n=>n.nodeType===Node.TEXT_NODE && n.textContent?.trim())).map(e=>{const a=lum(color(getComputedStyle(e).color)),b=lum(bg(e));return{text:e.textContent?.trim().slice(0,60),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
    return { rows, overflow: document.documentElement.scrollWidth > innerWidth + 1, popupOverflow: root.scrollWidth > root.clientWidth + 1, background: getComputedStyle(root).backgroundColor };
  });
}
for (const locale of ['en', 'fr', 'ar'] as const) for (const role of ['SCHOOL_ADMIN', 'TEACHER', 'PARENT'] as const) for (const width of [390, 1440]) test(`Global search ${locale} ${role} ${width}: themes, keyboard, filters and authorized destination`, async ({ page, context, baseURL }, info) => {
  const t = getCatalog(locale).globalSearch, f = await fixture(context, baseURL!, role), errors: string[] = [];
  page.on('pageerror', e=>errors.push(e.message)); await page.setViewportSize({ width, height: 900 });
  await writeFile(info.outputPath('case.json'),JSON.stringify({locale,role,width},null,2));
  await context.addCookies([{ name: 'MADRASIO_LOCALE', value: locale, url: baseURL! }]); await page.goto('/timetable');
  const trigger = page.getByRole('button', { name: t.open, exact: true }); await expect(trigger).toBeVisible();
  await page.screenshot({ path: info.outputPath('navbar.png'), fullPage: true });
  await page.keyboard.press('Control+k'); const dialog = page.getByRole('dialog'), input = dialog.getByRole('combobox');
  await expect(input).toBeFocused(); await expect(dialog).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  expect(f.calls).toHaveLength(0);
  for (const theme of ['light','mist','midnight','dark']) {
    await page.evaluate(theme=>{localStorage.setItem('madrasio-theme',theme);window.dispatchEvent(new StorageEvent('storage',{key:'madrasio-theme',newValue:theme}));},theme); await page.waitForTimeout(350);
    const metrics = await measure(page); expect(metrics.overflow).toBe(false); expect(metrics.popupOverflow).toBe(false); expect(metrics.rows.filter(v=>v.ratio<4.5)).toEqual([]);
    expect(metrics.background).toBe(({light:'rgb(255, 255, 255)',mist:'rgb(229, 229, 229)',midnight:'rgb(20, 33, 61)',dark:'rgb(0, 0, 0)'} as Record<string,string>)[theme]);
    await writeFile(info.outputPath(`initial-${theme}.json`),JSON.stringify(metrics,null,2)); await page.screenshot({ path: info.outputPath(`initial-${theme}.png`) });
  }
  await page.evaluate(theme=>{localStorage.setItem('madrasio-theme',theme);window.dispatchEvent(new StorageEvent('storage',{key:'madrasio-theme',newValue:theme}));},locale==='ar'?'midnight':'light'); await page.waitForTimeout(350);
  await input.fill('A'); await input.fill('Am'); await input.fill('Amine'); await expect(dialog.getByRole('option').first()).toContainText('Amine Benali'); expect(f.calls).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('records.png') });
  const filters = dialog.getByRole('group', { name: t.filters });
  await expect(filters.getByRole('button')).toHaveCount(role==='SCHOOL_ADMIN'?6:role==='TEACHER'?4:3);
  if(role==='SCHOOL_ADMIN') {
    await filters.getByRole('button',{name:t.classes,exact:true}).click();await input.fill('Class'); await expect(dialog.getByRole('option')).toContainText('Class A'); await page.screenshot({path:info.outputPath('classes.png')});
  }
  await filters.getByRole('button',{name:t.all,exact:true}).click();
  f.delay=700; await input.fill('no-match'); await expect(dialog.getByRole('status')).toContainText(t.loading);await page.screenshot({path:info.outputPath('loading.png')});
  await expect(dialog.getByText(t.empty,{exact:true})).toBeVisible(); await page.screenshot({path:info.outputPath('empty.png')});
  f.delay=0; f.fail=true; await input.fill('Amine');await expect(dialog.getByRole('alert')).toContainText(t.error);await page.screenshot({path:info.outputPath('error.png')});
  f.fail=false;await dialog.getByRole('button',{name:t.retry,exact:true}).click();await expect(dialog.getByRole('option').first()).toContainText('Amine Benali');
  await input.fill('Long');await expect(dialog.getByRole('option').first()).toContainText('Établissement');
  for(const size of [320,390,768,1024,1440]) {await page.setViewportSize({width:size,height:900});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(size); expect((await measure(page)).popupOverflow).toBe(false);}
  await page.setViewportSize({width,height:900});await input.fill('Amine');await expect(dialog.getByRole('option').first()).toContainText('Amine Benali');
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');await page.screenshot({path:info.outputPath('selected.png')});
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();await page.screenshot({path:info.outputPath('navbar-final.png')});await trigger.click();await expect(input).toHaveValue('');
  await input.fill('Amine');await expect(dialog.getByRole('option').first()).toContainText('Amine Benali');await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/${role==='PARENT'?'children':'students'}/${tid(37)}$`));
  await expect(page.getByRole('heading',{name:'Amine Benali',exact:true,level:1})).toBeVisible();
  expect(f.unexpected).toEqual([]);expect(errors).toEqual([]);
});

test('Search ignores late transport responses and clears results after an expired session', async ({page,context,baseURL})=>{
  const f=await fixture(context,baseURL!,'TEACHER'),t=getCatalog('en').globalSearch;
  await page.goto('/timetable');await page.getByRole('button',{name:t.open,exact:true}).click();const dialog=page.getByRole('dialog'),input=dialog.getByRole('combobox');
  f.delay=1200;await input.fill('Amine');await expect.poll(()=>f.calls.length).toBe(1);
  f.delay=0;await input.fill('unmatched');await expect(dialog.getByText(t.empty,{exact:true})).toBeVisible();
  await page.waitForTimeout(1300);await expect(dialog.getByRole('option')).toHaveCount(0);
  await input.fill('Amine');await expect(dialog.getByRole('option')).toContainText('Amine Benali');
  f.expired=true;await input.fill('Amine next');await expect(dialog.getByRole('alert')).toContainText(t.error);await expect(dialog.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');await page.keyboard.press('Control+k');await expect(input).toHaveValue('');expect(f.unexpected).toEqual([]);
});

test('Search stays isolated through the actual School switch workflow, profile and logout',async({page,context,baseURL})=>{
  const f=await fixture(context,baseURL!,'SCHOOL_ADMIN'),t=getCatalog('en').globalSearch;f.multiple=true;
  await page.goto('/timetable');await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();
  await page.getByRole('button',{name:t.open,exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('combobox').fill('Amine');await expect(dialog.getByRole('option').first()).toContainText('Amine Benali');await page.keyboard.press('Escape');
  await page.locator('.ws-profile-trigger').click();await expect(page.locator('.ws-school-identity')).toContainText('Local Search School');
  await page.getByLabel(getCatalog('en').workspace.switchSchool,{exact:true}).selectOption(tid(99));await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button',{name:t.open,exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('combobox')).toHaveValue('');
  await expect(dialog.getByRole('group',{name:t.filters}).getByRole('button')).toHaveCount(3);await dialog.getByRole('combobox').fill('Amine');await expect(dialog.getByText(t.empty,{exact:true})).toBeVisible();await expect(dialog.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');await page.locator('.ws-profile-trigger').click();await expect(page.locator('.ws-school-identity')).toContainText('Second Local School');
  await page.getByRole('button',{name:getCatalog('en').auth.logout,exact:true}).click();await expect(page).toHaveURL(/\/login$/);await expect(page.locator('.global-search-trigger')).toHaveCount(0);expect(f.signedOut).toBe(true);expect(f.unexpected).toEqual([]);
});

test('Mobile search preserves drawer, notification trigger and dialog focus boundaries',async({page,context,baseURL})=>{
  await fixture(context,baseURL!,'TEACHER');await page.setViewportSize({width:320,height:844});await page.goto('/timetable');
  await page.getByTestId('mobile-navigation-trigger').click();const drawer=page.getByRole('dialog',{name:'Main navigation'});await expect(drawer).toBeVisible();await drawer.getByRole('button',{name:'Close navigation',exact:true}).click();
  const trigger=page.getByRole('button',{name:'Search Madrasio',exact:true});await trigger.click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(dialog.locator(':focus')).toHaveCount(1);await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
  await expect(page.locator('header').getByRole('link',{name:/notification/i})).toBeVisible();
});
