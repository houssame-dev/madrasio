import { FeaturePlaceholder } from '@/components/app/feature-placeholder';
import { copy } from '@/lib/frontend/copy';

export default function StudentsPage() {
  return <FeaturePlaceholder title={copy.students} permission="students.read" roles={['SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER']} />;
}
