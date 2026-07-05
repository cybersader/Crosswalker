/**
 * json-source.ts — re-export shim. The implementation moved to
 * src/import/parsers/json-source-core.ts (2026-06-12) so the import wizard's
 * JSON parser and the headless harness share one reader. Tools-side imports
 * and the existing test suite keep working through this path.
 */
export * from '../../src/import/parsers/json-source-core';
