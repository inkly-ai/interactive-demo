import {
    DemoSchema,
    healDemoConfig,
    type Demo as DemoConfig,
} from "@inkly-org/interactive-demo/schema";

// Keep this structural so schema issues remain compatible even when the app
// and the demo schema package resolve different Zod entrypoints.
export type SchemaIssue = {
    message: string;
    path: readonly (string | number)[];
    code?: string;
};

/**
 * Structurally extract Zod-style issues from a thrown error. We can't
 * `instanceof ZodError` here: demo-schema resolves its own Zod entrypoint
 * (a different class identity than the app's), so the check would miss.
 * A ZodError exposes an `issues` array of `{ path, message, code }`, which
 * is all the editor's fix-config flow needs.
 */
function extractSchemaIssues(err: unknown): SchemaIssue[] | null {
    const issues = (err as { issues?: unknown })?.issues;
    if (!Array.isArray(issues)) return null;
    return issues.map((issue) => {
        const i = issue as {
            path?: unknown;
            message?: unknown;
            code?: unknown;
        };
        return {
            path: Array.isArray(i.path)
                ? (i.path as (string | number)[])
                : [],
            message: typeof i.message === "string" ? i.message : "Invalid value",
            code: typeof i.code === "string" ? i.code : undefined,
        };
    });
}

export const CONFIG_PATH = "demo.config.json";

export type ParsedConfig = {
    config: DemoConfig;
    /**
     * The config exactly as `JSON.parse` saw it on disk — key order, the
     * `$schema` line, and the absence of every field the author left to its
     * default. {@link serializeDemoConfig} writes edits back into this shape.
     */
    authored: unknown;
    format: "json";
};

export type ParseFailure =
    | { kind: "json"; message: string }
    | { kind: "schema"; issues: readonly SchemaIssue[] };

export type ParseResult = ParsedConfig | { error: ParseFailure };

export function parseDemoConfigJson(src: string): ParseResult {
    let raw: unknown;
    try {
        raw = JSON.parse(src);
    } catch (err) {
        return {
            error: {
                kind: "json",
                message: err instanceof Error ? err.message : "Invalid JSON",
            },
        };
    }
    // Heal-before-parse: a config missing/with a malformed `id` is repaired
    // in-memory (the editor mints + later persists one) rather than shown to
    // the user as a schema error. Any OTHER violation still surfaces as a
    // `schema` failure so the "fix demo config" flow can act on it.
    try {
        const { config } = healDemoConfig(raw);
        return { config: config as DemoConfig, authored: raw, format: "json" };
    } catch (err) {
        const issues = extractSchemaIssues(err);
        if (issues) {
            return { error: { kind: "schema", issues } };
        }
        return {
            error: {
                kind: "json",
                message: err instanceof Error ? err.message : "Invalid config",
            },
        };
    }
}

export function parseDemoConfig(src: string): ParseResult {
    return parseDemoConfigJson(src);
}

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const ka = Object.keys(a);
        const kb = Object.keys(b);
        return (
            ka.length === kb.length &&
            ka.every((k) => k in b && deepEqual(a[k], b[k]))
        );
    }
    return false;
}

/** The `id` of an array element, when it has one the author can recognise. */
function elementId(value: unknown): string | null {
    if (!isPlainObject(value)) return null;
    return typeof value.id === "string" ? value.id : null;
}

/**
 * Line up an edited array with the one on disk. Elements carrying an `id`
 * are matched by it, so a reorder or an insertion doesn't shift every later
 * element onto the wrong counterpart; the rest fall back to position.
 */
function counterpart(source: unknown, item: unknown, index: number): unknown {
    if (!Array.isArray(source)) return undefined;
    const id = elementId(item);
    if (id != null) {
        const match = source.find((candidate) => elementId(candidate) === id);
        if (match !== undefined) return match;
        return undefined;
    }
    return source[index];
}

/**
 * Re-shape `next` to read like the file the author wrote.
 *
 * `next` comes out of the schema, so every optional field carries its
 * default and every key sits in schema order. Writing that back turns a
 * one-field edit into a whole-file rewrite: `$schema` sinks to the bottom,
 * hand-ordered keys shuffle, and defaults the author never typed appear
 * everywhere. So: keep the authored keys in the authored order, and drop a
 * key the author didn't write when it still equals what the schema filled
 * in (`baseline`). Anything the edit actually changed, or genuinely added,
 * is written out in full, and a key the schema stripped on the way in is
 * carried across untouched.
 */
