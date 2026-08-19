// Thin re-export -- the real implementation lives in src/monthlySummary.ts so both the client
// (src/App.tsx, for the LINE-notify balance figure) and the server (this file's api/ consumers)
// import the exact same module instead of two copies that could drift. Keep this file's name and
// path stable: every api/*.ts file already imports from './_monthlySummary.js'.
export * from '../src/monthlySummary.js';
