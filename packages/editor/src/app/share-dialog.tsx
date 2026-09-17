import { ClipboardIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getDemoEmbed, type EmbedSnippets } from "@/api";
import {
    CodeCard,
    InputWithAction,
    LockedSurface,
    PaneHead,
    ShareNavItem,
    ShareRailHeader,
} from "@/components/preview-client/sub-components";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** A non-interactive heading between groups of nav items. */
function ShareNavGroupLabel({ children }: { children: React.ReactNode }) {
    return (
        <span className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-[color:var(--ink-2)]/70">
            {children}
        </span>
    );
}

export type ShareSection = "publish" | "inline" | "popup" | "react";

type PopupFramework = keyof EmbedSnippets["popup"]["triggers"];

const POPUP_FRAMEWORKS: ReadonlyArray<{ id: PopupFramework; label: string }> = [
    { id: "html", label: "HTML" },
    { id: "react", label: "React" },
    { id: "next", label: "Next.js" },
    { id: "vue", label: "Vue" },
    { id: "svelte", label: "Svelte" },
];

/** What the dev server's snippets carry before a real link replaces them. */
const PLACEHOLDER_ORIGIN = "https://YOUR-HOST";
const DEFAULT_LABEL = "Try the demo";

function frameworkLang(fw: PopupFramework): string {
    return fw === "html" ? "html" : fw === "react" || fw === "next" ? "tsx" : fw;
}

function parseLink(value: string): { url: string; origin: string } | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
        const url = new URL(trimmed);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        return { url: url.toString(), origin: url.origin };
    } catch {
        return null;
    }
}

/**
 * Swap the dev server's placeholder page and origin for the pasted link,
 * so the snippet is exactly what the CLI's `embed` command would print.
 */
function fillSnippet(snippet: string, placeholderPage: string, link: { url: string; origin: string }, label: string): string {
    return snippet
        .split(placeholderPage).join(link.url)
        .split(`${PLACEHOLDER_ORIGIN}/embed.js`).join(`${link.origin}/embed.js`)
        .split(DEFAULT_LABEL).join(label || DEFAULT_LABEL);
}

function useCopy() {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const copy = (key: string, value: string) => {
        navigator.clipboard?.writeText(value).then(
            () => {
                setCopiedKey(key);
                setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500);
            },
            () => {
                /* clipboard unavailable */
            },
        );
    };
    return { copiedKey, copy };
}

function StepBadge({ n }: { n: number }) {
    return (
        <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_oklab,var(--accent)_30%,var(--line-soft))] bg-[color:color-mix(in_oklab,var(--accent)_12%,var(--surface))] font-mono text-[11px] font-semibold text-[color:var(--accent-ink)]">
            {n}
        </span>
    );
}

function StepRow({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2.5 text-[12.5px] text-muted-foreground">
            <StepBadge n={n} />
            <span className="text-[13px] font-semibold text-[color:var(--ink-strong)]">{title}</span>
            {children}
        </div>
    );
}

function LinkField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">
                Your demo&apos;s link — from <code className="font-mono">publish</code>, or wherever you
                deployed <code className="font-mono">dist/</code>
            </span>
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://your-host.com/onboarding/"
                spellCheck={false}
                className="font-mono text-[12px]"
            />
        </label>
    );
}

function reactSnippet(slug: string): string {
    return `import { Demo, DemoModal } from '@inkly-org/interactive-demo';
import '@inkly-org/interactive-demo/styles.css';

// Copy demos/${slug}/ into your app's static files, then:
<Demo src="/demos/${slug}/" />

// Or behind a button, in a pop-up:
<DemoModal open={open} onClose={() => setOpen(false)}>
  <Demo src="/demos/${slug}/" />
</DemoModal>`;
}

