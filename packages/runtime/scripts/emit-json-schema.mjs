// Emits dist/schema/demo.config.json from the Zod DemoSchema so the
// published `$schema` document can never drift from what the player parses.
// Runs after tsup (it imports the built ESM schema entry).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const schema = await import(join(distDir, 'schema', 'index.js'));

const body = zodToJsonSchema(schema.DemoSchema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
});
const doc = {
  $id: schema.DEMO_CONFIG_SCHEMA_URL,
  title: 'Demo config (demo.config.json)',
  description: 'Per-demo configuration. One per demo, lives at demos/<slug>/demo.config.json.',
  ...body,
};
mkdirSync(join(distDir, 'schema'), { recursive: true });
writeFileSync(join(distDir, 'schema', 'demo.config.json'), `${JSON.stringify(doc, null, 2)}\n`);
