import type { Entrypoint } from '@denops/std';
import { App } from './app.ts';
import { logger, setLogLevel } from './util/logger.ts';

export const main: Entrypoint = (denops) => {
  const app = new App(denops);

  denops.dispatcher = {
    /** First-time setup. Creates .overleaf/, syncs all files. */
    async init(cookie: unknown, projectId: unknown): Promise<string> {
      await app.init(String(cookie), String(projectId));
      return 'ok';
    },

    /** Connect + sync using .overleaf/config.json. Cookie is optional. */
    async sync(cookie: unknown): Promise<string> {
      const c = cookie ? String(cookie) : undefined;
      const ok = await app.sync(c);
      return ok ? 'ok' : 'no_config';
    },

    async openDoc(docId: unknown, path: unknown): Promise<string> {
      await app.openDoc(String(docId), String(path));
      return 'ok';
    },

    async on_bytes(...args: unknown[]): Promise<void> {
      await app.handleOnBytes(args[0] as unknown[]);
    },

    on_detach(...args: unknown[]): void {
      app.handleOnDetach(args[0] as unknown[]);
    },

    getFileTree(): unknown {
      return app.getFileTree();
    },

    disconnect(): void {
      app.disconnect();
    },

    getStatus(): unknown {
      return app.getStatus();
    },

    getState(): string {
      return app.state;
    },

    setLogLevel(level: unknown): void {
      setLogLevel(String(level) as 'debug' | 'info' | 'warn' | 'error');
      logger.info('Log level set to %s', level);
    },
  };
};
