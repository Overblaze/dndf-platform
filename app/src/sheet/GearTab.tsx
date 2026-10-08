import { armorFromItem, cite, exactBerries, inventoryFromItem, weaponFromItem, type InventoryItem, type RuleEntry } from '@dndf/engine';
import { useMemo, useState } from 'react';
import { Dialog } from '../components/Dialog';
import type { LiveCharacter } from '../lib/useCharacter';
import type { OpenStat } from './Vitals';

const lb = (n: number) => `${Math.round(n * 100) / 100} lb`;

/** Pick something from the armory: add it, or buy it (which also takes its price from your berries). */
function ArmoryDialog({ live, onClose }: { live: LiveCharacter; onClose: () => void }) {
  const { doc, sheet, rules } = live;
  const [text, setText] = useState('');
  const items = useMemo(() => [...rules.values()].filter((e) => e.kind === 'item').sort((a, b) => a.name.localeCompare(b.name)), [rules]);
  const shown = items.filter((i) => i.name.toLowerCase().includes(text.trim().toLowerCase()));
  const add = (entry: RuleEntry, pay: boolean) => {
    const cost = typeof entry.cost === 'number' ? entry.cost : 0;
    const have = (doc.inventory ?? []).find((i) => i.item === entry.id && i.carried !== false);
    const inventory = have
      ? (doc.inventory ?? []).map((i) => (i === have ? { ...i, qty: i.qty + 1 } : i))
      : [...(doc.inventory ?? []), inventoryFromItem(entry, crypto.randomUUID())];
    live.setDoc({ ...doc, inventory, money: pay ? (doc.money ?? 0) - cost : doc.money }, pay ? `Bought ${entry.name} for ${exactBerries(cost)}` : `Added ${entry.name}`);
  };
  return (
    <Dialog title="From the armory" onClose={onClose}>
      <p className="page-ref">You have {exactBerries(sheet.money)}. “Buy” takes the price from it; “Add” does not.</p>
      <label className="field">
        <span className="label">Find</span>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Cutlass, coat, shield…" />
      </label>
      {shown.map((entry) => {
        const cost = typeof entry.cost === 'number' ? entry.cost : null;
        const owned = (doc.inventory ?? []).filter((i) => i.item === entry.id).reduce((n, i) => n + i.qty, 0);
        return (
          <div key={entry.id} className="resource">
            <div>
              <div className="resource-name">{entry.name}{owned > 0 ? ` (you have ${owned})` : ''}</div>
              <div className="page-ref">
                {[cost !== null ? exactBerries(cost) : '', String(entry.weight ?? ''), String(entry.text ?? '').replace(`${entry.name}: `, ''), cite(entry.source.book, entry.source.page)].filter(Boolean).join(' · ')}
              </div>
              {cost !== null && cost > sheet.money && <div className="page-ref held-why">More than you have. You can still buy it; your berries go below zero.</div>}
            </div>
            <div className="row wrap">
              <button className="btn" onClick={() => add(entry, false)}>Add</button>
              {cost !== null && <button className="btn btn-primary" onClick={() => add(entry, true)}>Buy</button>}
            </div>
          </div>
        );
      })}
      {shown.length === 0 && <p className="soft">Nothing in the armory by that name. Close this and use “Add your own item”.</p>}
    </Dialog>
  );
}

/** Write or change an item of your own. */
function ItemDialog({ initial, onSave, onClose }: { initial?: InventoryItem; onSave: (item: InventoryItem) => void; onClose: () => void }) {
  const [item, setItem] = useState<InventoryItem>(initial ?? { id: crypto.randomUUID(), name: '', qty: 1 });
  const number = (value: string) => (value.trim() === '' || !Number.isFinite(Number(value)) ? undefined : Math.max(0, Number(value)));
  return (
    <Dialog title={initial ? 'Change item' : 'Add your own item'} onClose={onClose}>
      <label className="field">
        <span className="label">Name</span>
        <input value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} placeholder="Log Pose" maxLength={80} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="label">How many</span>
          <input type="number" inputMode="numeric" min={0} value={item.qty} onChange={(e) => setItem({ ...item, qty: Math.round(number(e.target.value) ?? 0) })} />
        </label>
        <label className="field">
          <span className="label">Weight of one (lb)</span>
          <input type="number" inputMode="decimal" min={0} step="any" value={item.weight ?? ''} onChange={(e) => setItem({ ...item, weight: number(e.target.value) })} />
        </label>
      </div>
      <label className="field">
        <span className="label">Notes (optional)</span>
        <textarea rows={3} value={item.notes ?? ''} onChange={(e) => setItem({ ...item, notes: e.target.value || undefined })} />
      </label>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => onSave({ ...item, name: item.name.trim() || 'Item' })}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

