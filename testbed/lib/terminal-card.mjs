/**
 * Renders a terminal transcript as a full-bleed 1440x900 page, so a real CLI
 * run can be a screen in a demo next to the browser screenshots.
 *
 * Lines are tagged rather than parsed: 'cmd' is what you typed, 'out' is what
 * came back, 'ok' is a success line, 'dim' is a comment.
 */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const escape = (text) => String(text).replace(/[&<>]/g, (c) => ESCAPES[c]);

export function terminalCard({ title = 'zsh', subtitle = '', lines = [], caption = '' }) {
  const body = lines
    .map((line) => {
      if (typeof line === 'string') return `<div class="out">${escape(line) || '&nbsp;'}</div>`;
      const kind = line.t ?? 'out';
      if (kind === 'cmd') {
        return `<div class="cmd"><span class="sigil">$</span> ${escape(line.text)}</div>`;
      }
      return `<div class="${kind}">${escape(line.text) || '&nbsp;'}</div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: grid; place-items: center;
    background:
      radial-gradient(1100px 620px at 18% -10%, #eef1ff 0%, rgba(238,241,255,0) 60%),
      radial-gradient(900px 560px at 105% 110%, #f4eeff 0%, rgba(244,238,255,0) 55%),
      #f7f8fb;
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #12141a;
  }
  .wrap { width: 1100px; }
  .window {
    border-radius: 14px; overflow: hidden;
    background: #12141c;
    box-shadow: 0 1px 2px rgba(14,16,24,.16), 0 30px 70px rgba(14,16,24,.22);
  }
  .bar {
    height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 14px;
    background: #1b1e27; border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .bar .dot { width: 11px; height: 11px; border-radius: 99px; }
  .bar .t { margin-left: 10px; color: #8f96a8; font-size: 12.5px; font-weight: 500; }
  .bar .s { margin-left: auto; color: #5d6376; font-size: 12px; }
  .screen {
    padding: 22px 26px 26px;
    font: 14px/1.75 ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
    color: #c7ccda;
    min-height: 420px;
  }
  .cmd { color: #f2f4fa; font-weight: 600; margin-top: 14px; }
  .cmd:first-child { margin-top: 0; }
  .cmd .sigil { color: #7ee0a8; font-weight: 700; margin-right: 8px; }
  .out { color: #98a0b4; white-space: pre; }
  .ok { color: #7ee0a8; white-space: pre; }
  .dim { color: #636a7d; white-space: pre; }
  .caption { margin-top: 22px; text-align: center; color: #5c6270; font-size: 14px; }
</style></head>
<body><div class="wrap">
  <div class="window">
    <div class="bar">
      <span class="dot" style="background:#ff5f57"></span>
      <span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="t">${escape(title)}</span>
      <span class="s">${escape(subtitle)}</span>
    </div>
    <div class="screen">
${body}
    </div>
  </div>
  ${caption ? `<div class="caption">${escape(caption)}</div>` : ''}
</div></body></html>`;
}
