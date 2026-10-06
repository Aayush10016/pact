import type { Metadata } from 'next';
import { DraftForm } from '../../../components/draft-form';
export const metadata: Metadata = { title: 'Draft a pact' };
export default function NewPact() {
  return <DraftForm />;
}
