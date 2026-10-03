// PRD-001 §5 Loading: a spinner, not a skeleton (row heights vary).
export default function Loading() {
  return (
    <div className="state" aria-busy="true">
      <span className="spinner" aria-label="Loading" />
    </div>
  );
}
