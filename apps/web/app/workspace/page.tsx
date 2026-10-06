import type { Metadata } from 'next';
import { WorkspaceView } from '../../components/workspace-view';
export const metadata: Metadata = { title: 'Your pacts' };
export default function Workspace() { return <WorkspaceView />; }
