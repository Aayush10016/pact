import { SellerProfile } from '../../../../components/seller-reviews';
export default async function Seller({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SellerProfile id={id} />;
}
