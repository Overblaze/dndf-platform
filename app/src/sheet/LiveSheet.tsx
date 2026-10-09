import { deriveSheet, type CharacterDoc, type Stat } from '@dndf/engine';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { downloadExport } from '../components/Backup';
import { Dialog } from '../components/Dialog';
import { useWaiting } from '../lib/offline';
import { RollsProvider } from '../lib/rolls';
import { ruleSet, VERSION_NAMES } from '../lib/rules';
import type { CharacterStore } from '../lib/store';
import { useCharacter } from '../lib/useCharacter';
import { AppearanceDialog } from './AppearanceDialog';
import { VersionSwitchDialog } from './VersionSwitchDialog';
import { CharacterForm } from './CharacterForm';
import { CombatTab } from './CombatTab';
import { FeaturesTab } from './FeaturesTab';
import { FruitTab } from './FruitTab';
import { GearTab } from './GearTab';
import { HakiTab } from './HakiTab';
import { HistoryDialog } from './HistoryDialog';
import { LevelUpDialog } from './LevelUpDialog';
import { RestDialog } from './RestDialog';
import { RollTray } from './RollTray';
import { SheetBackground, sheetThemeVars } from './SheetBackground';
import { SkillsTab } from './SkillsTab';
import { SpellsTab } from './SpellsTab';
import { StatDialog } from './StatDialog';
import { findStat, type StatKind } from './stats';
import { StatusTab } from './StatusTab';
import { SurgeDialog } from './SurgeDialog';
import { Vitals } from './Vitals';

