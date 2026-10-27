import {screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {AcademicWorkspace} from '@/components/academic/academic-workspace';
import {ClassForm} from '@/components/academic/forms';
import {page,renderAcademic,yearId,stageId,levelId,curriculumId,versionId,timestamps} from './test-helpers';
const navigation=vi.hoisted(()=>({query:'',replace:vi.fn()}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(navigation.query),usePathname:()=>'/academic',useRouter:()=>({replace:navigation.replace})}));
afterEach(()=>{vi.restoreAllMocks();navigation.query='';navigation.replace.mockReset();});
const year={id:yearId,name:'2026/2027',status:'ACTIVE',startDate:'2026-09-01',endDate:'2027-06-30',...timestamps};
it('offers exactly four areas and retains explicit year when navigating to Classes',async()=>{
 navigation.query=`section=years&yearId=${yearId}`;
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>Response.json(String(input).includes('/periods')?page([]):String(input).includes('page=')?page([year]):{data:year}));
 renderAcademic(<AcademicWorkspace />);
 expect(await screen.findByRole('heading',{name:'Academic Planning'})).toBeInTheDocument();
 expect(screen.getByRole('navigation',{name:'Academic structure sections'}).querySelectorAll('button')).toHaveLength(4);
 await userEvent.click(screen.getByRole('button',{name:'Classes Year · Level · Curriculum'}));
 expect(navigation.replace).toHaveBeenCalledWith(`/academic?section=classes&yearId=${yearId}&page=1`,{scroll:false});
});
it('restores named curriculum/version and coefficients from shared URL context',async()=>{
 navigation.query=`section=curricula&curriculumId=${curriculumId}&versionId=${versionId}`;
 const curriculum={id:curriculumId,name:'National',status:'ACTIVE',...timestamps};
 const version={id:versionId,curriculumId,name:'2026-2027',status:'ACTIVE',...timestamps};
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{const u=new URL(String(input),'http://local');const path=u.pathname;
 if(path===`/api/v1/curricula/${curriculumId}`)return Response.json({data:curriculum});
 if(path===`/api/v1/curriculum-versions/${versionId}`)return Response.json({data:version});
 if(path.endsWith('/versions'))return Response.json(page([version]));
 if(path.includes('/subjects'))return Response.json(page([]));
 return Response.json(page([curriculum]));});
 renderAcademic(<AcademicWorkspace />);
 expect(await screen.findByRole('heading',{name:'Version subjects — 2026-2027'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Attach subject'})).not.toBeInTheDocument();
});
it('requires explicit year but preselects the user selected year for new Class forms',async()=>{
 const props={years:[year],levels:[{id:levelId,stageId,name:'Year1',sequence:1,status:'ACTIVE' as const,...timestamps}],tracks:[],versions:[{id:versionId,curriculumId,curriculumName:'National',name:'V1',status:'ACTIVE' as const,...timestamps}],onCancel:vi.fn(),onSaved:vi.fn()};
 renderAcademic(<ClassForm {...props} years={[{...year,status:'ACTIVE'}]} defaultYearId={yearId} />);
 await waitFor(()=>expect(screen.getByLabelText('Academic year')).toHaveValue(yearId));
});
