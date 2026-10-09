// /ship and /bounty, checked against the same engine and rules data as the website.
import { describe, expect, it } from 'vitest';
import { ABILITIES, ITEM_KINDS, SKILLS, deriveSheet, newCharacter, newShip, type CharacterDoc, type ShipDoc } from '@dndf/engine';
import { loadRules } from '../../packages/engine/test/load';
import { COMMANDS } from '../src/slash';
import { bountyReply, crewPosters, findPart, shipAboard, shipHit, shipStatus, shipTreasury } from '../src/shipCommands';

const rules = loadRules('dndf-10');
const rule = (id: string) => rules.get(id);
let n = 0;
const caravel = (more: Partial<ShipDoc> = {}): ShipDoc => ({ ...newShip(rules.get('shipType.caravel')!, 'Going Test', () => `p${++n}`), crew: 8, ...more });
const DAY = '2026-10-09';

describe('/ship status', () => {
  it('shows speed, crew, every part’s hit points, the treasury and what is wrong', () => {
    const fine = shipStatus(caravel({ treasury: 1_250_000, rations: 120 }), rule).reply.split('\n');
    expect(fine[0]).toBe('⛵ **Going Test** — Caravel · Gargantuan vehicle (70 ft. by 20 ft.)');
    expect(fine[1]).toBe('Speed 35 ft · crew 8/8 · passengers 0/10 · cargo 0/10 t · 4 mph');
    expect(fine).toContain('▫️ Hull: **150** / 150  (AC 15, threshold 10)');
    expect(fine).toContain('▫️ Movement: Sails: **100** / 100  (AC 12, 35 ft)');
    expect(fine).toContain('Weapons: 2 of 2 can be used');
    expect(fine.at(-1)).toBe('Treasury ฿1,250,000 · rations 120 (15 days for everyone aboard) · upgrades 0/5 slots · worth ฿50,000,000');
    const rough = shipStatus(caravel({ crew: 3, components: caravel().components.map((c) => (c.name === 'Hull' ? { ...c, damage: 150 } : c.name === 'Movement: Sails' ? { ...c, damage: 60 } : c)) }), rule).reply;
    expect(rough).toContain('💥 Hull: **0** / 150  (AC 15, threshold 10) — destroyed');
    expect(rough).toContain('🩸 Movement: Sails: **40** / 100  (AC 12, 25 ft)');
    expect(rough).toContain('⚠️ Short-handed (3 of 8 crew)');
    expect(rough).toContain('⚠️ Hull is at 0 hit points');
    expect(rough).toContain('Speed 12 ft'); // 35 − 10 for the torn sails, halved short-handed
    expect(rough).not.toMatch(/NaN|undefined/);
  });
});

