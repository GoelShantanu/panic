// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShortcuts } from './keyboard.ts';
import { PhoneNote, PhoneNotice } from './Phone.tsx';

afterEach(() => (cleanup(), sessionStorage.clear(), vi.unstubAllGlobals()));

const media = (phone: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: phone && q === '(max-width: 767px)', media: q, addEventListener() {}, removeEventListener() {} }));

function Keys({ onJ }: { onJ: () => void }) {
  useShortcuts({ j: onJ });
  return null;
}

describe('phone view (PRD-001 US-001.8, D-092)', () => {
  it('phone notice and desktop notes render null (unrestricted mobile participation)', () => {
    const { container: cNotice } = render(<PhoneNotice />);
    expect(cNotice.firstChild).toBeNull();
    const { container: cNote } = render(<PhoneNote />);
    expect(cNote.firstChild).toBeNull();
  });

  it('keyboard shortcuts are off on the phone view and on at desktop width', () => {
    const onJ = vi.fn();
    media(true);
    const { unmount } = render(<Keys onJ={onJ} />);
    fireEvent.keyDown(window, { key: 'j' });
    expect(onJ).not.toHaveBeenCalled();
    unmount();
    media(false);
    render(<Keys onJ={onJ} />);
    fireEvent.keyDown(window, { key: 'j' });
    expect(onJ).toHaveBeenCalledTimes(1);
  });
});
