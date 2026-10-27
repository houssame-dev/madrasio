import { ChildReceipt } from '@/components/finance/child-tuition';
export default async function Page({params}:{params:Promise<{studentId:string;paymentId:string}>}) {
  const {studentId,paymentId}=await params;return <ChildReceipt studentId={studentId} paymentId={paymentId} />;
}