/**
 * The share modal from the original preview client: a rail of sections on
 * the left, one pane on the right. Share holds the commands that publish;
 * Inline and Popup carry the embed snippets, filled in from the link the
 * CLI printed and locked until it is pasted; React shows the in-tree
 * component. Instructions only: nothing here deploys or uploads.
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
    const [section, setSection] = useState<ShareSection>("publish");
    const [snippets, setSnippets] = useState<EmbedSnippets | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [linkText, setLinkText] = useState("");
    const [framework, setFramework] = useState<PopupFramework>("html");
    const [label, setLabel] = useState(DEFAULT_LABEL);
    const { copiedKey, copy } = useCopy();

    useEffect(() => {
        if (!open) return;
        setSection("publish");
        setLoadError(null);
        let cancelled = false;
        getDemoEmbed(slug).then(
            (data) => {
                if (!cancelled) setSnippets(data);
            },
            (err: Error) => {
                if (!cancelled) setLoadError(err.message);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [open, slug]);

    const link = useMemo(() => parseLink(linkText), [linkText]);
    const lockedMessage = "Paste your demo's link to fill this in.";

    const inlineSnippet = snippets && link ? fillSnippet(snippets.inline, snippets.pageUrl, link, label) : null;
    const loaderSnippet = snippets && link ? fillSnippet(snippets.popup.loader, snippets.pageUrl, link, label) : null;
    const triggerSnippet = snippets && link ? fillSnippet(snippets.popup.triggers[framework], snippets.pageUrl, link, label) : null;

    const loginCommand = "npx interactive-demo login";
    const publishCommand = `npx interactive-demo publish ${slug}`;
    const embedCommand = `npx interactive-demo embed ${slug} --mode popup`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 overflow-hidden rounded-[16px] border border-[color:var(--line)] bg-[color:var(--surface)] p-0 sm:max-w-[940px]">
                <div className="flex min-h-[520px] min-w-0">
                    {/* Left rail */}
                    <aside
                        aria-label="Share options"
                        className="flex w-[220px] shrink-0 flex-col gap-3.5 border-r border-[color:var(--line-soft)] bg-[color:var(--canvas)] px-3 pb-3 pt-3.5"
                    >
                        <ShareRailHeader />
                        {/* Grouped by the decision that actually matters: does
                            the demo run in its own document, or inside your
                            app's? Inline and Pop-up are the same built page in
                            two shapes, so they belong together; the React
                            component is the other answer, not a third shape.
                            See docs/embedding.md. */}
                        <nav className="flex flex-col gap-px">
                            <ShareNavItem active={section === "publish"} onClick={() => setSection("publish")} label="Send the link" />
                            <ShareNavGroupLabel>Frame the page</ShareNavGroupLabel>
                            <ShareNavItem active={section === "inline"} onClick={() => setSection("inline")} label="Inline" />
                            <ShareNavItem active={section === "popup"} onClick={() => setSection("popup")} label="Pop-up" />
                            <ShareNavGroupLabel>In your React app</ShareNavGroupLabel>
                            <ShareNavItem active={section === "react"} onClick={() => setSection("react")} label="Component" />
                        </nav>
                    </aside>

                    {/* Right pane */}
                    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto px-6 py-5 pr-10">
                        {section === "publish" ? (
                            <>
                                <DialogHeader className="contents">
                                    <DialogTitle className="sr-only">Share</DialogTitle>
                                    <PaneHead
                                        title="Send the link"
                                        description="The simplest way to show a demo: give someone its URL. Publish from your terminal to get one, or deploy dist/ to your own host — the embed panes work with either."
                                    />
                                </DialogHeader>
                                <StepRow n={1} title="Log in once" />
                                <CodeCard lang="sh" value={loginCommand} copied={copiedKey === "login"} onCopy={() => copy("login", loginCommand)} />
                                <StepRow n={2} title="Publish this demo">
                                    <span>prints the link and its embed snippet</span>
                                </StepRow>
                                <CodeCard lang="sh" value={publishCommand} copied={copiedKey === "publish"} onCopy={() => copy("publish", publishCommand)} />
                                <StepRow n={3} title="Paste the link here">
                                    <span>to fill in the embed panes</span>
                                </StepRow>
                                <InputWithAction
                                    value={linkText}
                                    onChange={setLinkText}
                                    placeholder="https://your-host.com/onboarding/"
                                    copied={copiedKey === "link"}
                                    onCopy={() => link && copy("link", link.url)}
                                />
                            </>
                        ) : section === "inline" ? (
                            <>
                                <DialogHeader className="contents">
                                    <DialogTitle className="sr-only">Inline embed</DialogTitle>
                                    <PaneHead
                                        title="Inline embed"
                                        description="Add this demo directly to a page so visitors can watch it without leaving your site. The box is sized to the demo, so the player fills it exactly."
                                    />
                                </DialogHeader>
                                <LinkField value={linkText} onChange={setLinkText} />
                                {loadError ? <p className="text-[12.5px] text-destructive">{loadError}</p> : null}
                                {inlineSnippet ? (
                                    <CodeCard lang="embed.html" value={inlineSnippet} copied={copiedKey === "inline"} onCopy={() => copy("inline", inlineSnippet)} />
                                ) : (
                                    <LockedSurface message={lockedMessage}>
                                        <CodeCard lang="embed.html" value={snippets?.inline ?? "<iframe …></iframe>"} />
                                    </LockedSurface>
                                )}
                            </>
                        ) : section === "popup" ? (
                            <>
                                <DialogHeader className="contents">
                                    <DialogTitle className="sr-only">Popup embed</DialogTitle>
                                    <PaneHead
                                        title="Popup embed"
                                        description="Add a button or link that opens the demo in a pop-up overlay."
                                    />
                                </DialogHeader>
                                <LinkField value={linkText} onChange={setLinkText} />
                                <StepRow n={1} title="Add the script">
                                    <span>
                                        in{" "}
                                        <code className="rounded-[5px] border border-[color:var(--line-soft)] bg-[color:var(--canvas)] px-1.5 py-px font-mono text-[11.5px] text-[color:var(--ink-2)]">&lt;head&gt;</code>{" "}
                                        or{" "}
                                        <code className="rounded-[5px] border border-[color:var(--line-soft)] bg-[color:var(--canvas)] px-1.5 py-px font-mono text-[11.5px] text-[color:var(--ink-2)]">&lt;body&gt;</code>
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="ml-auto h-[26px] gap-1.5 px-2.5 text-[11.5px]"
                                        disabled={!loaderSnippet}
                                        onClick={() => loaderSnippet && copy("loader", loaderSnippet)}
                                    >
                                        <ClipboardIcon className="size-3.5" />
                                        {copiedKey === "loader" ? "Copied" : "Copy"}
                                    </Button>
                                </StepRow>
                                {loaderSnippet ? (
                                    <CodeCard lang="script.html" value={loaderSnippet} />
                                ) : (
                                    <LockedSurface message={lockedMessage}>
                                        <CodeCard lang="script.html" value={snippets?.popup.loader ?? "<script …></script>"} />
                                    </LockedSurface>
                                )}
                                <div className="flex flex-wrap items-center gap-3">
                                    <StepRow n={2} title="Choose a trigger" />
                                    <div className="inline-flex items-center gap-0.5 rounded-[9px] border border-[color:var(--line-soft)] bg-[color:var(--canvas)] p-[2px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
                                        {POPUP_FRAMEWORKS.map((fw) => (
                                            <button
                                                key={fw.id}
                                                type="button"
                                                aria-pressed={framework === fw.id}
                                                onClick={() => setFramework(fw.id)}
                                                className={
                                                    "inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors " +
                                                    (framework === fw.id
                                                        ? "bg-[color:var(--surface)] text-[color:var(--ink-strong)] shadow-[var(--shadow-lift)]"
                                                        : "text-muted-foreground hover:text-[color:var(--ink-2)]")
                                                }
                                            >
                                                {fw.label}
                                            </button>
                                        ))}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="ml-auto h-[26px] gap-1.5 px-2.5 text-[11.5px]"
                                        disabled={!triggerSnippet}
                                        onClick={() => triggerSnippet && copy("trigger", triggerSnippet)}
                                    >
                                        <ClipboardIcon className="size-3.5" />
                                        {copiedKey === "trigger" ? "Copied" : "Copy"}
                                    </Button>
                                </div>
                                <label className="flex flex-col gap-1.5">
                                    <span className="text-[12px] font-medium text-muted-foreground">Button label</span>
                                    <Input value={label} onChange={(e) => setLabel(e.target.value)} className="w-48" />
                                </label>
                                {triggerSnippet ? (
                                    <CodeCard lang={`trigger.${frameworkLang(framework)}`} value={triggerSnippet} />
                                ) : (
                                    <LockedSurface message={lockedMessage}>
                                        <CodeCard lang={`trigger.${frameworkLang(framework)}`} value={snippets?.popup.triggers[framework] ?? "<button …>"} />
                                    </LockedSurface>
                                )}
                                <p className="text-[12.5px] text-muted-foreground">
                                    The same snippet comes from <code className="font-mono">{embedCommand}</code>.
                                </p>
                            </>
                        ) : (
                            <>
                                <DialogHeader className="contents">
                                    <DialogTitle className="sr-only">React component</DialogTitle>
                                    <PaneHead
                                        title="React component"
                                        description="If your site is React, render the player in your own tree — no iframe, no second copy of the runtime."
                                    />
                                </DialogHeader>
                                <CodeCard lang="demo.tsx" value={reactSnippet(slug)} copied={copiedKey === "react"} onCopy={() => copy("react", reactSnippet(slug))} />
                                <p className="text-[12.5px] text-muted-foreground">
                                    The component reads the same <code className="font-mono">demo.config.json</code> this editor writes, so edits here show up there without changes.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
