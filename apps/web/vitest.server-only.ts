// Next.js resolves this marker at build/runtime. Vitest uses an empty marker so
// explicit server integration tests can import the same modules without
// weakening the production-only boundary.
export {};
