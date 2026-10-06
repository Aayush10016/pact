import Link from 'next/link';
import { FileText, ArrowUpRight } from 'lucide-react';
export default function Activity(){return <><div className="page-heading"><div><p className="eyebrow">A RECORD YOU CAN FOLLOW.</p><h1>Every step, in context.</h1><p className="muted">Illustrative workspace activity. Real audit records arrive in Phase 2.</p></div></div><div className="activity-list">{[
  ['Oct 6, 2026','Final identity package shared','Maya Chen','brand-identity','Fieldwork brand identity'],
  ['Oct 5, 2026','Homepage milestone marked in progress','Oliver Reed','studio-website','Studio website'],
  ['Oct 5, 2026','Additional delivery evidence requested','Jamie Cooper','product-photography','Autumn collection'],
  ['Oct 2, 2026','Project brief agreed','Jamie Cooper','brand-identity','Fieldwork brand identity'],
].map(([date,action,person,id,title])=><article key={`${date}-${action}`}><span className="mono">{date}</span><FileText size={20}/><div><h2>{action}</h2><p>{person} · {title} · Sample record</p></div><Link href={`/workspace/pacts/${id}`} aria-label={`Open ${title}`}><ArrowUpRight size={20}/></Link></article>)}</div></>;}
