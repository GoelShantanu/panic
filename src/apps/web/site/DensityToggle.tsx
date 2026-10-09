'use client';

import { useEffect, useState } from 'react';

const KEY = 'sp-density';
export const DENSITY_BOOT = `try{if(localStorage.getItem('${KEY}')==='comfortable')document.documentElement.setAttribute('data-density','comfortable')}catch(e){}`;

export function DensityToggle() {
  const [comfortable, setComfortable] = useState(false);
  useEffect(() => { setComfortable(document.documentElement.dataset.density === 'comfortable'); }, []);
  const label = `Reading density: ${comfortable ? 'comfortable' : 'compact'}`;
  return <button type="button" className="icon-button density-toggle" aria-label={label} aria-pressed={comfortable} title={`${label}. Switch to ${comfortable ? 'compact' : 'comfortable'}.`} onClick={() => {
    const next = !comfortable;
    setComfortable(next);
    document.documentElement.dataset.density = next ? 'comfortable' : 'compact';
    try { localStorage.setItem(KEY, next ? 'comfortable' : 'compact'); } catch {}
  }}><span aria-hidden="true">Aa</span></button>;
}
