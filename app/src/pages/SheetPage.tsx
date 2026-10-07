import {
  abilityMod,
  furySaveDc,
  getClass,
  hakiSaveDc,
  indexRules,
  maxHp,
  proficiencyBonus,
  signed,
  willpower,
  type AbilityScores,
  type RulesFile,
} from '@dndf/engine';
import bruiserFile from '../../../data/rules/dndf-10/bruiser.json';
import { Breakdown } from '../components/Breakdown';
import { useAuth } from '../lib/auth';

// The sample character from docs/FORMULAS.md, worked out by the same engine the sheet and the Discord bot will use.
const bruiser = getClass(indexRules([bruiserFile as unknown as RulesFile]), 'class.bruiser');
const scores: AbilityScores = { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
const level = 7;
const kaito = { cls: bruiser, classLevel: level, scores };
const wp = willpower({ level });

function Welcome() {
  const { configured, loading, session, name, isDm, signIn } = useAuth();
  if (!configured) {
    return (
      <p className="notice">
        Sign-in is switched off: this build has no Supabase URL and anon key. Copy <code>.env.example</code> to{' '}
        <code>.env.local</code>, fill both in, and restart.
      </p>
    );
  }
  if (loading) return <p>Checking who is aboard…</p>;
  if (!session) {
    return (
      <>
        <p>Sign in with Discord to keep your characters here.</p>
        <button className="btn btn-primary" onClick={signIn}>
          Sign in with Discord
        </button>
      </>
    );
  }
  return (
    <p>
      Welcome aboard, <strong>{name ?? 'sailor'}</strong>. You are signed in as a {isDm ? 'DM' : 'player'}. Your character
      sheet arrives in phase 2.
    </p>
  );
}

export function SheetPage() {
  return (
    <>
      <section className="card">
        <h1>Sheet</h1>
        <Welcome />
      </section>
      <section className="card">
        <h2>Engine check</h2>
        <p className="soft">
          Kaito Rourke, Human (Standard) Bruiser {level}, rules v10: the sample character every formula is tested against.
        </p>
        <div className="tiles">
          <div className="tile">
            <span className="label">Strength</span>
            <span className="big num">{signed(abilityMod(scores.str))}</span>
            <span className="page-ref">score {scores.str} · p.10</span>
          </div>
          <div className="tile">
            <span className="label">Proficiency</span>
            <span className="big num">{signed(proficiencyBonus(level))}</span>
            <span className="page-ref">p.209</span>
          </div>
          <div className="tile">
            <span className="label">Willpower</span>
            <span className="big num">{wp.value}</span>
            <span className="page-ref">p.{wp.page}</span>
          </div>
        </div>
        <div className="breakdowns">
          <Breakdown label="Max HP" result={{ ...maxHp({ hitDie: bruiser.hitDie, level, conMod: abilityMod(scores.con) }), page: 85 }} />
          <Breakdown label="Fury save DC" result={furySaveDc(kaito)} />
          <Breakdown label="Haki save DC" result={hakiSaveDc(wp.value)} />
        </div>
      </section>
    </>
  );
}
