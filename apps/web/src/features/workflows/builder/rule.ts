/**
 * A friendly form for the rules a condition step (or a conditional binding) uses, and back. Rules
 * are stored as JSON-logic; the builder edits the common shape — one or more comparisons joined by
 * ALL or ANY — and shows anything fancier as read-only JSON rather than mangling it.
 */
export const OPERATORS = ['==', '!=', '>', '>=', '<', '<=', 'in'] as const;
export type Operator = (typeof OPERATORS)[number];

export interface RuleRow {
  variable: string;
  op: Operator;
  /** what the person typed; converted to a number / boolean when it looks like one */
  value: string;
}
export interface RuleForm {
  combinator: 'and' | 'or';
  rows: RuleRow[];
}

export const emptyRule = (variable = ''): RuleForm => ({
  combinator: 'and',
  rows: [{ variable, op: '==', value: '' }],
});

const literal = (v: string): string | number | boolean => {
  const t = v.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
};
const show = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : String(v));

export function toJsonLogic(form: RuleForm): Record<string, unknown> {
  const rows = form.rows.filter((r) => r.variable.trim());
  const one = (r: RuleRow): Record<string, unknown> => {
    const v = { var: r.variable.trim() };
    if (r.op === 'in') {
      return {
        in: [
          v,
          r.value
            .split(',')
            .map((x) => literal(x))
            .filter((x) => x !== ''),
        ],
      };
    }
    return { [r.op]: [v, literal(r.value)] };
  };
  if (!rows.length) return {};
  return rows.length === 1 ? one(rows[0]!) : { [form.combinator]: rows.map(one) };
}

const isOp = (k: string): k is Operator => (OPERATORS as readonly string[]).includes(k);

/** `null` when the rule is not a shape the form can show (it is then edited as JSON). */
export function fromJsonLogic(rule: Record<string, unknown>): RuleForm | null {
  const keys = Object.keys(rule);
  if (!keys.length) return emptyRule();
  if (keys.length !== 1) return null;
  const [key] = keys as [string];
  const row = (node: unknown): RuleRow | null => {
    if (!node || typeof node !== 'object') return null;
    const [op, args] = Object.entries(node as Record<string, unknown>)[0] ?? [];
    if (!op || !isOp(op) || !Array.isArray(args) || args.length !== 2) return null;
    const left = args[0] as { var?: unknown } | undefined;
    if (!left || typeof left !== 'object' || typeof left.var !== 'string') return null;
    const right = args[1];
    if (op === 'in' ? !Array.isArray(right) : typeof right === 'object' && right !== null)
      return null;
    return { variable: left.var, op, value: show(right) };
  };
  if (key === 'and' || key === 'or') {
    const list = rule[key];
    if (!Array.isArray(list) || !list.length) return null;
    const rows = list.map(row);
    return rows.every(Boolean) ? { combinator: key, rows: rows as RuleRow[] } : null;
  }
  const single = row(rule);
  return single ? { combinator: 'and', rows: [single] } : null;
}

/** One line of plain text for a card ("amount > 500 and location = LHR"). */
export function describeRule(rule: Record<string, unknown>): string {
  const form = fromJsonLogic(rule);
  if (!form) return '{…}';
  if (!form.rows.length || !form.rows[0]!.variable) return '';
  const word = form.combinator === 'and' ? ' and ' : ' or ';
  return form.rows.map((r) => `${r.variable} ${r.op === '==' ? '=' : r.op} ${r.value}`).join(word);
}
