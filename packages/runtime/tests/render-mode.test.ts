import { describe, expect, it } from 'vitest';
import { parseDemo } from '../src/schema';
import { applyRenderModeOverrides } from '../src/render/render-mode';

function baseDemo() {
    return parseDemo({
        id: 'rendermode01',
        version: 1,
        chrome: { autoplay: false },
        chapters: [],
        steps: [
            {
                kind: 'content',
                id: 'img',
                advance: { trigger: 'click' },
                background: {
                    type: 'image',
                    src: '/a.png',
                    naturalWidth: 1280,
                    naturalHeight: 720,
                },
            },
            {
                kind: 'content',
                id: 'vid',
                advance: { trigger: 'auto' },
                background: {
                    type: 'video',
                    src: '/v.mp4',
                    naturalWidth: 1280,
                    naturalHeight: 720,
                },
            },
        ],
    });
}

describe('applyRenderModeOverrides', () => {
    it('forces autoplay + hides controls but respects the demo header config', () => {
        const out = applyRenderModeOverrides(baseDemo());
        expect(out.chrome.autoplay).toBe(true);
        expect(out.chrome.controls).toBe('hidden');
        expect(out.chrome.hideControls).toBe(true);
        // Header is NOT forced — baseDemo leaves hideHeader at its default.
        expect(out.chrome.hideHeader).toBe(false);
    });

    it('preserves an explicit hideHeader:true (header stays off in export)', () => {
        const demo = parseDemo({
            ...baseDemo(),
            chrome: { autoplay: false, hideHeader: true },
        });
        const out = applyRenderModeOverrides(demo);
        expect(out.chrome.hideHeader).toBe(true);
        expect(out.chrome.controls).toBe('hidden');
    });

    it('converts every advance trigger to auto', () => {
        const out = applyRenderModeOverrides(baseDemo());
        for (const step of out.steps) {
            expect(step.advance.trigger).toBe('auto');
        }
    });

    it('stamps a dwell on image steps but leaves media steps to derive duration', () => {
        const out = applyRenderModeOverrides(baseDemo(), {
            contentDurationMs: 4000,
        });
        const img = out.steps.find((s) => s.id === 'img');
        const vid = out.steps.find((s) => s.id === 'vid');
        expect(img?.duration).toBe(4000);
        // video derives its dwell from loaded media → untouched.
        expect(vid?.duration).toBeUndefined();
    });

    it('keeps an explicit duration and does not mutate the input', () => {
        const demo = baseDemo();
        const out = applyRenderModeOverrides(demo);
        expect(demo.chrome.autoplay).toBe(false); // input untouched
        expect(demo.steps[0]!.advance.trigger).toBe('click');
        expect(out).not.toBe(demo);
    });

    it('respects hideChrome:false', () => {
        const out = applyRenderModeOverrides(baseDemo(), { hideChrome: false });
        expect(out.chrome.autoplay).toBe(true);
        expect(out.chrome.controls).toBeUndefined();
    });
});