describe('/ship damage and repair', () => {
  it('finds the part a player meant', () => {
    const doc = caravel();
    expect(findPart(doc, 'hull').found?.name).toBe('Hull');
    expect(findPart(doc, 'Sails').found?.name).toBe('Movement: Sails');
    expect(findPart(doc, 'helm').found?.name).toBe('Control: Helm');
    expect(findPart(doc, 'cannon 2').found?.name).toBe('Weapon: Cannon 2');
    expect(findPart(doc, 'weapon cannon 1').found?.name).toBe('Weapon: Cannon 1');
    expect(findPart(doc, 'cannon')).toEqual({ found: undefined, close: ['Weapon: Cannon 1', 'Weapon: Cannon 2'] });
    expect(findPart(doc, 'anchor')).toEqual({ close: [] });
  });

  it('damage under the hull’s threshold does nothing and nothing is saved; at or over it, all of it counts', () => {
    const doc = caravel();
    const glance = shipHit(doc, 'hull', 9, 'damage', 'Ana', DAY, rule);
    expect(glance.doc).toBeUndefined();
    expect(glance.reply).toBe('🛡️ **Going Test** · Hull: 9 damage is under its threshold of 10, so none gets through.');
    const hit = shipHit(doc, 'hull', 40, 'damage', 'Ana', DAY, rule);
    expect(hit.reply).toBe('💥 **Going Test** · Hull takes 40: 150 → 110 hit points.');
    expect(hit.doc!.components.find((c) => c.name === 'Hull')!.damage).toBe(40);
    expect(hit.doc!.log[0]).toEqual({ at: DAY, text: 'Hull takes 40: 150 → 110 hit points (Discord, Ana)' });
  });

  it('torn sails slow her, a destroyed part is said, and repair puts hit points back but not past full', () => {
    const doc = caravel();
    const torn = shipHit(doc, 'sails', 60, 'damage', 'Ben', DAY, rule);
    expect(torn.reply.split('\n')).toEqual(['💥 **Going Test** · Movement: Sails takes 60: 100 → 40 hit points.', 'Speed 35 → **25 ft**.']);
    const gone = shipHit(torn.doc!, 'helm', 999, 'damage', 'Ben', DAY, rule);
    expect(gone.reply).toContain('Control: Helm takes 999: 50 → 0 hit points.');
    expect(gone.reply).toContain('💀 Control: Helm is destroyed.');
    const mended = shipHit(gone.doc!, 'sails', 500, 'repair', 'Ben', DAY, rule);
    expect(mended.reply.split('\n')).toEqual(['🔧 **Going Test** · Movement: Sails repaired 60: 40 → 100 hit points.', 'Speed 25 → **35 ft**.']);
    expect(mended.doc!.components.find((c) => c.name === 'Movement: Sails')!.damage).toBe(0);
    expect(mended.doc!.log.map((l) => l.text.replace(/ \(Discord, Ben\)$/, ''))).toEqual(['Movement: Sails repaired 60: 40 → 100 hit points', 'Control: Helm takes 999: 50 → 0 hit points', 'Movement: Sails takes 60: 100 → 40 hit points']);
  });

  it('asks which one, or lists her parts, and changes nothing', () => {
    const doc = caravel();
    expect(shipHit(doc, 'cannon', 10, 'damage', 'Ana', DAY, rule)).toEqual({ reply: '"cannon" could be: Weapon: Cannon 1, Weapon: Cannon 2. Which one?' });
    expect(shipHit(doc, 'anchor', 10, 'damage', 'Ana', DAY, rule).reply).toBe('**Going Test** has no part called "anchor". Hers: Hull, Control: Helm, Movement: Sails, Weapon: Cannon 1, Weapon: Cannon 2.');
    expect(shipHit(doc, 'hull', 0, 'damage', 'Ana', DAY, rule)).toEqual({ reply: 'Nothing to change: the amount was 0.' });
    expect(shipHit(doc, 'hull', 5, 'repair', 'Ana', DAY, rule).doc?.components.find((c) => c.name === 'Hull')!.damage ?? 0).toBe(0);
  });
});

describe('/ship treasury and aboard', () => {
  it('berries go in and out, with who and why in the log; going into debt is said, not stopped', () => {
    const doc = caravel({ treasury: 1_000_000 });
    const put = shipTreasury(doc, 'in', 250_000, 'Sold the cargo', 'Ana', DAY);
    expect(put.reply).toBe('💰 **Going Test** · ฿250,000 put in (Sold the cargo): ฿1,000,000 → **฿1,250,000**.');
    expect(put.doc!.treasury).toBe(1_250_000);
    expect(put.doc!.log[0]!.text).toBe('Treasury +฿250,000 (Sold the cargo): ฿1,000,000 → ฿1,250,000 (Discord, Ana)');
    const out = shipTreasury(put.doc!, 'out', 2_000_000, '', 'Ben', DAY);
    expect(out.reply).toBe('💰 **Going Test** · ฿2,000,000 taken out: ฿1,250,000 → **-฿750,000**. The treasury is in debt.');
    expect(out.doc!.treasury).toBe(-750_000);
    expect(shipTreasury(doc, 'in', 0, '', 'Ana', DAY).doc).toBeUndefined();
  });

  it('setting who is aboard says what follows from it', () => {
    const doc = caravel();
    const few = shipAboard(doc, 'crew', 3, 'Ana', DAY, rule);
    expect(few.reply.split('\n')[0]).toBe('⛵ **Going Test** · Crew working the ship: 8 → **3**.');
    expect(few.reply).toContain('⚠️ Short-handed (3 of 8 crew)');
    expect(few.doc!.crew).toBe(3);
    const food = shipAboard(doc, 'rations', 40, 'Ana', DAY, rule);
    expect(food.reply).toBe('⛵ **Going Test** · Rations: 0 → **40**.\nThat is 5 days for everyone aboard.');
    expect(shipAboard(doc, 'crew', 8, 'Ana', DAY, rule)).toEqual({ reply: 'Nothing to change: crew is already 8.' });
  });
});

