import { ExternalLinkIcon, Share2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { getDemoFiles, listDemoAssets, putDemoFiles } from "@/api";
import { CONFIG_PATH, parseDemoConfig } from "@/components/demo-editor/codec";
import { DemoEditorView } from "@/components/demo-editor/view";
import { lineDiff } from "@/components/preview-client/helpers";
import { SaveBadge } from "@/components/preview-client/sub-components";
import { InklyLogo } from "@/components/inkly-logo";

import { ShareDialog } from "./share-dialog";
import { Button } from "@/components/ui/button";
import { type AssetMeta } from "@/lib/assets";

const AUTOSAVE_DEBOUNCE_MS = 5000;
const SAVED_DECAY_MS = 1500;
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
 * the dev server, keeps the in-memory file map, and writes every dirty
 * file back to disk. The save state machine is the pre-pivot preview
 * client's (per-file dirty set, saved baseline, autosave debounce, ⌘S,
 * "Saved" decay); the draft server action became the local `putDemoFiles`
 * call. There is no draft/commit step — the demo folder is the only copy.
 */
export function EditorShell({ slug }: { slug: string }) {
    const [files, setFiles] = useState<Record<string, string> | null>(null);
    const filesRef = useRef<Record<string, string>>({});
    // Last-persisted snapshot of every file. Tracks the disk's truth so a
    // discarded edit can restore the saved baseline. Updated on initial
    // load and on successful saves.
    const [savedFiles, setSavedFiles] = useState<Record<string, string>>({});
    const savedFilesRef = useRef<Record<string, string>>({});
    const [dirty, setDirty] = useState<Set<string>>(() => new Set());
    const dirtyRef = useRef<Set<string>>(new Set());
    const [assets, setAssets] = useState<AssetMeta[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<
        "idle" | "saving" | "saved" | "error"
    >("idle");
    const [shareOpen, setShareOpen] = useState(false);

    useEffect(() => {
        filesRef.current = files ?? {};
    }, [files]);
    useEffect(() => {
        savedFilesRef.current = savedFiles;
    }, [savedFiles]);
    useEffect(() => {
        dirtyRef.current = dirty;
    }, [dirty]);

    const inFlightRef = useRef<Promise<boolean> | null>(null);
    const retryRef = useRef<number | null>(null);

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
                filesRef.current = loaded.files;
                savedFilesRef.current = loaded.files;
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

    const saveAllRef = useRef<() => Promise<void>>(() => Promise.resolve());

    const persistFiles = useCallback(
        async (
            nextFiles: Record<string, string>,
            filesToWrite: Record<string, string> = nextFiles,
            options: { keepalive?: boolean } = {},
        ): Promise<boolean> => {
            setSaveStatus("saving");
            // Saves are serialised: a batch never reaches the server before
            // the one sent ahead of it, so an older write cannot overwrite a
            // newer one.
            const previous = inFlightRef.current ?? Promise.resolve(true);
            const run = previous
                .catch(() => false)
                .then(() => putDemoFiles(slug, filesToWrite, [], options))
                .then(
                    () => {
                        setSaveStatus("saved");
                        savedFilesRef.current = nextFiles;
                        setSavedFiles(nextFiles);
                        setDirty((prev) => {
                            const next = new Set<string>();
                            for (const path of prev) {
                                if ((filesRef.current[path] ?? "") !== (nextFiles[path] ?? "")) {
                                    next.add(path);
                                }
                            }
                            return next;
                        });
                        return true;
                    },
                    (err: Error) => {
                        setSaveStatus("error");
                        toast.error(`Save failed: ${err.message}`);
                        // Retry once after a pause; the next edit retries too.
                        if (retryRef.current == null) {
                            retryRef.current = window.setTimeout(() => {
                                retryRef.current = null;
                                void saveAllRef.current();
                            }, SAVE_RETRY_MS);
                        }
                        return false;
                    },
                );
            inFlightRef.current = run;
            const ok = await run;
            if (inFlightRef.current === run) inFlightRef.current = null;
            return ok;
        },
        [slug],
    );

    const handleChange = useCallback(
        (path: string, value: string | undefined) => {
            const next = value ?? "";
            if ((filesRef.current[path] ?? "") === next) return;
            setFiles((prev) => {
                if (prev?.[path] === next) return prev;
                const updated = { ...(prev ?? {}), [path]: next };
                filesRef.current = updated;
                return updated;
            });
            setDirty((prev) => {
                if (prev.has(path)) return prev;
                const n = new Set(prev);
                n.add(path);
                return n;
            });
        },
        [],
    );

    // Autosave: 5s after the last edit. The effect re-runs whenever
    // `files` changes — each change clears the previous timer and starts
    // a fresh 5s window, which is the debounce. When the user finally
    // stops editing the timer fires, saveAll() persists every dirty path,
    // and the status flips to "Saving" → "Saved" → idle.
    useEffect(() => {
        if (dirty.size === 0) return;
        const timer = window.setTimeout(() => {
            void saveAllRef.current();
        }, AUTOSAVE_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [files, dirty]);

    // Drop the "Saved" pill back to idle a moment after it appears so it
    // doesn't loiter in the header indefinitely once the user stops typing.
    useEffect(() => {
        if (saveStatus !== "saved") return;
        const timer = window.setTimeout(() => {
            setSaveStatus("idle");
        }, SAVED_DECAY_MS);
        return () => window.clearTimeout(timer);
    }, [saveStatus]);

    const [bulkSaving, setBulkSaving] = useState(false);
    const bulkSavingRef = useRef(false);
    const saveAll = useCallback(async () => {
        if (bulkSavingRef.current) return;
        bulkSavingRef.current = true;
        setBulkSaving(true);
        try {
            if (dirtyRef.current.size > 0) {
                await persistFiles(filesRef.current);
            }
        } finally {
            bulkSavingRef.current = false;
            setBulkSaving(false);
        }
    }, [persistFiles]);
    useEffect(() => {
        saveAllRef.current = saveAll;
    }, [saveAll]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                void saveAll();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [saveAll]);

    // Warn before a hard unload (reload / tab close) while there are in-memory
    // edits the autosave debounce hasn't flushed to disk yet — those are lost
    // outright — or while a save is still in flight.
    useEffect(() => {
        if (dirty.size === 0 && !bulkSaving) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [dirty.size, bulkSaving]);

    // Save whatever is dirty when the tab is hidden or closed. The request
    // uses keepalive so it can outlive the page.
    useEffect(() => {
        const onHide = () => {
            if (document.visibilityState !== "hidden") return;
            if (dirtyRef.current.size === 0) return;
            const batch: Record<string, string> = {};
            for (const path of dirtyRef.current) {
                batch[path] = filesRef.current[path] ?? "";
            }
            void persistFiles(filesRef.current, batch, { keepalive: true });
        };
        document.addEventListener("visibilitychange", onHide);
        window.addEventListener("pagehide", onHide);
        return () => {
            document.removeEventListener("visibilitychange", onHide);
            window.removeEventListener("pagehide", onHide);
            if (retryRef.current != null) window.clearTimeout(retryRef.current);
        };
    }, [persistFiles]);

    // While the config does not parse, poll the disk so a fix made in a
    // text editor shows up here without a manual reload.
    const configBroken = useMemo(() => {
        const source = files?.[CONFIG_PATH];
        return source != null && !("config" in parseDemoConfig(source));
    }, [files]);
    useEffect(() => {
        if (!configBroken) return;
        const id = window.setInterval(async () => {
            if (dirtyRef.current.size > 0) return;
            try {
                const loaded = await getDemoFiles(slug);
                if (filesRef.current[CONFIG_PATH] === loaded.files[CONFIG_PATH]) return;
                filesRef.current = loaded.files;
                savedFilesRef.current = loaded.files;
                setFiles(loaded.files);
                setSavedFiles(loaded.files);
            } catch {
                /* try again on the next tick */
            }
        }, BROKEN_CONFIG_POLL_MS);
        return () => window.clearInterval(id);
    }, [configBroken, slug]);

    const dirtySummary = useMemo(() => {
        const rows: { path: string; added: number; removed: number }[] = [];
        for (const path of dirty) {
            const current = files?.[path] ?? "";
            const baseline = savedFiles[path] ?? "";
            const { added, removed } = lineDiff(baseline, current);
            rows.push({ path, added, removed });
        }
        rows.sort((a, b) => a.path.localeCompare(b.path));
        return rows;
    }, [dirty, files, savedFiles]);
    const dirtyTitle = dirtySummary
        .map((row) => `${row.path} +${row.added} −${row.removed}`)
        .join("\n");

    const title = files ? titleFromFiles(files, slug) : slug;

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
            <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
                <InklyLogo />
                <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
                <span className="truncate text-sm font-semibold">{title}</span>
                <div className="ml-auto flex items-center gap-2">
                    <span title={dirtyTitle || undefined} data-testid="save-badge">
                        <SaveBadge hasUnsavedChanges={dirty.size > 0} status={saveStatus} />
                    </span>
                    <Button
                        variant="secondary"
                        nativeButton={false}
                        render={<a href={demoHref(slug)} target="_blank" rel="noreferrer" />}
                    >
                        Open demo
                        <ExternalLinkIcon className="size-3.5" />
                    </Button>
                    <Button variant="primary" onClick={() => setShareOpen(true)}>
                        <Share2Icon className="size-3.5" />
                        Share
                    </Button>
                </div>
            </header>
            <ShareDialog slug={slug} open={shareOpen} onOpenChange={setShareOpen} />
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
