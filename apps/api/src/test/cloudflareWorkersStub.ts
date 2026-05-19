// Vitest runs in Node, where the `cloudflare:workers` module doesn't exist.
// The Workflow class never actually runs in tests — we only need shapes that
// the test loader can resolve so module imports don't blow up. See
// `vitest.config.ts` for the alias that swaps this in.

export class WorkflowEntrypoint<Env = unknown, _Params = unknown> {
  protected env: Env;
  // ctx is part of the real runtime signature; tests don't construct these.
  constructor(_ctx: unknown, env: Env) {
    this.env = env;
  }
  async run(_event: unknown, _step: unknown): Promise<void> {
    // no-op
  }
}

export interface WorkflowEvent<P> {
  payload: P;
}

export interface WorkflowStep {
  do<T>(name: string, ...args: unknown[]): Promise<T>;
}
