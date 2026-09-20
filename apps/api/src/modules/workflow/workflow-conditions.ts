import jsonLogic from 'json-logic-js';

/** Operators a definition may use. Anything else (including `log`, custom ops) is refused at save. */
const ALLOWED_OPS = new Set([
  '==',
  '===',
  '!=',
  '!==',
  '!',
  '!!',
  'and',
  'or',
  'if',
  '?:',
  '>',
  '>=',
  '<',
  '<=',
  'between',
  'in',
  'cat',
  'var',
  'missing',
  'missing_some',
  'min',
  'max',
  '+',
  '-',
  '*',
  '/',
  '%',
  'some',
  'all',
  'none',
  'merge',
]);

export interface ConditionIssue {
  code: 'unknown_operator' | 'unknown_variable' | 'malformed' | 'too_deep';
  message: string;
}

/** Static check of a rule against the variables an action declares. */
export function checkCondition(rule: unknown, variables: readonly string[]): ConditionIssue[] {
  const issues: ConditionIssue[] = [];
  const known = new Set(variables);
  const walk = (node: unknown, depth: number) => {
    if (depth > 12) {
      issues.push({ code: 'too_deep', message: 'The rule is nested too deeply' });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, depth + 1));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const entries = Object.entries(node as Record<string, unknown>);
    if (entries.length !== 1) {
      issues.push({ code: 'malformed', message: 'Each rule node must have exactly one operator' });
      return;
    }
    const [op, args] = entries[0]!;
    if (!ALLOWED_OPS.has(op)) {
      issues.push({ code: 'unknown_operator', message: `The operator "${op}" is not allowed` });
      return;
    }
    if (op === 'var') {
      const name = Array.isArray(args) ? args[0] : args;
      if (typeof name !== 'string' || !known.has(name.split('.')[0]!)) {
        issues.push({
          code: 'unknown_variable',
          message: `"${String(name)}" is not a variable this action provides`,
        });
      }
      return;
    }
    walk(args, depth + 1);
  };
  walk(rule, 0);
  return issues;
}

/**
 * Evaluate a rule against the request's frozen context. A rule that throws or cannot be evaluated
 * (missing variable, wrong type) is "no match", never an error — the caller falls through to the
 * `else` branch and the event is logged (§4 #24).
 */
export function evaluateCondition(rule: unknown, context: Record<string, unknown>): boolean {
  try {
    return !!jsonLogic.apply(rule as never, context);
  } catch {
    return false;
  }
}
