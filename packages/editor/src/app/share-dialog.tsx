import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getDemoEmbed, type EmbedSnippets } from "@/api";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FRAMEWORKS: { id: keyof EmbedSnippets["popup"]["triggers"]; label: string }[] = [
    { id: "html", label: "HTML" },
    { id: "react", label: "React" },
    { id: "next", label: "Next.js" },
    { id: "vue", label: "Vue" },
    { id: "svelte", label: "Svelte" },
];

function Snippet({ code, label }: { code: string; label: string }) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const t = window.setTimeout(() => setCopied(false), 1500);
        return () => window.clearTimeout(t);
    }, [copied]);
    return (
        <div className="relative">
            <pre className="max-h-48 overflow-auto rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] p-3 pr-20 font-mono text-[12px] leading-5 whitespace-pre">
                {code}
            </pre>
            <Button
                variant="secondary"
                size="xs"
                className="absolute top-2 right-2"
                aria-label={`Copy ${label}`}
                onClick={async () => {
                    try {
                        await navigator.clipboard.writeText(code);
                        setCopied(true);
                    } catch {
                        toast.error("Could not copy. Select the snippet and copy it by hand.");
                    }
                }}
            >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? "Copied" : "Copy"}
            </Button>
        </div>
    );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <div className="flex gap-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--ink-strong)] text-[11px] font-semibold text-white">
                {n}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">{children}</div>
        </div>
    );
}

/**
 * How to put this demo on a page. Two routes: a static build on the
 * author's own host (inline iframe or pop-up button, snippets from the dev
 * server so they match the `embed` command), or a hosted link from
 * `publish`. The dialog only shows instructions; nothing here deploys.
 */
export function ShareDialog({
    slug,
    open,
    onOpenChange,
}: {
    slug: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [snippets, setSnippets] = useState<EmbedSnippets | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [framework, setFramework] = useState<keyof EmbedSnippets["popup"]["triggers"]>("html");

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setError(null);
        getDemoEmbed(slug).then(
            (data) => {
                if (!cancelled) setSnippets(data);
            },
            (err: Error) => {
                if (!cancelled) setError(err.message);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [open, slug]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-4 overflow-hidden sm:max-w-[640px]">
                <DialogHeader>
                    <DialogTitle>Share this demo</DialogTitle>
                    <DialogDescription>
                        Put it on your own site from a static build, or get a hosted link with one command.
                    </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="static" className="flex min-h-0 flex-1 flex-col gap-3">
                    <TabsList>
                        <TabsTrigger value="static">Your site</TabsTrigger>
                        <TabsTrigger value="hosted">Hosted link</TabsTrigger>
                    </TabsList>
                    <TabsContent value="static" className="flex min-h-0 flex-col gap-4 overflow-auto pr-1">
                        <Step n={1}>
                            <p>Build the static files and deploy the <code>dist/</code> folder to any static host.</p>
                            <Snippet code="npm run build" label="build command" />
                        </Step>
                        <Step n={2}>
                            <p>
                                Embed the page inline. Replace <code>YOUR-HOST</code> with where <code>dist/</code> lives.
                            </p>
                            {error ? (
                                <p className="text-destructive">{error}</p>
                            ) : snippets ? (
                                <Snippet code={snippets.inline} label="inline embed" />
                            ) : (
                                <p className="text-muted-foreground">Loading…</p>
                            )}
                        </Step>
                        <Step n={3}>
                            <p>Or open it from a button in a pop-up: add the loader once, then a button.</p>
                            {snippets ? (
                                <>
                                    <Snippet code={snippets.popup.loader} label="pop-up loader" />
                                    <div className="flex flex-wrap gap-1">
                                        {FRAMEWORKS.map((fw) => (
                                            <Button
                                                key={fw.id}
                                                size="xs"
                                                variant={framework === fw.id ? "secondary" : "ghost"}
                                                aria-pressed={framework === fw.id}
                                                onClick={() => setFramework(fw.id)}
                                            >
                                                {fw.label}
                                            </Button>
                                        ))}
                                    </div>
                                    <Snippet code={snippets.popup.triggers[framework]} label="pop-up button" />
                                </>
                            ) : null}
                        </Step>
                    </TabsContent>
                    <TabsContent value="hosted" className="flex min-h-0 flex-col gap-4 overflow-auto pr-1">
                        <Step n={1}>
                            <p>Log in once, then publish. You get a shareable link and the iframe snippet for it.</p>
                            <Snippet code={`npx interactive-demo login\nnpx interactive-demo publish ${slug}`} label="publish commands" />
                        </Step>
                        <Step n={2}>
                            <p>For a pop-up button on the hosted link, print the loader and a trigger for your framework.</p>
                            <Snippet code={`npx interactive-demo embed ${slug} --mode popup`} label="embed command" />
                        </Step>
                        <p className="text-muted-foreground text-xs">
                            Publishing again updates the same link, so embeds keep working.
                        </p>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
