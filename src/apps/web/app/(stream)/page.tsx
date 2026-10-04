import { StreamScreen } from '../../site/stream/StreamScreen.tsx';
import { parseQuery } from '../../site/stream/logic.ts';

export default async function StreamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <StreamScreen query={parseQuery(await searchParams)} />;
}