/** Berries and everything carried, with the weight against carrying capacity. */
export function GearTab({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const { doc, sheet, rules } = live;
  const [amount, setAmount] = useState('');
  const [dialog, setDialog] = useState<'armory' | 'own' | InventoryItem | null>(null);
  const items = doc.inventory ?? [];
  const { gear } = sheet;
  const value = Math.round(Number(amount));
  const usable = amount.trim() !== '' && Number.isFinite(value) && value > 0;
  const pay = (sign: 1 | -1) => {
    live.setDoc({ ...doc, money: (doc.money ?? 0) + sign * value }, `${sign > 0 ? 'Gained' : 'Spent'} ${exactBerries(value)}: ${exactBerries(sheet.money)} → ${exactBerries(sheet.money + sign * value)}`);
    setAmount('');
  };
  const change = (id: string, patch: Partial<InventoryItem>, log: string) => live.setDoc({ ...doc, inventory: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }, log);
  const remove = (item: InventoryItem) => live.setDoc({ ...doc, inventory: items.filter((i) => i.id !== item.id) }, `Removed ${item.name}`);
  const save = (item: InventoryItem) => {
    const exists = items.some((i) => i.id === item.id);
    live.setDoc({ ...doc, inventory: exists ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item] }, `${exists ? 'Changed' : 'Added'} ${item.name}`);
    setDialog(null);
  };
  // An armory weapon or armor in the list can be put to use: it then shows under Attacks, or sets Armor Class.
  const equip = (item: InventoryItem) => {
    const entry = item.item ? rules.get(item.item) : undefined;
    if (!entry) return;
    const weapon = weaponFromItem(entry, crypto.randomUUID());
    const armor = armorFromItem(entry);
    if (weapon) live.setDoc({ ...doc, weapons: [...doc.weapons, weapon] }, `Readied ${entry.name}`);
    else if (armor) live.setDoc({ ...doc, armor }, `Put on ${entry.name}`);
    else if (entry.itemType === 'shield') live.setDoc({ ...doc, shield: true }, 'Took up a shield');
  };
  const inUse = (item: InventoryItem) => {
    const entry = item.item ? rules.get(item.item) : undefined;
    if (!entry) return null;
    if (entry.itemType === 'shield') return doc.shield ? 'in use' : 'use';
    if (armorFromItem(entry)) return doc.armor?.name === entry.name ? 'in use' : 'use';
    if (weaponFromItem(entry)) return doc.weapons.some((w) => w.name === entry.name) ? 'in use' : 'use';
    return null;
  };
  const share = gear.capacity > 0 ? Math.min(100, (gear.carried / gear.capacity) * 100) : 100;

  return (
    <>
      <section className="card">
        <h2>Berries</h2>
        <p className="big num">{exactBerries(sheet.money)}</p>
        <div className="row wrap">
          <input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label="Amount of berries" />
          <button className="btn btn-heal" disabled={!usable} onClick={() => pay(1)}>Gain</button>
          <button className="btn btn-damage" disabled={!usable} onClick={() => pay(-1)}>Spend</button>
        </div>
        {sheet.money < 0 && <p className="notice">You are below zero. That is between you and whoever you owe.</p>}
      </section>

      <section className="card">
        <h2>Carried</h2>
        <button className="link-row" onClick={() => onOpen(sheet.carry, 'lb')}>
          <span className={gear.over ? 'page-ref held-why' : 'page-ref'}>
            {lb(gear.carried)} of {lb(gear.capacity)}{gear.over ? ': more than you can carry' : ''} · tap for how capacity is worked out
          </span>
        </button>
        <div className="weight-bar" role="img" aria-label={`${Math.round(share)} percent of carrying capacity`}>
          <div className={gear.over ? 'weight-fill over' : 'weight-fill'} style={{ width: `${share}%` }} />
        </div>
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => setDialog('armory')}>From the armory</button>
          <button className="btn" onClick={() => setDialog('own')}>Add your own item</button>
        </div>
        {gear.lines.length === 0 && <p className="soft">Nothing yet. Armor you wear and weapons under Attacks only weigh something once they are in this list.</p>}
        {gear.lines.map((line) => {
          const item = items.find((i) => i.id === line.id)!;
          const use = inUse(item);
          return (
            <div key={line.id} className="tracker">
              <div className="resource">
                <button className="attack-name" onClick={() => setDialog(item)}>
                  <span className="resource-name">{line.name}{line.carried ? '' : ' (stowed)'}</span>
                  <span className="page-ref">
                    {[line.weight !== undefined ? `${lb(line.weight)} each${line.qty !== 1 ? `, ${lb(line.total)} in all` : ''}` : 'no weight', line.notes].filter(Boolean).join(' · ')}
                  </span>
                </button>
                <span className="big num">{line.qty}</span>
                <div className="row">
                  <button className="btn" onClick={() => change(line.id, { qty: Math.max(0, line.qty - 1) }, `${line.name}: ${line.qty} → ${Math.max(0, line.qty - 1)}`)} disabled={line.qty <= 0} aria-label={`One fewer ${line.name}`}>−</button>
                  <button className="btn" onClick={() => change(line.id, { qty: line.qty + 1 }, `${line.name}: ${line.qty} → ${line.qty + 1}`)} aria-label={`One more ${line.name}`}>+</button>
                </div>
              </div>
              <div className="row wrap">
                {use === 'use' && <button className="btn" onClick={() => equip(item)}>Use it</button>}
                {use === 'in use' && <span className="chip">In use</span>}
                <button className="btn" onClick={() => change(line.id, { carried: !line.carried }, `${line.name}: ${line.carried ? 'stowed' : 'carried'}`)}>{line.carried ? 'Stow' : 'Carry'}</button>
                <button className="btn" onClick={() => remove(item)}>Remove</button>
              </div>
            </div>
          );
        })}
        <p className="page-ref">Stowed things stay in the list but weigh nothing on you. To take off armor or put a weapon away, use Edit.</p>
      </section>

      {dialog === 'armory' && <ArmoryDialog live={live} onClose={() => setDialog(null)} />}
      {dialog === 'own' && <ItemDialog onSave={save} onClose={() => setDialog(null)} />}
      {dialog && typeof dialog === 'object' && <ItemDialog initial={dialog} onSave={save} onClose={() => setDialog(null)} />}
    </>
  );
}
