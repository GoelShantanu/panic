import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="state">
      <h2>Page not found</h2>
      <p>
        It may have moved or never existed. <Link href="/">Back to the stream</Link>
      </p>
    </div>
  );
}
