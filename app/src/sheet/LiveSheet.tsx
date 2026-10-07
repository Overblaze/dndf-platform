import type { Stat } from '@dndf/engine';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { RollsProvider } from '../lib/rolls';
import type { CharacterStore } from '../lib/store';
import { useCharacter } from '../lib/useCharacter';
import { CharacterForm } from './CharacterForm';
import { CombatTab } from './CombatTab';
import { FeaturesTab } from './FeaturesTab';
import { RestDialog } from './RestDialog';
import { RollTray } from './RollTray';
import { SkillsTab } from './SkillsTab';
import { StatDialog } from './StatDialog';
import { findStat, type StatKind } from './stats';
import { StatusTab } from './StatusTab';
import { Vitals } from './Vitals';

const TABS = [
  { id: 'combat', label: 'Combat' },
  { id: 'skills', label: 'Skills' },
  { id: 'features', label: 'Features' },
  { id: 'status', label: 'Status' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const SAVE_TEXT = { saved: 'Saved', saving: 'Saving…', error: 'Not saved' };

export function LiveSheet({ store, id }: { store: CharacterStore; id: string }) {
  const { live, loadError, missing } = useCharacter(store, id);
  const [tab, setTab] = useState<TabId>('combat');
  const [open, setOpen] = useState<{ key: string; kind: StatKind; rollable: boolean } | null>(null);
  const [dialog, setDialog] = useState<'rest' | 'edit' | null>(null);

  if (loadError) return <p className="notice" role="alert">{loadError}</p>;
  if (missing) {
    return (
      <section className="card">
        <h1>No such character</h1>
        <p>It may have been deleted, or it belongs to someone else.</p>
        <Link className="btn" to="/sheet">Back to my characters</Link>
      </section>
    );
  }
  if (!live) return <p>Unrolling the chart…</p>;

  const { doc, sheet } = live;
  const onOpen = (stat: Stat, kind: StatKind, rollable = false) => setOpen({ key: stat.key, kind, rollable });
  const openStat = open ? findStat(sheet, open.key) : undefined;

  return (
    <RollsProvider>
      <section className="card sheet-head">
        <div>
          <h1>{sheet.name}</h1>
          <p className="soft">
            {sheet.summary} <span className="chip">{doc.rulesVersion === 'dndf-10' ? 'Rules v10' : 'Rules v8.8'}</span>
          </p>
        </div>
        <div className="row wrap">
          <span className={live.status === 'error' ? 'chip chip-damage' : 'chip'} role="status">
            {store.local ? `${SAVE_TEXT[live.status]} on this device` : SAVE_TEXT[live.status]}
          </span>
          <button className="btn btn-primary" onClick={() => setDialog('rest')}>Rest</button>
          <button className="btn" onClick={() => setDialog('edit')}>Edit</button>
          <Link className="btn" to="/sheet">All characters</Link>
        </div>
        {live.saveError && <p className="notice" role="alert">{live.saveError}. Your changes are kept on screen and will be retried on the next change.</p>}
      </section>

      <Vitals live={live} onOpen={onOpen} />

      <div className="segmented sheet-tabs" role="tablist" aria-label="Sheet sections">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'combat' && <CombatTab live={live} onOpen={onOpen} />}
      {tab === 'skills' && <SkillsTab live={live} onOpen={onOpen} />}
      {tab === 'features' && <FeaturesTab live={live} />}
      {tab === 'status' && <StatusTab live={live} />}

      <RollTray live={live} />

      {open && openStat && <StatDialog stat={openStat} kind={open.kind} rollable={open.rollable} live={live} onClose={() => setOpen(null)} />}
      {dialog === 'rest' && <RestDialog live={live} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && (
        <Dialog title="Edit character" onClose={() => setDialog(null)}>
          <CharacterForm initial={doc} onCancel={() => setDialog(null)} onSave={(next, log) => { live.setDoc(next, log); setDialog(null); }} />
        </Dialog>
      )}
    </RollsProvider>
  );
}
