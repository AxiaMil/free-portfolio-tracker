// Stand-ins for the Spaces starter's own modules, which the space's files import (muse/README.md, "Files").
declare module '*/db' { export const db: any; }
declare module '*/api' { export function callAction(name: string, input?: unknown): Promise<any>; }
declare module '*/portfolio-tracker.js' {}
declare module 'drizzle-orm' { export const eq: any; export const gt: any; export const inArray: any; export const sql: any; }
declare module 'drizzle-orm/sqlite-core' { export const integer: any; export const sqliteTable: any; export const text: any; }
