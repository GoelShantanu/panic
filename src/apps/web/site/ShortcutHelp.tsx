'use client';

const ROWS: [string, string][] = [
  ['J / ↓', 'Next story'],
  ['K / ↑', 'Previous story'],
  ['Enter', 'Open story'],
  ['O', 'Open the source in a new tab'],
  ['+', 'Bullish (community opinion)'],
  ['−', 'Bearish'],
  ['0', 'Neutral'],
  ['I', 'Important'],
  ['/', 'Search companies'],
  ['?', 'Show this list'],
  ['Esc', 'Close'],
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="overlay-card panel" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <table className="shortcuts">
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k}>
                <th>
                  <kbd>{k}</kbd>
                </th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint">Shortcuts pause while you type in a field.</p>
        <button type="button" className="button" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}
