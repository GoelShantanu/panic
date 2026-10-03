'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="state" role="alert">
      <h2>Something went wrong</h2>
      <p>This page could not load. Nothing you did caused this.</p>
      <button type="button" className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
