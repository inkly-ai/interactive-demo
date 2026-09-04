/**
 * The in-page click recorder. `RECORDER_SCRIPT` runs inside the captured
 * page: it labels the clicked element, reports normalized coordinates and
 * page context back over a CDP binding, and holds anchor navigations until
 * the source page has been captured.
 */
import type { CaptureClick } from './build.js';
import { Cdp, DEFAULT_HEIGHT, DEFAULT_WIDTH, evaluate } from './chrome.js';

export type RecorderEventType = 'click' | 'input' | 'scroll';

export interface PageScroll {
  x: number;
  y: number;
  maxX: number;
  maxY: number;
}

export interface RecorderEventPage {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  scroll: PageScroll;
  navigationUrl?: string | null;
}

export interface RecorderEvent {
  type: RecorderEventType;
  click: CaptureClick | null;
  page: RecorderEventPage | null;
}

/** CDP binding names the page calls back into. */
export const RECORDER_EVENT_BINDING = '__demoCaptureEvent';
export const RECORDER_CLICK_BINDING = '__demoCaptureClick';

export const RECORDER_SCRIPT = `(() => {
  if (window.__demoCaptureRecorderInstalled) return;
  window.__demoCaptureRecorderInstalled = true;
  window.__demoCaptureLastClick = null;
  window.__demoCaptureLastEvent = null;
  let lastMotionEmitAt = 0;
  function firstLine(value) {
    const lines = String(value || "")
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length ? lines[0] : "";
  }
  function compactLabel(value) {
    return firstLine(value)
      .replace(/\\s+/g, " ")
      .trim()
      .slice(0, 48);
  }
  function ownText(el) {
    if (!el || !el.childNodes) return "";
    let out = "";
    el.childNodes.forEach((node) => {
      if (node.nodeType === 3) out += node.textContent;
    });
    return out.replace(/\\s+/g, " ").trim();
  }
  function firstUsefulText(el) {
    if (!el || !el.querySelector) return "";
    const candidate = el.querySelector("[aria-label],h1,h2,h3,h4,button,[role=button],a,label,input[placeholder],textarea[placeholder]");
    if (!candidate || candidate === el) return "";
    return textFor(candidate);
  }
  function textFor(el) {
    if (!el) return "";
    // Prefer the clicked element's OWN accessible name before descending into
    // children, so composite cards (heading + description) and collapsible
    // sidebars do not produce run-on or sibling labels.
    const aria = el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("alt"));
    if (aria && aria.trim()) return compactLabel(aria);
    const own = ownText(el);
    if (own) return compactLabel(own);
    const value = el.getAttribute && (el.getAttribute("value") || el.getAttribute("placeholder") || el.getAttribute("name"));
    if (value && value.trim()) return compactLabel(value);
    // Only the FIRST line of innerText: for a card whose innerText is
    // "Title\\nDescription" this yields just "Title".
    const inner = compactLabel(el.innerText || el.textContent || "");
    if (inner) return inner;
    const usefulText = firstUsefulText(el);
    if (usefulText) return usefulText;
    const closest = el.closest && el.closest("a,button,[role=button],label,[aria-label],[title]");
    if (closest && closest !== el) return textFor(closest);
    return "";
  }
  function selectorFor(el) {
    if (!el || !el.tagName) return "";
    if (el.id) return "#" + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      if (node.classList && node.classList.length) {
        part += "." + Array.from(node.classList).slice(0, 2).map((c) => CSS.escape(c)).join(".");
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  function pointFor(el, fallbackX, fallbackY) {
    if (el && el.getBoundingClientRect) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return {
          x: Math.max(0, Math.min(1, (rect.left + rect.width / 2) / Math.max(1, window.innerWidth))),
          y: Math.max(0, Math.min(1, (rect.top + rect.height / 2) / Math.max(1, window.innerHeight))),
        };
      }
    }
    return {
      x: Math.max(0, Math.min(1, fallbackX)),
      y: Math.max(0, Math.min(1, fallbackY)),
    };
  }
  function navigationUrlFor(el) {
    const link = el && el.closest ? el.closest("a[href],area[href]") : null;
    if (!link) return null;
    const href = link.href || (link.getAttribute && link.getAttribute("href")) || "";
    if (!href || /^\\s*(?:#|javascript:|mailto:|tel:)/i.test(href)) return null;
    return href;
  }
  function payloadFor(type, el, point, label, navigationUrl = null) {
    let elementId = null;
    if (el && el.nodeType === 1 && el.setAttribute) {
      elementId = el.getAttribute("data-capture-id");
      if (!elementId) {
        elementId = "el-" + Math.random().toString(36).slice(2, 10);
        el.setAttribute("data-capture-id", elementId);
      }
    }
    return {
      type,
      click: point ? {
        x: point.x,
        y: point.y,
        label: label || textFor(el) || null,
        tag: el && el.tagName ? el.tagName.toLowerCase() : null,
        selector: selectorFor(el) || null,
        elementId,
        outerHTML: el && el.outerHTML ? String(el.outerHTML).slice(0, 2000) : null,
      } : null,
      // Page context captured IN-PAGE at event time, before any navigation the
      // click triggers — so the exported step's sourceUrl/title match the page
      // the click happened on, not the racy post-navigation destination.
      page: {
        url: location.href,
        title: document.title || "Captured screen",
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scroll: {
          x: window.scrollX || document.documentElement.scrollLeft || 0,
          y: window.scrollY || document.documentElement.scrollTop || 0,
          maxX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          maxY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        },
        navigationUrl,
      },
    };
  }
  function emit(payload) {
    window.__demoCaptureLastEvent = payload;
    if (payload.type === "click") window.__demoCaptureLastClick = payload.click;
    try {
      if (typeof window.${RECORDER_EVENT_BINDING} === "function") {
        window.${RECORDER_EVENT_BINDING}(JSON.stringify(payload));
      } else if (typeof window.${RECORDER_CLICK_BINDING} === "function" && payload.type === "click") {
        window.${RECORDER_CLICK_BINDING}(JSON.stringify(payload.click));
      }
    } catch {
      // The listener is best effort; manual capture remains available.
    }
  }
  function emitMotion(type, el, point, label, minInterval = 250) {
    const now = Date.now();
    if (now - lastMotionEmitAt < minInterval) return;
    lastMotionEmitAt = now;
    emit(payloadFor(type, el, point, label));
  }
  function eventTarget(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : null;
    const first = path && path.length ? path[0] : event.target;
    if (first && first.nodeType === 1) return first;
    return event.target && event.target.nodeType === 1 ? event.target : null;
  }
  function clickableTarget(event) {
    const target = eventTarget(event);
    return target && target.closest
      ? target.closest("a,button,[role=button],input,select,textarea,label,[aria-label],[title]") || target
      : target;
  }
  document.addEventListener("click", (event) => {
    const el = clickableTarget(event);
    const navigationUrl = navigationUrlFor(el);
    if (navigationUrl) event.preventDefault();
    // A synthetic (.click()) or untrusted click, or one whose coordinates are
    // 0/0 (off-viewport / programmatic), has no real cursor position. Fall
    // back to the clicked element's bounding-rect center like the other
    // handlers do, so the pointer never lands in the top-left corner.
    const hasRealPoint = event.isTrusted && (event.clientX > 0 || event.clientY > 0);
    const point = hasRealPoint
      ? {
          x: Math.max(0, Math.min(1, event.clientX / Math.max(1, window.innerWidth))),
          y: Math.max(0, Math.min(1, event.clientY / Math.max(1, window.innerHeight))),
        }
      : pointFor(el, 0.5, 0.5);
    emit(payloadFor("click", el, point, null, navigationUrl));
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") return;
    const el = eventTarget(event);
    const label = textFor(el) || (el && el.getAttribute && (el.getAttribute("placeholder") || el.getAttribute("name"))) || "Typed text";
    emitMotion("input", el, pointFor(el, 0.5, 0.5), label);
  }, true);
  document.addEventListener("input", (event) => {
    const el = eventTarget(event);
    const label = textFor(el) || (el && el.getAttribute && (el.getAttribute("placeholder") || el.getAttribute("name"))) || "Typed text";
    emitMotion("input", el, pointFor(el, 0.5, 0.5), label);
  }, true);
  function onMotionScroll() {
    emitMotion("scroll", document.scrollingElement || document.documentElement, {
      x: 0.9,
      y: Math.max(0.1, Math.min(0.9, window.scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight))),
    }, "Scrolled page");
  }
  window.addEventListener("scroll", onMotionScroll, true);
  window.addEventListener("wheel", onMotionScroll, true);
  window.addEventListener("touchmove", onMotionScroll, true);
})();`;

