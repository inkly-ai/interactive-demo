
import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import {
    BoldIcon,
    ItalicIcon,
    LinkIcon,
    ListIcon,
    ListOrderedIcon,
    PaletteIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * WYSIWYG markdown editor used in the annotation inspector. TipTap
 * keeps the document as ProseMirror state internally; `tiptap-markdown`
 * serializes to and parses from markdown on every change so the value
 * on disk stays a plain markdown string. Saves are debounced by React
 * batching — the parent decides what to do with the new markdown.
 */
export function MarkdownEditor({
    value,
    onChange,
    placeholder,
    minHeight = 64,
    color,
    onColorChange,
    showLists = true,
}: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    minHeight?: number;
    /**
     * Optional CSS color applied to the editor content + exposed as
     * an icon button in the toolbar. The host owns the value (it's a
     * stable per-widget setting, not a markdown mark) — when both
     * props are passed the toolbar gains a swatch + native color
     * input that emits changes via `onColorChange`. Omit both to
     * render the toolbar without the color affordance (e.g. the
     * message annotation editor, which has its own dedicated text
     * color picker further down its inspector).
     */
    color?: string;
    onColorChange?: (next: string | undefined) => void;
    showLists?: boolean;
}) {
    const colorInputRef = useRef<HTMLInputElement>(null);
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                blockquote: false,
                horizontalRule: false,
                codeBlock: false,
            }),
            Link.configure({
                openOnClick: false,
                autolink: true,
                HTMLAttributes: {
                    rel: "noopener noreferrer",
                    target: "_blank",
                },
            }),
            Markdown.configure({
                html: false,
                breaks: false,
                tightLists: true,
                transformPastedText: true,
                transformCopiedText: true,
            }),
        ],
        content: value,
        onUpdate({ editor }) {
            const storage = (
                editor.storage as unknown as {
                    markdown: { getMarkdown: () => string };
                }
            ).markdown;
            const next = storage.getMarkdown();
            if (next !== value) onChange(next);
        },
        editorProps: {
            attributes: {
                class: "md-editor focus:outline-none",
            },
        },
        // TipTap renders immediately by default; deferring matches Next's
        // hydration model and silences the SSR warning.
        immediatelyRender: false,
    });
    const active = useEditorState({
        editor,
        // An empty field has no formatted text, so nothing should read as
        // active — otherwise a mark left "armed" on the cursor after the
        // text is deleted lights up the toolbar (and would bold the next
        // character). Force every toggle off while the doc is empty.
        selector: ({ editor }) => {
            const empty = editor?.isEmpty ?? true;
            return {
                bold: !empty && (editor?.isActive("bold") ?? false),
                italic: !empty && (editor?.isActive("italic") ?? false),
                link: !empty && (editor?.isActive("link") ?? false),
                orderedList: !empty && (editor?.isActive("orderedList") ?? false),
                bulletList: !empty && (editor?.isActive("bulletList") ?? false),
            };
        },
    }) ?? {
        bold: false,
        italic: false,
        link: false,
        orderedList: false,
        bulletList: false,
    };

    // External value changes (selecting a different annotation) must reset
    // the document. Compare against the editor's current serialized
    // markdown to avoid feedback loops when the parent echoes the value
    // we just emitted from `onUpdate`.
    useEffect(() => {
        if (!editor) return;
        const storage = (
            editor.storage as unknown as {
                markdown: { getMarkdown: () => string };
            }
        ).markdown;
        const current = storage.getMarkdown();
        if (current.trim() === value.trim()) return;
        editor.commands.setContent(value, { emitUpdate: false });
    }, [value, editor]);

    // Deleting all text can leave a mark (e.g. bold) "armed" on the cursor,
    // so the emptied field would type bold and light the toolbar. Whenever
    // the doc goes empty with marks still armed, strip them so an empty
    // field is a genuine clean slate. Setting storedMarks to [] (not null)
    // overrides any marks inherited from the now-deleted text.
    useEffect(() => {
        if (!editor) return;
        const clearArmedMarksWhenEmpty = () => {
            if (!editor.isEmpty) return;
            const armed =
                editor.isActive("bold") ||
                editor.isActive("italic") ||
                editor.isActive("link") ||
                (editor.state.storedMarks?.length ?? 0) > 0;
            if (armed) {
                editor.view.dispatch(editor.state.tr.setStoredMarks([]));
            }
        };
        editor.on("update", clearArmedMarksWhenEmpty);
        editor.on("selectionUpdate", clearArmedMarksWhenEmpty);
        return () => {
            editor.off("update", clearArmedMarksWhenEmpty);
            editor.off("selectionUpdate", clearArmedMarksWhenEmpty);
        };
    }, [editor]);

    if (!editor) return null;

    const setLink = () => {
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("Link URL", prev ?? "https://");
        if (url === null) return;
        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }
        editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run();
    };

    const btnClass = (active: boolean) =>
        cn(
            "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-transparent text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--ink-strong)]",
            active &&
                "border-[color:var(--accent-ink)] bg-[color:var(--accent)] text-white shadow-[var(--shadow-primary-press)] hover:border-[color:var(--accent-ink)] hover:bg-[color:var(--accent)] hover:text-white",
        );

    return (
        <div className="overflow-hidden rounded-md border border-[color:var(--line)] bg-[color:var(--surface-2)] shadow-[var(--shadow-press)] focus-within:border-[color:var(--accent)] focus-within:shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]">
            <div className="flex items-center gap-0.5 border-b border-[color:var(--line)] bg-[color:var(--surface)] p-0.5">
                <button
                    type="button"
                    className={btnClass(active.bold)}
                    onClick={() =>
                        editor
                            .chain()
                            .focus()
                            .extendMarkRange("bold")
                            .toggleBold()
                            .run()
                    }
                    aria-pressed={active.bold}
                    aria-label="Bold"
                    title="Bold"
                >
                    <BoldIcon className="size-3.5" />
                </button>
                <button
                    type="button"
                    className={btnClass(active.italic)}
                    onClick={() =>
                        editor
                            .chain()
                            .focus()
                            .extendMarkRange("italic")
                            .toggleItalic()
                            .run()
                    }
                    aria-pressed={active.italic}
                    aria-label="Italic"
                    title="Italic"
                >
                    <ItalicIcon className="size-3.5" />
                </button>
                <button
                    type="button"
                    className={btnClass(active.link)}
                    onClick={setLink}
                    aria-pressed={active.link}
                    aria-label="Link"
                    title="Link"
                >
                    <LinkIcon className="size-3.5" />
                </button>
                {showLists ? (
                    <>
                        <button
                            type="button"
                            className={btnClass(active.orderedList)}
                            onClick={() =>
                                editor.chain().focus().toggleOrderedList().run()
                            }
                            aria-pressed={active.orderedList}
                            aria-label="Numbered list"
                            title="Numbered list"
                        >
                            <ListOrderedIcon className="size-3.5" />
                        </button>
                        <button
                            type="button"
                            className={btnClass(active.bulletList)}
                            onClick={() =>
                                editor.chain().focus().toggleBulletList().run()
                            }
                            aria-pressed={active.bulletList}
                            aria-label="Bulleted list"
                            title="Bulleted list"
                        >
                            <ListIcon className="size-3.5" />
                        </button>
                    </>
                ) : null}
                {onColorChange ? (
                    <>
                        <button
                            type="button"
                            className={cn(
                                btnClass(false),
                                "relative",
                            )}
                            onClick={() => colorInputRef.current?.click()}
                            aria-label="Text color"
                            title="Text color"
                        >
                            <PaletteIcon className="size-3.5" />
                            <span
                                aria-hidden
                                className="absolute bottom-0.5 left-1 right-1 h-0.5 rounded-full"
                                style={{
                                    background: color ?? "transparent",
                                }}
                            />
                        </button>
                        <input
                            ref={colorInputRef}
                            type="color"
                            value={color ?? "#0a0a0a"}
                            onChange={(e) =>
                                onColorChange(e.target.value || undefined)
                            }
                            // Position off-screen but keep it focusable
                            // so the native picker opens at the button.
                            className="absolute h-0 w-0 opacity-0"
                            aria-hidden
                            tabIndex={-1}
                        />
                    </>
                ) : null}
            </div>
            <EditorContent
                editor={editor}
                style={{
                    minHeight,
                    ...(color ? { color } : {}),
                }}
                data-placeholder={placeholder}
                className="px-2 py-1.5 text-[12.5px] leading-snug text-[color:var(--ink-strong)]"
            />
        </div>
    );
}
