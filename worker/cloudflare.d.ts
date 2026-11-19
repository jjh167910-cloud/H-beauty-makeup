/** The few Cloudflare Workers types the salon chat's Worker uses (so the app needs no @cloudflare/workers-types). */
interface SqlStorage {
  exec(query: string, ...bindings: (string | number | null)[]): { toArray(): Record<string, unknown>[] };
}
interface DurableObjectState {
  storage: { sql: SqlStorage };
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
  waitUntil(work: Promise<unknown>): void;
}
interface DurableObjectStub { fetch(req: Request): Promise<Response> }
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}
declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    ctx: DurableObjectState;
    env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}