export async function installRecorder(cdp: Cdp, sessionId: string, withBinding = false): Promise<void> {
  if (withBinding) {
    await cdp.send('Runtime.addBinding', { name: RECORDER_EVENT_BINDING }, sessionId).catch(() => undefined);
    await cdp.send('Runtime.addBinding', { name: RECORDER_CLICK_BINDING }, sessionId).catch(() => undefined);
  }
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER_SCRIPT }, sessionId);
  await evaluate(cdp, sessionId, RECORDER_SCRIPT, 5_000).catch(() => undefined);
}

export interface CaptureMetadata {
  viewport: { width: number; height: number };
  sourceUrl: string;
  title: string;
  click: CaptureClick | null;
  scroll: PageScroll;
}

export async function readCaptureMetadata(cdp: Cdp, sessionId: string): Promise<CaptureMetadata> {
  await evaluate(cdp, sessionId, RECORDER_SCRIPT, 5_000).catch(() => undefined);
  const raw = await evaluate(
    cdp,
    sessionId,
    `JSON.stringify({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      sourceUrl: location.href,
      title: document.title || "Captured screen",
      click: window.__demoCaptureLastClick || null,
      scroll: {
        x: window.scrollX || document.documentElement.scrollLeft || 0,
        y: window.scrollY || document.documentElement.scrollTop || 0,
        maxX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        maxY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      }
    })`,
    5_000,
  );
  const parsed = JSON.parse(String(raw)) as {
    viewport?: { width?: unknown; height?: unknown };
    sourceUrl?: unknown;
    title?: unknown;
    click?: CaptureClick | null;
    scroll?: { x?: unknown; y?: unknown; maxX?: unknown; maxY?: unknown };
  };
  return {
    viewport: {
      width: Number(parsed.viewport?.width) || DEFAULT_WIDTH,
      height: Number(parsed.viewport?.height) || DEFAULT_HEIGHT,
    },
    sourceUrl: typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl : '',
    title: typeof parsed.title === 'string' ? parsed.title : 'Captured screen',
    click: parsed.click ?? null,
    scroll: {
      x: Number(parsed.scroll?.x) || 0,
      y: Number(parsed.scroll?.y) || 0,
      maxX: Number(parsed.scroll?.maxX) || 0,
      maxY: Number(parsed.scroll?.maxY) || 0,
    },
  };
}

