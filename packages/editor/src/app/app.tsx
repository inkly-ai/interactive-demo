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
    return (
        <main className="mx-auto max-w-xl p-8">
            <h1 className="mb-4 text-lg font-semibold">Demos</h1>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {demos && demos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No demos yet. Run <code>interactive-demo init --demo &lt;slug&gt;</code>.
                </p>
            ) : null}
            <ul className="space-y-1">
                {(demos ?? []).map((d) => (
                    <li key={d.slug}>
                        <a
                            className="text-sm underline-offset-2 hover:underline"
                            href={`#/${d.slug.split("/").map(encodeURIComponent).join("/")}`}
                        >
                            {d.title}
                        </a>{" "}
                        <code className="text-xs text-muted-foreground">{d.slug}</code>
                    </li>
                ))}
            </ul>
        </main>
    );
}
