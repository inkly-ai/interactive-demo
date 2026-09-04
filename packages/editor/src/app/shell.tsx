import { ExternalLinkIcon, HomeIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { getDemoFiles, listDemoAssets, putDemoFiles } from "@/api";
import { CONFIG_PATH, parseDemoConfig } from "@/components/demo-editor/codec";
import { DemoEditorView } from "@/components/demo-editor/view";
import { SaveBadge } from "@/components/preview-client/sub-components";
import { Button } from "@/components/ui/button";
import { type AssetMeta } from "@/lib/assets";

const SAVE_DEBOUNCE_MS = 600;
const SAVE_RETRY_MS = 3000;
const BROKEN_CONFIG_POLL_MS = 2000;

function demoHref(slug: string): string {
    return `/${slug.split("/").map(encodeURIComponent).join("/")}/`;
}

function titleFromFiles(files: Record<string, string>, slug: string): string {
    const raw = files[CONFIG_PATH];
    if (!raw) return slug;
    try {
        const parsed = JSON.parse(raw) as { title?: unknown };
        return typeof parsed.title === "string" && parsed.title.trim()
            ? parsed.title
            : slug;
    } catch {
        return slug;
    }
}

/**
 * The editor shell for one demo: loads the demo's files and assets from
 * the dev server, keeps the in-memory file map, and writes every change
 * back to disk (debounced). There is no draft/commit step — the demo
 * folder is the only copy.
 */
export function EditorShell({ slug }: { slug: string }) {
    const [files, setFiles] = useState<Record<string, string> | null>(null);
    const [savedFiles, setSavedFiles] = useState<Record<string, string>>({});
    const [assets, setAssets] = useState<AssetMeta[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<
        "idle" | "saving" | "saved" | "error"
    >("idle");

    const pendingRef = useRef<Record<string, string>>({});
    const timerRef = useRef<number | null>(null);
    const retryRef = useRef<number | null>(null);
    const inFlightRef = useRef<Promise<void> | null>(null);

    const refetchAssets = useCallback(async () => {
        try {
            setAssets(await listDemoAssets(slug));
        } catch {
            /* best-effort */
        }
    }, [slug]);

    useEffect(() => {
        let cancelled = false;
        Promise.all([getDemoFiles(slug), listDemoAssets(slug)]).then(
            ([loaded, loadedAssets]) => {
                if (cancelled) return;
                setFiles(loaded.files);
                setSavedFiles(loaded.files);
                setAssets(loadedAssets);
            },
            (err: Error) => {
                if (!cancelled) setLoadError(err.message);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [slug]);

    const flush = useCallback(
        async (options: { keepalive?: boolean } = {}) => {
            if (timerRef.current != null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            const batch = pendingRef.current;
            if (Object.keys(batch).length === 0) return;
            pendingRef.current = {};
            setSaveStatus("saving");
            // Saves are serialised: a batch never reaches the server before
            // the one sent ahead of it, so an older write cannot overwrite a
            // newer one.
            const previous = inFlightRef.current ?? Promise.resolve();
            const run = previous
                .catch(() => undefined)
                .then(() => putDemoFiles(slug, batch, [], options))
                .then(
                    () => {
                        setSavedFiles((current) => ({ ...current, ...batch }));
                        setSaveStatus(
                            Object.keys(pendingRef.current).length > 0
                                ? "saving"
                                : "saved",
                        );
                    },
                    (err: Error) => {
                        // Put the batch back (newer pending edits win) and
                        // retry once after a pause; the next edit retries too.
                        pendingRef.current = { ...batch, ...pendingRef.current };
                        setSaveStatus("error");
                        toast.error(`Save failed: ${err.message}`);
                        if (retryRef.current == null) {
                            retryRef.current = window.setTimeout(() => {
                                retryRef.current = null;
                                void flush();
                            }, SAVE_RETRY_MS);
                        }
                    },
                );
            inFlightRef.current = run;
            await run;
            if (inFlightRef.current === run) inFlightRef.current = null;
        },
        [slug],
    );

    const handleChange = useCallback(
        (path: string, content: string) => {
            setFiles((current) => ({ ...(current ?? {}), [path]: content }));
            pendingRef.current[path] = content;
            if (timerRef.current != null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => {
                void flush();
            }, SAVE_DEBOUNCE_MS);
        },
        [flush],
    );

    // Save whatever is pending when the tab is hidden or closed, and warn
    // before unloading while a save is still pending or in flight.
    useEffect(() => {
        const onHide = () => {
            if (document.visibilityState === "hidden") {
                void flush({ keepalive: true });
            }
        };
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (
                Object.keys(pendingRef.current).length > 0 ||
                inFlightRef.current != null
            ) {
                event.preventDefault();
                event.returnValue = "";
            }
        };
        document.addEventListener("visibilitychange", onHide);
        window.addEventListener("pagehide", onHide);
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            document.removeEventListener("visibilitychange", onHide);
            window.removeEventListener("pagehide", onHide);
            window.removeEventListener("beforeunload", onBeforeUnload);
            if (retryRef.current != null) window.clearTimeout(retryRef.current);
        };
    }, [flush]);

    // While the config does not parse, poll the disk so a fix made in a
    // text editor shows up here without a manual reload.
    const configBroken = useMemo(() => {
        const source = files?.[CONFIG_PATH];
        return source != null && !("config" in parseDemoConfig(source));
    }, [files]);
    useEffect(() => {
        if (!configBroken) return;
        const id = window.setInterval(async () => {
            if (Object.keys(pendingRef.current).length > 0) return;
            try {
                const loaded = await getDemoFiles(slug);
                setFiles((current) =>
                    current?.[CONFIG_PATH] === loaded.files[CONFIG_PATH]
                        ? current
                        : loaded.files,
                );
                setSavedFiles((current) =>
                    current[CONFIG_PATH] === loaded.files[CONFIG_PATH]
                        ? current
                        : loaded.files,
                );
            } catch {
                /* try again on the next tick */
            }
        }, BROKEN_CONFIG_POLL_MS);
        return () => window.clearInterval(id);
    }, [configBroken, slug]);

    const hasUnsavedChanges = useMemo(() => {
        if (!files) return false;
        return Object.keys(files).some((path) => files[path] !== savedFiles[path]);
    }, [files, savedFiles]);

    const title = files ? titleFromFiles(files, slug) : slug;

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
            <header className="flex h-11 shrink-0 items-center gap-3 border-b px-3">
                <Button
                    variant="ghost"
                    size="icon"
                    nativeButton={false}
                    render={<a href="#/" aria-label="All demos" />}
                >
                    <HomeIcon className="size-4" />
                </Button>
                <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{title}</span>
                    <code className="text-xs text-muted-foreground">{slug}</code>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <SaveBadge hasUnsavedChanges={hasUnsavedChanges} status={saveStatus} />
                    <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<a href={demoHref(slug)} target="_blank" rel="noreferrer" />}
                    >
                        Open demo
                        <ExternalLinkIcon className="size-3.5" />
                    </Button>
                </div>
            </header>
            <section className="relative min-h-0 flex-1">
                {loadError ? (
                    <div className="p-6 text-sm text-destructive">{loadError}</div>
                ) : files ? (
                    <DemoEditorView
                        files={files}
                        onChange={handleChange}
                        slug={slug}
                        assets={assets}
                        onAssetsChanged={refetchAssets}
                    />
                ) : (
                    <div className="p-6 text-sm text-muted-foreground">Loading…</div>
                )}
            </section>
        </div>
    );
}
