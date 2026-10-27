import { act,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach,expect,it,vi } from 'vitest';
import { ParentDailyWorkspace } from '@/components/parent/parent-daily-workspace';
import { resolveParentYear } from '@/lib/frontend/parent-portal/dashboard-types';
import { renderParents } from '../parents/test-helpers';
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',yearId='33333333-3333-4333-8333-333333333333';
const children=[{id:first,firstName:'First',lastName:'Child',studentCode:null},{id:second,firstName:'Second',lastName:'Child',studentCode:null}];
const year={id:yearId,name:'Current year',status:'ACTIVE' as const,startDate:'2020-01-01',endDate:'2035-12-31'};
afterEach(()=>vi.restoreAllMocks());
function fixture({ambiguous=false,delaySecond=false}={}) {
  let release:((value:Response)=>void)|undefined;
  const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
    const url=String(input),id=url.includes(second)?second:first;
    if(url.endsWith('/academic-years'))return Response.json({data:ambiguous?[year,{...year,id:second,name:'Other year'}]:[year]});
    if(url.includes('/placement?'))return Response.json({data:null});
    if(url.includes('/dashboard?')){
      const data={date:'2026-10-24',timezone:'UTC',asOf:'2026-10-24T10:00:00Z',from:'2026-10-18',through:'2026-10-31',upcomingCount:1,absenceRecords:0,homework:[{id,title:id===first?'FIRST PRIVATE HOMEWORK':'SECOND PRIVATE HOMEWORK',description:'Instructions',dueDate:'2026-10-26',status:'PUBLISHED',subjectName:'Math',periodName:'Term'}]};
      if(delaySecond&&id===second)return new Promise<Response>(resolve=>{release=()=>resolve(Response.json({data}));});
      return Response.json({data});
    }
    return Response.json({data:[],meta:{page:1,pageSize:2,total:0}});
  });
  return {fetcher,release:()=>release?.(Response.json({}))};
}
it('removes old child records immediately during switching, with separate keyed reads and no write controls',async()=>{
  const f=fixture({delaySecond:true});renderParents(<ParentDailyWorkspace linkedChildren={children} />,'PARENT');
  await screen.findByText('FIRST PRIVATE HOMEWORK');await userEvent.selectOptions(screen.getByRole('combobox',{name:'Choose a child'}),second);
  expect(screen.queryByText('FIRST PRIVATE HOMEWORK')).not.toBeInTheDocument();
  await waitFor(()=>expect(f.fetcher.mock.calls.some(([url])=>String(url).includes(second+'/dashboard'))).toBe(true));
  await act(async()=>{f.release();});await screen.findByText('SECOND PRIVATE HOMEWORK');
  expect(screen.queryByText('FIRST PRIVATE HOMEWORK')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/save|submit|record|publish|pay/i})).not.toBeInTheDocument();
  expect(f.fetcher.mock.calls.every(([url,init])=>!String(url).includes('/finance')&&!init?.method)).toBe(true);
});
it('does not invent a year for ambiguous contexts and starts child reads only after explicit choice',async()=>{
  const f=fixture({ambiguous:true});renderParents(<ParentDailyWorkspace linkedChildren={[children[0]]} />,'PARENT');
  await screen.findByText(/No year has been assumed/);expect(screen.queryByRole('combobox',{name:'Choose a child'})).not.toBeInTheDocument();
  expect(f.fetcher.mock.calls.some(([url])=>String(url).includes('/dashboard?')||String(url).includes('/results?'))).toBe(false);
  await userEvent.selectOptions(screen.getByRole('combobox',{name:'Academic year'}),yearId);await screen.findByText('FIRST PRIVATE HOMEWORK');
});
it('resolves only date-effective eligible active years or a valid explicit selection',()=>{
  expect(resolveParentYear([year],'2026-10-24')).toBe(yearId);
  expect(resolveParentYear([year,{...year,id:second}],'2026-10-24')).toBe('');
  expect(resolveParentYear([{...year,startDate:'2030-01-01'}],'2026-10-24')).toBe('');
  expect(resolveParentYear([{...year,status:'CLOSED'}],'2026-10-24',yearId)).toBe(yearId);
  expect(resolveParentYear([], '2026-10-24',yearId)).toBe('');
});