const MAX_LABEL = 200;
const MAX_TAG = 50;
const MAX_SELECTOR = 1000;
const MAX_ELEMENT_ID = 100;
const MAX_OUTER_HTML = 2000;
const MAX_URL = 2000;
const MAX_TITLE = 500;
const MAX_VIEWPORT = 16_384;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cappedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null;
}

function clamp01(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function nonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The page can call the bindings with anything, so a click is only accepted
 * with finite normalized coordinates, and every string is capped.
 */
function sanitizeClick(raw: unknown): CaptureClick | null {
  if (!isRecord(raw)) return null;
  const x = clamp01(raw.x);
  const y = clamp01(raw.y);
  if (x === null || y === null) return null;
  return {
    x,
    y,
    label: cappedString(raw.label, MAX_LABEL),
    tag: cappedString(raw.tag, MAX_TAG),
    selector: cappedString(raw.selector, MAX_SELECTOR),
    elementId: cappedString(raw.elementId, MAX_ELEMENT_ID),
    outerHTML: cappedString(raw.outerHTML, MAX_OUTER_HTML),
  };
}

function sanitizePage(raw: unknown): RecorderEventPage | null {
  if (!isRecord(raw)) return null;
  const viewport = isRecord(raw.viewport) ? raw.viewport : {};
  const scroll = isRecord(raw.scroll) ? raw.scroll : {};
  const dimension = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 1
      ? Math.min(MAX_VIEWPORT, Math.round(value))
      : fallback;
  return {
    url: cappedString(raw.url, MAX_URL) ?? '',
    title: cappedString(raw.title, MAX_TITLE) ?? '',
    viewport: {
      width: dimension(viewport.width, DEFAULT_WIDTH),
      height: dimension(viewport.height, DEFAULT_HEIGHT),
    },
    scroll: {
      x: nonNegative(scroll.x),
      y: nonNegative(scroll.y),
      maxX: nonNegative(scroll.maxX),
      maxY: nonNegative(scroll.maxY),
    },
    navigationUrl: httpUrl(raw.navigationUrl),
  };
}

/**
 * Parse a payload delivered over one of the recorder bindings into a
 * {@link RecorderEvent}. Returns `null` for anything malformed or forged —
 * the page is untrusted, so nothing here ever throws.
 */
export function parseRecorderPayload(bindingName: string, payload: unknown): RecorderEvent | null {
  if (bindingName !== RECORDER_EVENT_BINDING && bindingName !== RECORDER_CLICK_BINDING) return null;
  if (typeof payload !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!isRecord(parsed)) return null;
    if (bindingName === RECORDER_CLICK_BINDING) {
      const click = sanitizeClick(parsed);
      return click ? { type: 'click', click, page: null } : null;
    }
    const type = parsed.type === 'input' || parsed.type === 'scroll' ? parsed.type : 'click';
    const click = sanitizeClick(parsed.click);
    if (type === 'click' && parsed.click != null && !click) return null;
    return { type, click, page: sanitizePage(parsed.page) };
  } catch {
    return null;
  }
}
