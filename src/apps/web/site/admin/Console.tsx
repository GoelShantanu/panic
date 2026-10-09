'use client';

import { useState } from 'react';
import { adminCall } from './call.ts';
import { RecordOrder, GrievanceCard } from './Grievances.tsx';
import { CorrectionCard } from './Corrections.tsx';
import { StoryTools } from './StoryTools.tsx';
import { SwitchesPanel } from './SwitchesPanel.tsx';
import { AbusePanel } from './AbusePanel.tsx';
import type { ConsoleData } from './types.ts';
export type { ConsoleData, Abuse, CorrectionRow, Grievance, Switches } from './types.ts';

// ---------------------------------------------------------------- the console

const TABS = ['Grievances', 'Corrections', 'Story tools', 'Abuse', 'Switches'] as const;
type Tab = (typeof TABS)[number];

export function Console({ initial }: { initial: ConsoleData }) {
  const [tab, setTab] = useState<Tab>('Grievances');
  const [data, setData] = useState(initial);
  const [flash, setFlash] = useState<string | null>(null);
  const reload = async () => {
    const [g, c] = await Promise.all([adminCall('GET', '/v1/admin/grievances'), adminCall('GET', '/v1/admin/corrections')]);
    setData((d) => ({
      ...d,
      ...(g.status === 200 && Array.isArray(g.body?.grievances) ? { grievances: g.body.grievances } : {}),
      ...(c.status === 200 && Array.isArray(c.body?.queue) ? { corrections: c.body.queue } : {}),
    }));
  };
  const counts: Partial<Record<Tab, number>> = { Grievances: data.grievances.length, Corrections: data.corrections.length };
  const overdue = data.grievances.filter((g) => g.ack_overdue || g.resolve_overdue).length;
  return (
    <div className="console">
      <header className="page-head">
        <h1>Operator console</h1>
        {overdue > 0 && <span className="notice notice-error">{overdue} grievance{overdue === 1 ? '' : 's'} past a legal deadline</span>}
      </header>
      {flash && (
        <p className="faint" role="status">
          Last action — {flash}
        </p>
      )}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
            {t}
            {counts[t] ? ` (${counts[t]})` : ''}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'Grievances' && (
          <>
            <RecordOrder onDone={() => void reload()} />
            {data.grievances.length === 0 ? (
              <p className="state">No open grievances.</p>
            ) : (
              <ol className="plain-list">
                {data.grievances.map((g) => (
                  <GrievanceCard
                    key={g.reference}
                    g={g}
                    onChange={(m) => {
                      setFlash(`${g.reference}: ${m}`);
                      void reload();
                    }}
                  />
                ))}
              </ol>
            )}
          </>
        )}
        {tab === 'Corrections' &&
          (data.corrections.length === 0 ? (
            <p className="state">No wrong-stock or duplicate reports awaiting review.</p>
          ) : (
            <ol className="plain-list">
              {data.corrections.map((c) => (
                <CorrectionCard key={`${c.story_id}-${c.kind}`} c={c} onChange={() => void reload()} />
              ))}
            </ol>
          ))}
        {tab === 'Story tools' && <StoryTools />}
        {tab === 'Abuse' && <AbusePanel abuse={data.abuse} />}
        {tab === 'Switches' && <SwitchesPanel initial={data.settings} />}
      </div>
    </div>
  );
}
