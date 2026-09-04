import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    getDemoFiles: vi.fn(),
    listDemoAssets: vi.fn(),
    putDemoFiles: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/api", () => api);
vi.mock("sonner", () => ({ toast }));
// The real editor view needs a parsed demo and a stage; the shell's saving
// logic only needs something that reports a change.
vi.mock("@/components/demo-editor/view", () => ({
    DemoEditorView: ({
        onChange,
    }: {
        onChange: (path: string, content: string) => void;
    }) => (
        <button
            type="button"
            onClick={(event) => onChange("demo.config.json", (event.target as HTMLElement).dataset.v ?? "")}
            data-testid="edit"
        >
            edit
        </button>
    ),
}));

import { EditorShell } from "./shell";

const FILES = { "demo.config.json": "{}" };

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (err: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("EditorShell saving", () => {
    beforeEach(() => {
        api.getDemoFiles.mockResolvedValue({ files: FILES, binary: [] });
        api.listDemoAssets.mockResolvedValue([]);
        api.putDemoFiles.mockReset();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    async function mountAndEdit(values: string[]) {
        render(<EditorShell slug="tour" />);
        // Mount with real timers (findBy polls), then fake them for the
        // debounce and retry delays.
        const button = await screen.findByTestId("edit");
        vi.useFakeTimers();
        for (const value of values) {
            button.dataset.v = value;
            fireEvent.click(button);
        }
        return button;
    }

    it("serialises saves so an older batch never lands after a newer one", async () => {
        const first = deferred<void>();
        const second = deferred<void>();
        api.putDemoFiles.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        const button = await mountAndEdit(["v1"]);
        await act(async () => {
            vi.advanceTimersByTime(700);
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(1);
        expect(api.putDemoFiles.mock.calls[0]![1]).toEqual({ "demo.config.json": "v1" });

        // A second edit while the first save is still in flight.
        button.dataset.v = "v2";
        fireEvent.click(button);
        await act(async () => {
            vi.advanceTimersByTime(700);
        });
        // Not sent yet: it waits for the first PUT to settle.
        expect(api.putDemoFiles).toHaveBeenCalledTimes(1);

        await act(async () => {
            first.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(2);
        expect(api.putDemoFiles.mock.calls[1]![1]).toEqual({ "demo.config.json": "v2" });
        await act(async () => {
            second.resolve();
        });
    });

    it("reports a failed save and retries it after a pause", async () => {
        api.putDemoFiles.mockRejectedValueOnce(new Error("disk full")).mockResolvedValueOnce(undefined);

        await mountAndEdit(["v1"]);
        await act(async () => {
            vi.advanceTimersByTime(700);
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(1);
        expect(toast.error).toHaveBeenCalledWith("Save failed: disk full");
        expect(screen.getByText(/failed/i)).toBeTruthy();

        await act(async () => {
            vi.advanceTimersByTime(3100);
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(api.putDemoFiles).toHaveBeenCalledTimes(2);
        expect(api.putDemoFiles.mock.calls[1]![1]).toEqual({ "demo.config.json": "v1" });
    });

    it("flushes with keepalive when the page is hidden", async () => {
        api.putDemoFiles.mockResolvedValue(undefined);
        await mountAndEdit(["v1"]);
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        await act(async () => {
            window.dispatchEvent(new Event("pagehide"));
        });
        expect(api.putDemoFiles).toHaveBeenCalledWith("tour", { "demo.config.json": "v1" }, [], { keepalive: true });
    });
});
