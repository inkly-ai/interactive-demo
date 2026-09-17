import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getDemoFiles: vi.fn(),
    listDemoAssets: vi.fn(),
    putDemoFiles: vi.fn(),
    getDemoEmbed: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/api", () => api);
vi.mock("sonner", () => ({ toast }));
// The real editor view needs a parsed demo and a stage; the shell's saving
// logic only needs something that reports a change. The button's `data-p`
// picks the file, `data-v` the content.
vi.mock("@/components/demo-editor/view", () => ({
    DemoEditorView: ({
        onChange,
    }: {
        onChange: (path: string, content: string) => void;
    }) => (
        <button
            type="button"
            onClick={(event) => {
                const el = event.target as HTMLElement;
                onChange(el.dataset.p ?? "demo.config.json", el.dataset.v ?? "");
            }}
            data-testid="edit"
        >
            edit
        </button>
    ),
}));

import { EditorShell } from "./shell";

const FILES = { "demo.config.json": "{}", "notes.md": "hello" };

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe("EditorShell saving", () => {
    beforeEach(() => {
        api.getDemoFiles.mockResolvedValue({ files: FILES, binary: [] });
        api.listDemoAssets.mockResolvedValue([]);
        api.putDemoFiles.mockReset();
        toast.error.mockReset();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    async function mount() {
        render(<EditorShell slug="tour" />);
        // Mount with real timers (findBy polls), then fake them for the
        // debounce and retry delays.
        const button = await screen.findByTestId("edit");
        vi.useFakeTimers();
        return button;
    }

    function edit(button: HTMLElement, value: string, path = "demo.config.json") {
        button.dataset.p = path;
        button.dataset.v = value;
        fireEvent.click(button);
    }

    it("marks edited files dirty and autosaves every dirty file 5s after the last edit", async () => {
        api.putDemoFiles.mockResolvedValue(undefined);
        const button = await mount();
        edit(button, "v1");
        edit(button, "world", "notes.md");
        expect(screen.getByText(/unsaved changes/i)).toBeTruthy();
        expect(screen.getByTestId("save-badge").getAttribute("title")).toContain("demo.config.json +1 −1");

        await act(async () => {
            vi.advanceTimersByTime(4000);
        });
        expect(api.putDemoFiles).not.toHaveBeenCalled();
        // Another edit restarts the 5s window.
        edit(button, "v2");
        await act(async () => {
            vi.advanceTimersByTime(4000);
        });
        expect(api.putDemoFiles).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1100);
            await flushMicrotasks();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(1);
        // Every file, at its current content, in one write.
        expect(api.putDemoFiles.mock.calls[0]![1]).toEqual({
            "demo.config.json": "v2",
            "notes.md": "world",
        });
        expect(screen.getByText(/^saved$/i)).toBeTruthy();
        // The "Saved" pill decays back to idle.
        await act(async () => {
            vi.advanceTimersByTime(1600);
        });
        expect(screen.queryByText(/^saved$/i)).toBeNull();
        expect(screen.queryByText(/unsaved changes/i)).toBeNull();
    });

    it("saves immediately on ⌘S / Ctrl+S", async () => {
        api.putDemoFiles.mockResolvedValue(undefined);
        const button = await mount();
        edit(button, "v1");
        await act(async () => {
            fireEvent.keyDown(window, { key: "s", metaKey: true });
            await flushMicrotasks();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(1);
        expect(api.putDemoFiles.mock.calls[0]![1]).toEqual({ "demo.config.json": "v1", "notes.md": "hello" });

        // Nothing dirty: ⌘S is a no-op.
        await act(async () => {
            fireEvent.keyDown(window, { key: "s", ctrlKey: true });
            await flushMicrotasks();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(1);
    });

    it("keeps a file dirty when it changes again while its save is in flight", async () => {
        const first = deferred<void>();
        api.putDemoFiles.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
        const button = await mount();
        edit(button, "v1");
        await act(async () => {
            fireEvent.keyDown(window, { key: "s", metaKey: true });
            await flushMicrotasks();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(1);

        // An edit during the in-flight save.
        edit(button, "v2");
        await act(async () => {
            first.resolve();
            await flushMicrotasks();
        });
        // The first save landed v1, but the file is still dirty at v2 …
        expect(screen.getByText(/unsaved changes/i)).toBeTruthy();
        // … and the autosave window picks it up with the newer content.
        await act(async () => {
            vi.advanceTimersByTime(5100);
            await flushMicrotasks();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(2);
        expect(api.putDemoFiles.mock.calls[1]![1]["demo.config.json"]).toBe("v2");
    });

    it("reports a failed save and retries it after a pause", async () => {
        api.putDemoFiles.mockRejectedValueOnce(new Error("disk full")).mockResolvedValueOnce(undefined);
        const button = await mount();
        edit(button, "v1");
        await act(async () => {
            vi.advanceTimersByTime(5100);
            await flushMicrotasks();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(1);
        expect(toast.error).toHaveBeenCalledWith("Save failed: disk full");
        expect(screen.getByText(/failed/i)).toBeTruthy();

        await act(async () => {
            vi.advanceTimersByTime(3100);
            await flushMicrotasks();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(2);
        expect(api.putDemoFiles.mock.calls[1]![1]["demo.config.json"]).toBe("v1");
    });

    it("flushes the dirty files with keepalive when the page is hidden", async () => {
        api.putDemoFiles.mockResolvedValue(undefined);
        const button = await mount();
        edit(button, "v1");
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        await act(async () => {
            window.dispatchEvent(new Event("pagehide"));
        });
        expect(api.putDemoFiles).toHaveBeenCalledWith("tour", { "demo.config.json": "v1" }, [], { keepalive: true });
        Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    });
});

describe("EditorShell header", () => {
    beforeEach(() => {
        api.getDemoFiles.mockResolvedValue({
            files: { "demo.config.json": JSON.stringify({ title: "Onboarding tour" }) },
            binary: [],
        });
        api.listDemoAssets.mockResolvedValue([]);
        api.getDemoEmbed.mockResolvedValue({
            pageUrl: "https://YOUR-HOST/onboarding/",
            inline: '<iframe src="https://YOUR-HOST/onboarding/?embed=inline"></iframe>',
            popup: {
                loader: '<script src="https://YOUR-HOST/embed.js" async></script>',
                triggers: {
                    html: "<button onclick=\"InteractiveDemo.open('https://YOUR-HOST/onboarding/')\">Try the demo</button>",
                    react: "<button>react</button>",
                    next: "next",
                    vue: "vue",
                    svelte: "svelte",
                },
            },
        });
    });

    it("shows the title alone, themed Open demo and Share buttons, and no home link or slug", async () => {
        render(<EditorShell slug="onboarding" />);
        await act(flushMicrotasks);
        expect(screen.getByText("Onboarding tour")).toBeTruthy();
        expect(screen.queryByLabelText("All demos")).toBeNull();
        expect(document.querySelector("header code")).toBeNull();
        const open = screen.getByText("Open demo").closest("a")!;
        expect(open.getAttribute("href")).toBe("/onboarding/");
        expect(open.className).toContain("btn-3d-secondary");
        expect(screen.getByText("Share").closest("button")!.className).toContain("btn-3d-primary");
    });

    it("Share opens the rail-and-pane dialog; pasting the published link fills the snippets", async () => {
        render(<EditorShell slug="onboarding" />);
        await act(flushMicrotasks);
        fireEvent.click(screen.getByText("Share"));
        await act(flushMicrotasks);
        expect(api.getDemoEmbed).toHaveBeenCalledWith("onboarding");
        expect(screen.getByLabelText("Share options")).toBeTruthy();
        expect(screen.getByText("npx interactive-demo publish onboarding")).toBeTruthy();

        fireEvent.click(screen.getByText("Inline"));
        expect(screen.getByText("Paste your demo's link to fill this in.")).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText("https://your-host.com/onboarding/"), {
            target: { value: "https://demos.example/onboarding/" },
        });
        expect(screen.getByText(/demos\.example\/onboarding\/\?embed=inline/)).toBeTruthy();

        fireEvent.click(screen.getByText("Pop-up"));
        expect(screen.getByText(/https:\/\/demos\.example\/embed\.js/)).toBeTruthy();
        expect(screen.getByText(/InteractiveDemo\.open\('https:\/\/demos\.example\/onboarding\//)).toBeTruthy();
    });
});