describe('/bounty', () => {
  const scores = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
  const make = (name: string, more: Partial<CharacterDoc> = {}) => {
    const doc = { ...newCharacter({ name, rulesVersion: 'dndf-10', classId: 'class.warrior', level: 5, scores, skills: [] }, rules), ...more };
    return { doc, sheet: deriveSheet(doc, rules) };
  };

  it('shows the poster as issued, and says when the bounty has moved on since', () => {
    const none = make('Zoro');
    expect(bountyReply(none.doc, none.sheet)).toMatch(/^\*\*Zoro\*\* has no wanted poster out\./);
    const out = make('Zoro', { bounty: { epithet: 'Pirate Hunter', terms: 'Only Alive', posted: { value: 60_000_000, epithet: 'Pirate Hunter', terms: 'Only Alive', at: '2026-10-01' } }, overrides: { bounty: 60_000_000 } } as Partial<CharacterDoc>);
    expect(bountyReply(out.doc, out.sheet).split('\n').slice(0, 3)).toEqual(['📜 **WANTED** — Only Alive', '**Zoro**, “Pirate Hunter”', '**฿60,000,000**  ·  issued 2026-10-01']);
    const moved = make('Zoro', { bounty: { posted: { value: 60_000_000 } }, overrides: { bounty: 120_000_000 } } as Partial<CharacterDoc>);
    if (moved.sheet.wanted.value === 120_000_000) expect(bountyReply(moved.doc, moved.sheet)).toContain('has become ฿120,000,000; a new poster has not been issued');
    expect(bountyReply(moved.doc, moved.sheet)).toContain('📜 **WANTED** — Dead or Alive');
  });

  it('the crew’s posters, highest first, with the total; characters without one are left out', () => {
    const crew = [
      { ...make('Usopp', { bounty: { posted: { value: 30_000_000, epithet: 'God' } } } as Partial<CharacterDoc>), player: 'ben' },
      { ...make('Luffy', { bounty: { posted: { value: 300_000_000, terms: 'Dead or Alive' } } } as Partial<CharacterDoc>), player: 'ana' },
      { ...make('Chopper'), player: 'zed' },
    ];
    expect(crewPosters(crew).split('\n')).toEqual([
      '📜 **Luffy** — **฿300,000,000** · Dead or Alive (ana)',
      '📜 **Usopp** “God” — **฿30,000,000** · Dead or Alive (ben)',
      'Total bounty of the crew: **฿330,000,000**',
    ]);
    expect(crewPosters([crew[2]!])).toBe('Nobody in the crew has a wanted poster out yet.');
  });
});

describe('the commands as Discord is told them', () => {
  it('has /ship with its five parts and /bounty, within Discord’s limits', () => {
    const names = COMMANDS.map((c) => c.name);
    expect(names).toEqual(['roll', 'hp', 'rest', 'dawn', 'status', 'sheet', 'party', 'bounty', 'item', 'ship']);
    const ship = COMMANDS.find((c) => c.name === 'ship')!;
    expect(ship.options!.map((o) => o.name)).toEqual(['status', 'damage', 'repair', 'treasury', 'aboard']);
    const walk = (node: { name: string; description: string; options?: unknown[] }): void => {
      expect(node.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(node.description.length).toBeGreaterThan(0);
      expect(node.description.length).toBeLessThanOrEqual(100);
      expect((node.options ?? []).length, `${node.name} options`).toBeLessThanOrEqual(25);
      const names = ((node.options ?? []) as { name: string }[]).map((o) => o.name);
      expect(new Set(names).size, `${node.name} option names`).toBe(names.length);
      for (const option of (node.options ?? []) as { choices?: { name: string }[] }[]) expect((option.choices ?? []).length).toBeLessThanOrEqual(25);
      // Required options must come before optional ones, or Discord refuses the whole list.
      const required = ((node.options ?? []) as { required?: boolean; type: number }[]).filter((o) => o.type > 2).map((o) => Boolean(o.required));
      expect(required.join()).toBe([...required].sort((a, b) => Number(b) - Number(a)).join());
      for (const child of (node.options ?? []) as never[]) walk(child);
    };
    for (const command of COMMANDS) walk(command as never);
    // /item: plain subcommands and the "make" group, one subcommand for each kind of item the engine knows.
    const item = COMMANDS.find((c) => c.name === 'item')!;
    expect(item.options!.map((o) => o.name)).toEqual(['list', 'add', 'make', 'use', 'remove']);
    const make = item.options!.find((o) => o.name === 'make') as unknown as { options: { name: string; options: { name: string; choices?: { value: string }[] }[] }[] };
    expect(make.options.map((o) => o.name).sort()).toEqual([...ITEM_KINDS].sort());
    // The choices offered are ones the engine understands.
    const wondrous = make.options.find((o) => o.name === 'wondrous')!;
    expect(wondrous.options.find((o) => o.name === 'skill')!.choices!.map((c) => c.value).sort()).toEqual(SKILLS.map((k) => k.id).sort());
    expect(wondrous.options.find((o) => o.name === 'ability')!.choices!.map((c) => c.value)).toEqual([...ABILITIES]);
    expect(make.options.find((o) => o.name === 'weapon')!.options.map((o) => o.name)).toContain('two_handed');
  });
});
