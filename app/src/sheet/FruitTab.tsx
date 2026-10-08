import { cite, spendResource, type SheetFruit } from '@dndf/engine';
import { RuleText } from '../components/RuleText';
import type { LiveCharacter } from '../lib/useCharacter';
import { Tile, type OpenStat } from './Vitals';

/** Short book name and page, for books that have no abbreviation of their own. */
const ref = (book: string, page: number) => (page > 0 ? `${book}, ${cite(book, page).replace(/^.*?p\./, 'p.')}` : book);

function FruitText({ fruit }: { fruit: SheetFruit }) {
  return (
    <>
      <p className="page-ref">{[fruit.rarity, fruit.type, ref(fruit.book, fruit.page)].filter(Boolean).join(' · ')}</p>
      {fruit.description && <p className="feature-text">{fruit.description}</p>}
      {fruit.appearance && <p className="feature-text"><strong>Appearance.</strong> {fruit.appearance}</p>}
      {fruit.seaWeakness && <p className="feature-text"><strong>Weakness.</strong> {fruit.seaWeakness}</p>}
      {fruit.parts.map((part, i) => (
        <details key={i} className="feature">
          <summary>
            <span className="resource-name">{part.name}</span>
            <span className="page-ref">{part.page > 0 ? `p.${part.page}` : ''}</span>
          </summary>
          <RuleText text={part.text} book={fruit.book} />
        </details>
      ))}
      {fruit.statBlock.length > 0 && (
        <details className="feature">
          <summary><span className="resource-name">Beast stat block</span></summary>
          <p className="feature-text">{fruit.statBlock.join('\n')}</p>
        </details>
      )}
    </>
  );
}

/** The Devil Fruit this character holds, with its charges, and any fruit they have learned about. Only shown when the DM has granted one. */
export function FruitTab({ live, onOpen }: { live: LiveCharacter; onOpen: OpenStat }) {
  const { doc, sheet } = live;
  const spend = (id: string, by: number) => {
    const result = spendResource(doc.state, sheet, id, by);
    live.setState(result.state, result.warning ? `${result.summary} (${result.warning})` : result.summary);
  };
  return (
    <>
      {sheet.fruits.map((fruit) => {
        const pools = sheet.resources.filter((r) => fruit.resources.includes(r.id));
        return (
          <section key={fruit.key} className="card">
            <h2>{fruit.name} <span className="chip">{fruit.revealed ? 'The table knows' : 'Secret'}</span></h2>
            <p className="page-ref">{fruit.revealed ? 'Your DM has revealed this fruit to the table.' : 'Only you and your DM can see this. The rest of the table sees only that you have a Devil Fruit.'}</p>
            <div className="tiles">
              {sheet.fruitSaveDc && <Tile stat={sheet.fruitSaveDc} kind="plain" label="Fruit DC" onOpen={onOpen} />}
              {sheet.fruitAttack && <Tile stat={sheet.fruitAttack} kind="mod" label="Fruit attack" onOpen={onOpen} rollable />}
            </div>
            {pools.map((res) => (
              <div key={res.id} className="resource">
                <div>
                  <div className="resource-name">{res.name}</div>
                  <div className="page-ref">
                    back at dawn{res.name === 'Devil Fruit charges' && fruit.highestSpellLevel ? ` · a spell costs its level in charges · highest spell level ${fruit.highestSpellLevel}` : ''}
                  </div>
                </div>
                <span className="big num">{res.remaining}<span className="soft"> / {res.max}</span></span>
                <div className="row">
                  <button className="btn" onClick={() => spend(res.id, 1)} disabled={res.remaining <= 0} aria-label={`Spend one of ${res.name}`}>−</button>
                  <button className="btn" onClick={() => spend(res.id, -1)} disabled={res.remaining >= res.max} aria-label={`Give back one of ${res.name}`}>+</button>
                </div>
              </div>
            ))}
            {fruit.category === 'other' && <p className="notice">This fruit’s type could not be read from the book, so its charges are not counted for you.</p>}
            <FruitText fruit={fruit} />
            <p className="page-ref">Features with dice have roll buttons on the Combat tab. “+ Spirit Surge” has a Devil Fruit tab for its advancements.</p>
          </section>
        );
      })}
      {sheet.knownFruits.length > 0 && (
        <section className="card">
          <h2>Devil Fruits you know about</h2>
          {sheet.knownFruits.map((fruit) => (
            <details key={fruit.key} className="feature">
              <summary>
                <span className="resource-name">{fruit.name}</span>
                <span className="page-ref">{[fruit.rarity, fruit.type].filter(Boolean).join(' · ')}</span>
              </summary>
              <FruitText fruit={fruit} />
            </details>
          ))}
        </section>
      )}
    </>
  );
}