const TABS = [
  { id: 'combat', label: 'Combat' },
  { id: 'skills', label: 'Skills' },
  { id: 'features', label: 'Features' },
  { id: 'haki', label: 'Haki' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'gear', label: 'Gear' },
  { id: 'spells', label: 'Spells' },
  { id: 'status', label: 'Status' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const SAVE_TEXT = { saved: 'Saved', saving: 'Saving…', error: 'Not saved', conflict: 'Not saved' };

/** One line about a version of the character, for choosing between two. */
function conflictSummary(other: CharacterDoc): string {
  try {
    const theirs = deriveSheet(other, ruleSet(other.rulesVersion).rules);
    return `${theirs.summary.split(' · ').slice(1).join(' · ')}, ${other.state.hp} of ${theirs.maxHp.value} hit points`;
  } catch {
    return 'a version this page cannot summarise';
  }
}

export function LiveSheet({ store, id }: { store: CharacterStore; id: string }) {
  const { live, loadError, missing } = useCharacter(store, id);
  const navigate = useNavigate();
  const unsent = useWaiting().some((w) => w.kind === 'characters' && w.id === id);
  // The Build page links straight to a tab or a dialog: /sheet/<id>?do=level, ?tab=features.
  const [asked, setAsked] = useSearchParams();
  // Used once: a reload or the Back button should not open the same dialog again.
  useEffect(() => { if (asked.get('do') || asked.get('tab')) setAsked({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<TabId>(() => TABS.find((t) => t.id === asked.get('tab'))?.id ?? 'combat');
  const [open, setOpen] = useState<{ key: string; kind: StatKind; rollable: boolean } | null>(null);
  const [dialog, setDialog] = useState<'rest' | 'edit' | 'look' | 'level' | 'history' | 'surge' | 'switch' | null>(() => { const wanted = asked.get('do'); return wanted === 'level' || wanted === 'edit' || wanted === 'surge' || wanted === 'history' ? wanted : null; });
  // The character as it was before the last level-up, kept until it is undone or dismissed.
  const [beforeLevel, setBeforeLevel] = useState<CharacterDoc | null>(null);

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
      <div className="sheet-theme" style={sheetThemeVars(doc.appearance)}>
      <SheetBackground appearance={doc.appearance} store={store} />
      <section className="card sheet-head">
        <div>
          <h1>{sheet.name}</h1>
          <p className="soft">
            {sheet.summary} <span className="chip">{VERSION_NAMES[doc.rulesVersion]}</span>
          </p>
        </div>
        <div className="row wrap">
          <span className={live.status === 'error' || live.status === 'conflict' ? 'chip chip-damage' : 'chip'} role="status">
            {store.local ? `${SAVE_TEXT[live.status]} on this device` : unsent && live.status === 'saved' ? 'Kept on this device, not sent yet' : SAVE_TEXT[live.status]}
          </span>
          <button className="btn btn-primary" onClick={() => setDialog('rest')}>Rest</button>
          <button className="btn" onClick={() => setDialog('level')}>Level up</button>
          <button className="btn" onClick={() => setDialog('surge')}>+ Spirit Surge</button>
          <button className="btn" onClick={() => setDialog('edit')}>Edit</button>
          <button className="btn" onClick={() => setDialog('history')}>History</button>
          <Link className="btn" to={`/print/${id}`}>Print</Link>
          <button className="btn" onClick={() => downloadExport({ characters: [live.doc] })}>Export</button>
          <button className="btn" onClick={() => setDialog('look')}>Appearance</button>
          <Link className="btn" to="/sheet">All characters</Link>
        </div>
        {beforeLevel && (
          <p className="notice level-undo" role="status">
            <span>Levelled up to {sheet.summary}.</span>
            <button className="btn" onClick={() => { live.setDoc(beforeLevel, 'Undid the level up'); setBeforeLevel(null); }}>Undo</button>
            <button className="btn" onClick={() => setBeforeLevel(null)} aria-label="Keep the new level and hide this">Keep</button>
          </p>
        )}
        {live.conflict && (
          <div className="notice conflict-bar" role="alert">
            <p>
              <strong>This character was changed somewhere else</strong> since this page loaded it: the Discord bot, another tab, or another device.
              Nothing from this page has been saved over it.
            </p>
            <p className="page-ref">
              Saved elsewhere: {conflictSummary(live.conflict)} · On this page: {sheet.summary.split(' · ').slice(1).join(' · ')}, {doc.state.hp} of {sheet.maxHp.value} hit points
            </p>
            <div className="row wrap">
              <button className="btn btn-primary" onClick={() => live.resolveConflict('theirs')}>Load the saved version</button>
              <button className="btn" onClick={() => live.resolveConflict('mine')}>Keep this page’s version</button>
            </div>
            <p className="page-ref">Loading the saved version drops what you changed here since. Keeping this page’s writes it over the other; the other goes into History, so it can be brought back.</p>
          </div>
        )}
        {live.saveError && <p className="notice" role="alert">{live.saveError}. Your changes are kept on screen and will be retried on the next change.</p>}
      </section>

      <Vitals live={live} onOpen={onOpen} />

      <div className="segmented sheet-tabs" role="tablist" aria-label="Sheet sections">
        {TABS.filter((t) => t.id !== 'fruit' || sheet.fruits.length + sheet.knownFruits.length > 0).map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'combat' && <CombatTab live={live} onOpen={onOpen} />}
      {tab === 'skills' && <SkillsTab live={live} onOpen={onOpen} />}
      {tab === 'features' && <FeaturesTab live={live} />}
      {tab === 'haki' && <HakiTab live={live} onOpen={onOpen} />}
      {tab === 'fruit' && <FruitTab live={live} onOpen={onOpen} />}
      {tab === 'gear' && <GearTab live={live} onOpen={onOpen} />}
      {tab === 'spells' && <SpellsTab live={live} onOpen={onOpen} />}
      {tab === 'status' && <StatusTab live={live} onOpen={onOpen} />}

      <RollTray live={live} />

      {open && openStat && <StatDialog stat={openStat} kind={open.kind} rollable={open.rollable} live={live} onClose={() => setOpen(null)} />}
      {dialog === 'rest' && <RestDialog live={live} onClose={() => setDialog(null)} />}
      {dialog === 'look' && <AppearanceDialog live={live} store={store} id={id} onClose={() => setDialog(null)} />}
      {dialog === 'history' && <HistoryDialog live={live} store={store} id={id} onClose={() => setDialog(null)} />}
      {dialog === 'surge' && <SurgeDialog live={live} onClose={() => setDialog(null)} />}
      {dialog === 'level' && <LevelUpDialog live={live} onClose={() => setDialog(null)} onLevelled={setBeforeLevel} />}
      {dialog === 'edit' && (
        <Dialog title="Edit character" onClose={() => setDialog(null)}>
          <CharacterForm initial={doc} onCancel={() => setDialog(null)} onSave={(next, log) => { live.setDoc(next, log); setDialog(null); }} onCompare={() => setDialog('switch')} />
        </Dialog>
      )}
      {dialog === 'switch' && (
        <VersionSwitchDialog
          doc={doc}
          hasFruit={sheet.fruits.length > 0}
          onClose={() => setDialog(null)}
          onCopy={async (copy) => {
            const made = await store.create(copy);
            void store.log(made.id, `Copied from ${doc.name} (${VERSION_NAMES[doc.rulesVersion]}) onto ${VERSION_NAMES[copy.rulesVersion]}`);
            setDialog(null);
            navigate(`/sheet/${made.id}`);
          }}
        />
      )}
      </div>
    </RollsProvider>
  );
}
