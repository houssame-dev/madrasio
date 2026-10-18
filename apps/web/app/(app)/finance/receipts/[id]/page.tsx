import { PaymentReceipt } from '@/components/finance/payment-receipt';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <PaymentReceipt id={(await params).id} />;
}
