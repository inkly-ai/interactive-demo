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
        return { config: config as DemoConfig, format: "json" };
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

export function serializeDemoConfig(config: DemoConfig, _parsed: ParsedConfig): string {
    return JSON.stringify(DemoSchema.parse(config), null, 2) + "\n";
}
