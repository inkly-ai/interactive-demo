import { normalizeApiBase, readConfig } from '../publish/config.js';
import { fetchDeploymentStatus } from '../publish/previews-api.js';
import {
  buildEmbedSnippetData,
  formatEmbedSnippet,
  type EmbedMode,
} from '../publish/embed-snippets.js';
import { playerSizeForConfig } from '../player-size.js';
import { loadProject } from '../project.js';
import { selectDemo } from './publish.js';

export interface EmbedOptions {
  cwd: string;
  /** A demo folder (e.g. `demos/intro`) or a slug. */
  path?: string;
  /** Select a demo by slug. */
  demo?: string;
  mode?: EmbedMode;
  label?: string;
  json?: boolean;
  silent?: boolean;
}

function out(silent: boolean | undefined, message: string): void {
  if (!silent) process.stdout.write(message);
}

/**
 * Print the embed snippet for a demo's hosted deployment: an inline iframe,
 * or the pop-up loader plus a trigger button. A demo that was never deployed
 * is refused rather than published: this command used to publish it first, and
 * a command that reads as "print" should not put a page on the internet.
 */
export async function runEmbed(options: EmbedOptions): Promise<{ mode: EmbedMode; url: string }> {
  const config = await readConfig();
  if (!config.token) {
    throw new Error('Not logged in. Run `interactive-demo login` first.');
  }
  const apiBase = normalizeApiBase(config.apiBase);

  const project = await loadProject(options.cwd);
  const demo = selectDemo(project, { cwd: options.cwd, path: options.path, demo: options.demo });

  const status = demo.idHealed
    ? { deployed: false as const }
    : await fetchDeploymentStatus({ apiBase, token: config.token, demoId: demo.config.id });
  if (!status.deployed || !status.latest) {
    throw new Error(
      `"${demo.slug}" has not been published yet. Run \`interactive-demo publish ${demo.slug}\` first; ` +
        'for a self-hosted build, `interactive-demo build` prints the same snippets.',
    );
  }
  const url = status.latest.url;

  const mode: EmbedMode = options.mode ?? 'inline';
  const label = options.label ?? 'Try the demo';
  const size = playerSizeForConfig(demo.config);

  if (options.json) {
    out(
      options.silent,
      JSON.stringify(
        { mode, url, snippets: buildEmbedSnippetData({ mode, url, origin: apiBase, label, size }) },
        null,
        2,
      ) + '\n',
    );
  } else {
    out(options.silent, `Embedding ${demo.slug} (${url})\n\n`);
    out(options.silent, formatEmbedSnippet({ mode, url, origin: apiBase, label, size }));
  }
  return { mode, url };
}
