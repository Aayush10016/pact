import { notFound } from 'next/navigation';
import { demoPacts } from '@pact/shared';
import { PactDetail } from '../../../../components/pact-detail';
export async function generateMetadata({ params }: { params: Promise<{id:string}> }) { const {id}=await params; return { title: demoPacts.find(p=>p.id===id)?.title ?? 'Pact not found' }; }
export default async function Detail({ params }: { params: Promise<{id:string}> }) { const {id}=await params; const pact=demoPacts.find(p=>p.id===id); if(!pact)notFound(); return <PactDetail pact={pact}/>; }
