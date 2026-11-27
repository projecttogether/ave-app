# Patched braces dependency

This copy of `braces` 3.0.3 retains the upstream MIT license and runtime source from
https://registry.npmjs.org/braces/-/braces-3.0.3.tgz.

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects every published version. The Next.js ESLint plugin depends on `fast-glob`,
which reaches `braces` through `micromatch`. The npm override uses this local copy.

The patch bounds nesting below 64 levels in the parser and the compile, expand,
and stringify walkers. Deep strings and caller-supplied ASTs fail with a
`SyntaxError` before exhausting the call stack. Both braces and parentheses count
toward the parser limit. Ordinary glob patterns and range limits retain upstream
behavior.

`src/__tests__/lib/braces-security.test.ts` exercises the installed override,
malicious patterns, AST inputs, and normal glob behavior. Local Docker CI runs it.
Remove the override and this directory once an upstream fixed version passes the
regression tests and npm audit.
