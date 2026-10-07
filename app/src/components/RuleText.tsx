import { cite, type SectionDef, type TableDef } from '@dndf/engine';

function RuleTable({ table, book }: { table: TableDef; book?: string }) {
  const width = Math.max(...table.rows.map((row) => row.length));
  return (
    <div className="rule-table">
      <table>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                // A lone cell on a row is a heading or a wrapped line: let it span the table.
                <td key={j} colSpan={row.length === 1 ? width : undefined}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <span className="page-ref">table as printed, {cite(book, table.page)}</span>
    </div>
  );
}

/** Book text, word for word: the main text, then any sub-headed parts and tables printed with it. */
export function RuleText({ text, sections = [], tables = [], book }: { text: string; sections?: SectionDef[]; tables?: TableDef[]; book?: string }) {
  return (
    <div className="rule-body">
      <p className="feature-text">{text}</p>
      {tables.map((table, i) => <RuleTable key={i} table={table} book={book} />)}
      {sections.map((section, i) => (
        <div key={i} className="rule-section">
          <h3>{section.name} <span className="page-ref">{cite(book, section.page)}</span></h3>
          {section.text && <p className="feature-text">{section.text}</p>}
          {section.tables?.map((table, j) => <RuleTable key={j} table={table} book={book} />)}
        </div>
      ))}
    </div>
  );
}
