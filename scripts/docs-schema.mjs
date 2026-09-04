// Renders docs/schema.md from the JSON schema the runtime build emits
// (packages/runtime/dist/schema/demo.config.json). Run after `npm run build`:
//   node scripts/docs-schema.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(
  readFileSync(join(root, 'packages/runtime/dist/schema/demo.config.json'), 'utf8'),
);

const sections = [];
const seen = new Map();

function typeOf(s) {
  if (!s || typeof s !== 'object') return 'any';
  if (s.const !== undefined) return `\`${JSON.stringify(s.const)}\``;
  if (s.enum) return s.enum.map((v) => `\`${JSON.stringify(v)}\``).join(' \\| ');
  if (s.anyOf) return s.anyOf.map(typeOf).join(' \\| ');
  if (s.type === 'array') return `${typeOf(s.items)}[]`;
  if (s.type === 'object') return 'object';
  if (Array.isArray(s.type)) return s.type.join(' \\| ');
  return s.type ?? 'any';
}

function describe(s) {
  const bits = [];
  if (s.description) bits.push(s.description.replace(/\s+/g, ' ').trim());
  if (s.default !== undefined) bits.push(`Default \`${JSON.stringify(s.default)}\`.`);
  if (s.minimum !== undefined || s.maximum !== undefined) {
    bits.push(`Range ${s.minimum ?? '…'}–${s.maximum ?? '…'}.`);
  }
  if (s.pattern) bits.push(`Pattern \`${s.pattern}\`.`);
  return bits.join(' ').replace(/\|/g, '\\|');
}

function objectSchemas(s) {
  if (!s || typeof s !== 'object') return [];
  if (s.type === 'object' && s.properties) return [s];
  if (s.anyOf) return s.anyOf.flatMap(objectSchemas);
  if (s.type === 'array') return objectSchemas(s.items);
  return [];
}

function variantTitle(s, fallback) {
  for (const key of ['kind', 'type', 'variant']) {
    const p = s.properties?.[key];
    if (p?.const !== undefined) return `${fallback} (${key} = \`${p.const}\`)`;
    if (p?.enum?.length === 1) return `${fallback} (${key} = \`${p.enum[0]}\`)`;
  }
  return fallback;
}

function emit(s, title, depth) {
  const sig = JSON.stringify(s);
  if (seen.has(sig)) return seen.get(sig);
  seen.set(sig, title);
  const index = sections.push('') - 1;
  const required = new Set(s.required ?? []);
  const rows = [];
  for (const [name, prop] of Object.entries(s.properties ?? {})) {
    let type = typeOf(prop);
    const objs = objectSchemas(prop);
    if (objs.length && depth < 4) {
      const links = objs.map((o) => {
        const t = emit(o, variantTitle(o, objs.length > 1 ? name : name), depth + 1);
        return `[${t}](#${t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')})`;
      });
      type = prop.type === 'array' ? `${links.join(' \\| ')}[]` : links.join(' \\| ');
    }
    rows.push(`| \`${name}\` | ${type} | ${required.has(name) ? 'yes' : ''} | ${describe(prop)} |`);
  }
  sections[index] =
    `${'#'.repeat(Math.min(depth + 2, 5))} ${title}\n\n${s.description ? s.description.replace(/\s+/g, ' ').trim() + '\n\n' : ''}| field | type | required | notes |\n|---|---|---|---|\n${rows.join('\n')}\n`;
  return title;
}

emit(schema, 'Demo (demo.config.json)', 0);

const out = `# demo.config.json reference

Generated from the JSON schema published with \`@inkly-org/interactive-demo\`
(\`dist/schema/demo.config.json\`). Regenerate with \`node scripts/docs-schema.mjs\`.
Point editors at the schema with:

\`\`\`json
{ "$schema": "${schema.$id}" }
\`\`\`

${sections.join('\n')}
> The published schema leaves \`annotations[]\` and \`widgets[]\` untyped (\`items: {}\`);
> their shapes are described in [authoring.md](authoring.md#steps).
`;
writeFileSync(join(root, 'docs/schema.md'), out);
console.log(`docs/schema.md: ${sections.length} sections, ${out.split('\n').length} lines`);
