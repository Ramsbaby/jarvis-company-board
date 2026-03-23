/**
 * Custom ESLint rule: no-fetch-without-ok-check
 *
 * Detects patterns like:
 *   const data = await res.json()   // without prior res.ok check
 *   res.json().then(...)             // without prior res.ok check
 *
 * Enforces:
 *   if (!res.ok) ...
 *   res.ok ? ... : ...
 *   res.ok && ...
 *
 * Only triggers inside async functions where `fetch(` appears in scope.
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require res.ok check before calling res.json()',
      category: 'Best Practices',
    },
    schema: [],
    messages: {
      missingOkCheck:
        'Call res.json() only after checking res.ok. ' +
        'Use: if (!res.ok) throw/return; then res.json(). ' +
        'Or use apiFetch<T>() from lib/api-fetch.ts.',
    },
  },
  create(context) {
    // Track variable names bound to fetch() results
    const fetchResultVars = new Set();

    return {
      // Track: const res = await fetch(...)  or  const res = fetch(...)
      VariableDeclarator(node) {
        if (!node.init) return;
        const init = node.init;
        // await fetch(...) or fetch(...)
        const call =
          init.type === 'AwaitExpression' ? init.argument : init;
        if (
          call?.type === 'CallExpression' &&
          call.callee?.name === 'fetch' &&
          node.id?.type === 'Identifier'
        ) {
          fetchResultVars.add(node.id.name);
        }
      },

      // Track: [a, b] = await Promise.all([fetch(...), fetch(...)])
      // (destructuring — mark both as fetch results)
      // We skip this for now; apiFetch wrapper handles it.

      // Detect: await res.json() / res.json().then(...)
      CallExpression(node) {
        if (
          node.callee?.type !== 'MemberExpression' ||
          node.callee.property?.name !== 'json'
        ) {
          return;
        }
        const obj = node.callee.object;
        if (obj?.type !== 'Identifier') return;
        const varName = obj.name;
        if (!fetchResultVars.has(varName)) return;

        // Walk up ancestors to find an if/ternary/logical that checks .ok
        const ancestors = context.getAncestors ? context.getAncestors() : [];
        const hasOkCheck = ancestors.some((ancestor) => {
          const src = context.getSourceCode
            ? context.getSourceCode().getText(ancestor)
            : '';
          // Look for: varName.ok or res.ok patterns in surrounding code
          return (
            src.includes(`${varName}.ok`) ||
            src.includes(`!${varName}.ok`) ||
            src.includes(`${varName}?.ok`)
          );
        });

        if (!hasOkCheck) {
          context.report({
            node,
            messageId: 'missingOkCheck',
          });
        }
      },
    };
  },
};
