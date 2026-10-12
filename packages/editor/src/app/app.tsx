import { useEffect, useState } from "react";
import { listDemos, type DemoSummary } from "@/api";
import { EditorShell } from "@/app/shell";

/**
 * Hash routing: `#/<slug>` opens the editor for one demo; anything else
 * lists the project's demos. The dev server serves this page for every
 * path under `/__demo/editor/`, so the hash is all the state we need.
 */
function slugFromHash(): string | null {
    const hash = window.location.hash.replace(/^#\/?/, "");
    if (!hash) return null;
    try {
        return decodeURIComponent(hash);
    } catch {
        return hash;
    }
}

export function App() {
    const [slug, setSlug] = useState<string | null>(() => slugFromHash());
    useEffect(() => {
        const onHashChange = () => setSlug(slugFromHash());
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, []);
    if (slug) return <EditorShell key={slug} slug={slug} />;
    return <DemoPicker />;
}

function DemoPicker() {
    const [demos, setDemos] = useState<DemoSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        listDemos().then(setDemos, (err: Error) => setError(err.message));
    }, []);
    // Laid out like the dev server's own index at `/`, which is where most
    // people arrive from: one card per demo, the same widths and type sizes.
    return (
        <main className="mx-auto min-h-screen w-full max-w-[720px] px-6 pt-16 pb-24">
            <header className="mb-6 flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-[22px] font-semibold tracking-tight">Demos</h1>
                    <p className="mt-1 text-[13px] text-muted-foreground">Pick one to edit.</p>
                </div>
                <a className="text-[13px] text-muted-foreground underline-offset-2 hover:underline" href="/">
                    Back to previews
                </a>
            </header>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {demos && demos.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
                    No demos yet. Run <code>interactive-demo init --demo &lt;slug&gt;</code>.
                </p>
            ) : null}
            <ul className="flex flex-col gap-2.5">
                {(demos ?? []).map((d) => (
                    <li key={d.slug}>
                        <a
                            className="flex items-center justify-between gap-4 rounded-[10px] border border-border bg-card px-4 py-3 shadow-xs transition-shadow hover:shadow-sm"
                            href={`#/${d.slug.split("/").map(encodeURIComponent).join("/")}`}
                        >
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-sm font-medium">{d.title}</span>
                                <code className="truncate text-xs text-muted-foreground">{d.slug}</code>
                            </span>
                            <span className="shrink-0 text-xs font-medium text-muted-foreground">Edit</span>
                        </a>
                    </li>
                ))}
            </ul>
        </main>
    );
}
