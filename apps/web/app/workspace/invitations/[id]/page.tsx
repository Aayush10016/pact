import { InvitationView } from '../../../../components/invitation-view';
export default async function Invitation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvitationView id={id} />;
}
