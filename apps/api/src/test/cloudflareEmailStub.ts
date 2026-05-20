// Vitest runs in Node, where the `cloudflare:email` module doesn't exist. The
// EmailMessage class never actually runs in tests — the email send path is
// gated on the `SEND_EMAIL` binding which is undefined in test env. See
// `vitest.config.ts` for the alias that swaps this in.

export class EmailMessage {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly raw: string,
  ) {}
}
