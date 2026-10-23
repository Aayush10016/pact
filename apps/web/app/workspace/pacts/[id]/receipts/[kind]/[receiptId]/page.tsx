import { FinancialReceiptView } from '../../../../../../../components/financial-receipt';
export const metadata = { title: 'Confirmed financial receipt' };
export default async function Receipt({
  params,
}: {
  params: Promise<{ id: string; kind: string; receiptId: string }>;
}) {
  const { id, kind, receiptId } = await params;
  return <FinancialReceiptView pactId={id} kind={kind} receiptId={receiptId} />;
}
