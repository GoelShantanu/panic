'use client';

import { useState } from 'react';
import { adminCall, outcome } from './call.ts';
import { Action } from './Action.tsx';
import type { Switches } from './types.ts';

// ---------------------------------------------------------------- kill switches (PRD-006 §4, PRD-005 US-005.7)

export function SwitchesPanel({ initial }: { initial: Switches }) {
  const [s, setS] = useState(initial);
  const toggle = (label: string, on: boolean, run: (next: boolean, reason: string) => Promise<boolean | string>) => (
    <div className="switch-row">
      <span>
        {label}: <strong className={on ? '' : 'overdue'}>{on ? 'On' : 'Off'}</strong>
      </span>
      <Action
        label={on ? 'Turn off' : 'Turn on'}
        danger={on}
        onRun={async (reason) => {
          const r = await run(!on, reason);
          return r === true ? `Turned ${on ? 'off' : 'on'}. Takes effect within 60 s.` : String(r);
        }}
      />
    </div>
  );
  const comments = async (posting: boolean, visible: boolean, reason: string) => {
    const r = await adminCall('PUT', '/v1/admin/settings/comments', { posting, visible, reason });
    if (r.status === 200) setS((x) => ({ ...x, comments_posting_enabled: posting, comments_visible: visible }));
    return r.status === 200 || outcome(r, '');
  };
  return (
    <div>
      {toggle('Comment posting (all stories)', s.comments_posting_enabled, (next, reason) => comments(next, s.comments_visible, reason))}
      {toggle('Comments visible (all stories)', s.comments_visible, (next, reason) => comments(s.comments_posting_enabled, next, reason))}
      {toggle('Directional voting (bullish / bearish / neutral)', s.directional_voting_enabled, async (next, reason) => {
        const r = await adminCall('PUT', '/v1/admin/settings/directional-voting', { enabled: next, reason });
        if (r.status === 200) setS((x) => ({ ...x, directional_voting_enabled: next }));
        return r.status === 200 || outcome(r, '');
      })}
      {toggle('Company tags', s.article_tags_enabled, async (next, reason) => {
        const r = await adminCall('PUT', '/v1/admin/settings/article-tags', { enabled: next, reason });
        if (r.status === 200) setS((x) => ({ ...x, article_tags_enabled: next }));
        return r.status === 200 || outcome(r, '');
      })}
    </div>
  );
}
