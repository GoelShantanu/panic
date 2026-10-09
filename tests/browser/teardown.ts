export default async function teardown() {
  const response = await fetch('http://127.0.0.1:3102/__test/cleanup', { method: 'POST', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Browser fixture database cleanup failed');
}
