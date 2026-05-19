import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // `cloudflare:workers` is only available inside the Workers runtime.
      // Map it to a stub so vitest (running in Node) can load files that
      // import it. The stub never actually executes — workflow code paths
      // aren't reached by the existing test suites.
      'cloudflare:workers': path.resolve(__dirname, 'src/test/cloudflareWorkersStub.ts'),
    },
  },
});