function reshape(
    authored: unknown,
    baseline: unknown,
    next: unknown,
    isRoot = false,
    dropDefaults = true,
): unknown {
    if (Array.isArray(next)) {
        return next.map((item, i) =>
            reshape(
                counterpart(authored, item, i),
                counterpart(baseline, item, i),
                item,
                false,
                dropDefaults,
            ),
        );
    }
    if (!isPlainObject(next)) return next;

    const authoredObj = isPlainObject(authored) ? authored : {};
    const baselineObj = isPlainObject(baseline) ? baseline : {};
    const out: JsonObject = {};
    for (const key of Object.keys(authoredObj)) {
        if (!(key in next)) {
            // Only the root and the step objects pass unknown keys through;
            // every other schema strips them. So a key missing from both the
            // edited config AND the baseline was never visible to the editor
            // in the first place — an author's own note, not something the
            // edit removed — and deleting it would lose content from a file
            // the edit never touched. A key the baseline did carry is a real
            // deletion, and still goes.
            if (!(key in baselineObj)) out[key] = authoredObj[key];
            continue;
        }
        out[key] = reshape(
            authoredObj[key],
            baselineObj[key],
            next[key],
            false,
            dropDefaults,
        );
    }
    for (const key of Object.keys(next)) {
        if (key in authoredObj) continue;
        // The root `id` is never a default: when the config on disk had
        // none, heal minted one, and this write is what persists it.
        const minted = isRoot && key === "id";
        if (
            !minted &&
            dropDefaults &&
            key in baselineObj &&
            deepEqual(next[key], baselineObj[key])
        ) {
            continue;
        }
        out[key] = next[key];
    }
    return out;
}

/**
 * Paths in `expected` that `actual` does not reproduce. Keys `actual` carries
 * on top of `expected` are ignored: those are the author's own passthrough
 * extras, not something the write lost.
 */
function divergentPaths(
    expected: unknown,
    actual: unknown,
    path: (string | number)[] = [],
    out: (string | number)[][] = [],
): (string | number)[][] {
    if (Array.isArray(expected)) {
        if (!Array.isArray(actual) || actual.length !== expected.length) {
            out.push(path);
            return out;
        }
        expected.forEach((item, i) =>
            divergentPaths(item, actual[i], [...path, i], out),
        );
        return out;
    }
    if (isPlainObject(expected)) {
        if (!isPlainObject(actual)) {
            out.push(path);
            return out;
        }
        for (const key of Object.keys(expected)) {
            if (!(key in actual)) {
                out.push([...path, key]);
                continue;
            }
            divergentPaths(expected[key], actual[key], [...path, key], out);
        }
        return out;
    }
    if (!deepEqual(expected, actual)) out.push(path);
    return out;
}

function valueAt(root: unknown, path: readonly (string | number)[]): unknown {
    let node: unknown = root;
    for (const segment of path) {
        if (Array.isArray(node) && typeof segment === "number") {
            node = node[segment];
        } else if (isPlainObject(node) && typeof segment === "string") {
            node = node[segment];
        } else {
            return undefined;
        }
    }
    return node;
}

/** Write `source`'s value at `path` into `target`. False if the path is gone. */
function restoreAt(
    target: unknown,
    source: unknown,
    path: readonly (string | number)[],
): boolean {
    if (path.length === 0) return false;
    const parent = valueAt(target, path.slice(0, -1));
    const last = path[path.length - 1]!;
    const value = valueAt(source, path);
    if (isPlainObject(parent) && typeof last === "string") {
        parent[last] = value;
        return true;
    }
    if (Array.isArray(parent) && typeof last === "number") {
        parent[last] = value;
        return true;
    }
    return false;
}

const MAX_REPAIR_PASSES = 4;

/**
 * Dropping a key the author left out is a guess: it assumes the schema will
 * fill the same value back in. That holds for a static default, but not for
 * one the schema DERIVES from a sibling — `showMessage` follows `variant` —
 * where the baseline value belongs to the shape the config had BEFORE the
 * edit. Switching a hotspot from cursor to pointer would drop a `showMessage:
 * false` the schema then re-derives as `true`, quietly pinning a card the
 * author had set to reveal on hover.
 *
 * So verify the guess instead of special-casing the fields behind it: parse
 * what we are about to write and put back whatever did not survive the round
 * trip. `null` means the guess can't be repaired and the caller should write
 * every key instead.
 */
function withRoundTripRepairs(
    candidate: JsonObject,
    validated: unknown,
): JsonObject | null {
    for (let pass = 0; pass < MAX_REPAIR_PASSES; pass += 1) {
        let reparsed: unknown;
        try {
            reparsed = DemoSchema.parse(candidate) as unknown;
        } catch {
            return null;
        }
        const paths = divergentPaths(validated, reparsed);
        if (paths.length === 0) return candidate;
        let repaired = false;
        for (const path of paths) {
            if (restoreAt(candidate, validated, path)) repaired = true;
        }
        if (!repaired) return null;
    }
    return null;
}

export function serializeDemoConfig(config: DemoConfig, parsed: ParsedConfig): string {
    const validated = DemoSchema.parse(config) as unknown;
    const shaped = (dropDefaults: boolean) =>
        reshape(parsed.authored, parsed.config, validated, true, dropDefaults);
    const trimmed = shaped(true);
    const out =
        (isPlainObject(trimmed)
            ? withRoundTripRepairs(trimmed, validated)
            : null) ?? shaped(false);
    return JSON.stringify(out, null, 2) + "\n";
}
