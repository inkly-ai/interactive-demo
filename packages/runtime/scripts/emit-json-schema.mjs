// Emits dist/schema/demo.config.json from the Zod DemoSchema so the
// published `$schema` document can never drift from what the player parses.
// Runs after tsup (it imports the built ESM schema entry).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ignoreOverride, zodToJsonSchema } from 'zod-to-json-schema';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const schema = await import(join(distDir, 'schema', 'index.js'));

const options = { target: 'jsonSchema7', $refStrategy: 'none' };

// `AnnotationSchema` and `WidgetSchema` are `z.any()` + `superRefine`
// wrappers (precise errors for known `type`s, parse-and-skip for unknown
// ones), which zod-to-json-schema can only render as `{}`. Publish what
// they actually accept: the known discriminated union, or any object whose
// `type` is none of the known ones.
function tolerantUnion(known, knownTypes, what) {
  const body = zodToJsonSchema(known, options);
  delete body.$schema;
  return {
    anyOf: [
      body,
      {
        type: 'object',
        required: ['type'],
        additionalProperties: true,
        not: { required: ['type'], properties: { type: { enum: [...knownTypes] } } },
        description: `Any other ${what} \`type\`: accepted and skipped by the player (forward compatibility).`,
      },
    ],
  };
}

const overrides = new Map([
  [schema.AnnotationSchema._def, () => tolerantUnion(schema.KnownAnnotationSchema, schema.KNOWN_ANNOTATION_TYPES, 'annotation')],
  [schema.WidgetSchema._def, () => tolerantUnion(schema.KnownWidgetSchema, schema.KNOWN_WIDGET_TYPES, 'widget')],
]);

const body = zodToJsonSchema(schema.DemoSchema, {
  ...options,
  override: (def) => overrides.get(def)?.() ?? ignoreOverride,
});
const doc = {
  $id: schema.DEMO_CONFIG_SCHEMA_URL,
  title: 'Demo config (demo.config.json)',
  description: 'Per-demo configuration. One per demo, lives at demos/<slug>/demo.config.json.',
  ...body,
};
mkdirSync(join(distDir, 'schema'), { recursive: true });
writeFileSync(join(distDir, 'schema', 'demo.config.json'), `${JSON.stringify(doc, null, 2)}\n`);
