// Generates the animated walkthrough illustrations in resources/walkthrough/.
//
// Walkthrough `media.svg` inlines the file into a webview whose CSP only
// allows nonce'd styles, so <style> blocks and style="" attributes are
// dropped. Colors therefore go in presentation attributes as
// var(--vscode-*, fallback), and motion uses SMIL instead of CSS.
import { writeFileSync } from "node:fs";

const W = 520;
const H = 320;
const DUR = "8s";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SANS = "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const CH = 9; // advance of a 15px monospace glyph

const c = (token, fallback) => `var(--vscode-${token}, ${fallback})`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function anim(attr, values, keyTimes, { type, splines, discrete } = {}) {
  const tag = type ? "animateTransform" : "animate";
  let extra = type ? ` type="${type}"` : "";
  if (splines) extra += ` calcMode="spline" keySplines="${splines}"`;
  if (discrete) extra += ` calcMode="discrete"`;
  return `<${tag} attributeName="${attr}"${extra} dur="${DUR}" repeatCount="indefinite" values="${values}" keyTimes="${keyTimes}"/>`;
}
const EASE = ".4 0 .2 1";
const easeAll = (n) => Array(n).fill(EASE).join(";");

const text = (x, y, s, { size = 13, font = SANS, fill, anchor, weight } = {}) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}"` +
  (weight ? ` font-weight="${weight}"` : "") +
  (anchor ? ` text-anchor="${anchor}"` : "") +
  ` fill="${fill}" xml:space="preserve">${esc(s)}</text>`;

function squiggle(x, y, length, begin, end) {
  let d = `M${x} ${y} q1 -2.5 2 0`;
  for (let i = 4; i <= length; i += 2) d += " t2 0";
  // The wave is longer than its horizontal extent; the dash must cover all of it.
  const dash = length * 2;
  return (
    `<path d="${d}" stroke="${c("editorWarning-foreground", "#cca700")}" stroke-width="1.3" stroke-dasharray="${dash} ${dash}" stroke-dashoffset="${dash}">` +
    anim(
      "stroke-dashoffset",
      `${dash};${dash};0;0;${dash}`,
      `0;${begin};${end};.95;1`,
    ) +
    `</path>`
  );
}

const pointer = (from, to, keyTimes) =>
  `<path d="M0 0V13.6L3.4 10.2 5.95 16.15 8.5 15.3 5.95 9.35H10.2Z" fill="#ffffff" stroke="#000000" stroke-width=".85">` +
  anim("transform", `${from};${from};${to};${to};${from}`, keyTimes, {
    type: "translate",
    splines: `0 0 1 1;${EASE};0 0 1 1;0 0 1 1`,
  }) +
  `</path>`;

const LOGO =
  "M1 4.2 2.2 3l4.5 4.5L2.2 12 1 10.8l3.3-3.3zM7 10.6l1.2-1.2 1.3 1.3 4.3-4.3L15 7.6l-5.5 5.5z";

function svg(label, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="${esc(label)}">`,
    `<defs><clipPath id="frame"><rect width="${W}" height="${H}" rx="10"/></clipPath></defs>`,
    `<g clip-path="url(#frame)">`,
    `<rect width="${W}" height="${H}" fill="${c("editor-background", "#1f1f1f")}"/>`,
    ...body,
    `</g>`,
    `</svg>`,
    "",
  ].join("\n");
}

// Tab strip, activity bar and status bar of a VS Code window starting at `top`.
function workbench(top, file) {
  return [
    `<rect y="${top}" width="36" height="${H - top}" fill="${c("activityBar-background", "#181818")}"/>`,
    ...[top + 14, top + 46, top + 78].map(
      (y) =>
        `<rect x="10" y="${y}" width="16" height="16" rx="3" fill="${c("activityBar-inactiveForeground", "#868686")}" opacity=".5"/>`,
    ),
    `<rect x="36" y="${top}" width="${W - 36}" height="32" fill="${c("editorGroupHeader-tabsBackground", "#181818")}"/>`,
    `<rect x="36" y="${top}" width="104" height="32" fill="${c("tab-activeBackground", "#1f1f1f")}"/>`,
    text(50, top + 21, file, {
      size: 13,
      fill: c("tab-activeForeground", "#ffffff"),
    }),
    `<rect y="${H - 28}" width="${W}" height="28" fill="${c("statusBar-background", "#181818")}"/>`,
  ];
}

function codeLines(lines, firstNumber, top) {
  return lines.flatMap((line, i) => {
    const y = top + i * 28;
    const out = [
      text(62, y, String(firstNumber + i), {
        size: 15,
        font: MONO,
        anchor: "end",
        fill: c("editorLineNumber-foreground", "#6e7681"),
      }),
    ];
    if (line)
      out.push(
        text(78, y, line, {
          size: 15,
          font: MONO,
          fill: c("editor-foreground", "#cccccc"),
        }),
      );
    return out;
  });
}

// Scene 1: the status bar icon opens the ShellCheck menu.
function statusBar() {
  const qpTimes = "0;.34;.38;.90;.95;1";
  const rows = [
    ["Lint Current Document", ""],
    ["Runtime: native", "Switch to wasm"],
    ["Run: onType", ""],
    ["Disable ShellCheck", ""],
  ];
  return svg("Clicking the ShellCheck icon in the status bar opens its menu", [
    ...workbench(0, "deploy.sh"),
    // Earlier lines of the file, abstracted.
    ...[
      [60, 150],
      [88, 210],
      [116, 120],
      [144, 180],
    ].map(
      ([y, w], i) =>
        `<rect x="${i % 2 ? 98 : 78}" y="${y - 10}" width="${w}" height="10" rx="5" fill="${c("editor-foreground", "#cccccc")}" opacity=".18"/>`,
    ),
    ...codeLines(["for f in $(ls); do", "  cp $f /bak", "done"], 9, 214),
    squiggle(78 + 9 * CH, 220, 5 * CH, ".04", ".14"),
    squiggle(78 + 5 * CH, 248, 2 * CH, ".06", ".16"),
    text(392, H - 9, "Shell Script", {
      size: 12,
      fill: c("statusBar-foreground", "#cccccc"),
    }),
    `<circle cx="490" cy="${H - 14}" r="4" fill="${c("focusBorder", "#0078d4")}" opacity="0">` +
      anim("opacity", "0;0;.55;0;0", "0;.32;.34;.42;1") +
      anim("r", "4;4;4;13;13", "0;.32;.34;.42;1") +
      `</circle>`,
    `<g transform="translate(482 ${H - 22})" fill="${c("statusBar-foreground", "#cccccc")}"><path d="${LOGO}"/></g>`,
    `<g opacity="0">` +
      anim("opacity", "0;0;1;1;0;0", qpTimes) +
      anim("transform", "0 -6;0 -6;0 0;0 0;0 -6;0 -6", qpTimes, {
        type: "translate",
      }),
    `<rect x="120.5" y="40.5" width="320" height="148" rx="6" fill="${c("quickInput-background", "#222222")}" stroke="${c("widget-border", "#313131")}"/>`,
    `<rect x="128.5" y="48.5" width="304" height="26" rx="3" fill="${c("input-background", "#313131")}" stroke="${c("focusBorder", "#0078d4")}"/>`,
    text(138, 66, "ShellCheck", {
      size: 13,
      fill: c("input-placeholderForeground", "#989898"),
    }),
    `<rect x="124" y="80" width="312" height="26" rx="3" fill="${c("quickInputList-focusBackground", "#04395e")}">` +
      anim("transform", "0 0;0 0;0 26;0 26", "0;.46;.52;1", {
        type: "translate",
        splines: easeAll(3),
      }) +
      `</rect>`,
    ...rows.map(
      ([label, desc], i) =>
        `<text x="136" y="${98 + i * 26}" font-family="${SANS}" font-size="13" fill="${c("quickInput-foreground", "#cccccc")}">${esc(label)}` +
        (desc
          ? `<tspan dx="10" font-size="12" fill="${c("descriptionForeground", "#9d9d9d")}">${esc(desc)}</tspan>`
          : "") +
        `</text>`,
    ),
    `</g>`,
    pointer("300 150", "489 300", "0;.18;.32;.94;1"),
  ]);
}

// Scene 2: linting inside a browser tab on vscode.dev.
function web() {
  const typed = "echo Hello $name";
  const top = 44;
  const lineY = top + 52 + 2 * 28;
  const start = 0.06;
  const end = 0.26;
  const steps = typed.length;
  const times = [0];
  const widths = [0];
  for (let i = 0; i <= steps; i++) {
    times.push(+(start + ((end - start) * i) / steps).toFixed(4));
    widths.push(i * CH);
  }
  times.push(0.97);
  widths.push(0);
  const hoverTimes = "0;.40;.44;.92;.96;1";
  return svg(
    "ShellCheck reports a problem while you type in VS Code for the Web",
    [
      // Browser chrome.
      `<rect width="${W}" height="${top}" fill="${c("titleBar-activeBackground", "#181818")}"/>`,
      ...["#ff5f57", "#febc2e", "#28c840"].map(
        (fill, i) =>
          `<circle cx="${18 + 16 * i}" cy="22" r="5" fill="${fill}"/>`,
      ),
      `<rect x="120" y="11" width="280" height="22" rx="11" fill="${c("input-background", "#313131")}"/>`,
      `<path d="M135 20.5v-2a3 3 0 0 1 6 0v2" stroke="${c("descriptionForeground", "#9d9d9d")}" stroke-width="1.4"/>`,
      `<rect x="133" y="20" width="10" height="8" rx="1.5" fill="${c("descriptionForeground", "#9d9d9d")}"/>`,
      text(150, 27, "vscode.dev", {
        size: 13,
        fill: c("input-foreground", "#cccccc"),
      }),
      ...workbench(top, "greet.sh"),
      ...codeLines(["#!/bin/bash", "name=$1", ""], 1, top + 52),
      `<clipPath id="typed"><rect x="78" y="${lineY - 16}" height="22" width="0">` +
        anim("width", widths.join(";"), times.join(";"), { discrete: true }) +
        `</rect></clipPath>`,
      `<g clip-path="url(#typed)">${text(78, lineY, typed, { size: 15, font: MONO, fill: c("editor-foreground", "#cccccc") })}</g>`,
      `<rect y="${lineY - 14}" width="2" height="19" fill="${c("editorCursor-foreground", "#aeafad")}">` +
        anim("x", widths.map((w) => 78 + w).join(";"), times.join(";"), {
          discrete: true,
        }) +
        `</rect>`,
      squiggle(78 + 11 * CH, lineY + 6, 5 * CH, ".30", ".37"),
      `<g opacity="0">` + anim("opacity", "0;0;1;1;0;0", hoverTimes),
      `<rect x="150.5" y="${lineY + 16.5}" width="300" height="52" rx="4" fill="${c("editorHoverWidget-background", "#202020")}" stroke="${c("editorHoverWidget-border", "#454545")}"/>`,
      text(162, lineY + 38, "Double quote to prevent globbing", {
        size: 13,
        fill: c("editorHoverWidget-foreground", "#cccccc"),
      }),
      text(162, lineY + 57, "and word splitting.  shellcheck(SC2086)", {
        size: 12,
        fill: c("descriptionForeground", "#9d9d9d"),
      }),
      `</g>`,
      text(492, H - 9, "Shell Script", {
        size: 12,
        anchor: "end",
        fill: c("statusBar-foreground", "#cccccc"),
      }),
    ],
  );
}

// Scene 3: the bundled WebAssembly build runs on every platform without a
// shellcheck binary.
function wasm() {
  const accent = c("charts-purple", "#b180d7");
  const pass = c("charts-green", "#89d185");
  const from = [260, 150];
  const cards = [
    ["Windows", 30],
    ["macOS", 190],
    ["Linux", 350],
  ];
  return svg(
    "The bundled WebAssembly build of ShellCheck runs on Windows, macOS and Linux without installing a binary",
    [
      `<rect x="214.5" y="24.5" width="91" height="91" rx="16" fill="${c("editorWidget-background", "#202020")}" stroke="${accent}" stroke-width="2"/>`,
      `<g transform="translate(233 43) scale(3.4)" fill="${accent}"><path d="${LOGO}"/></g>`,
      text(260, 140, "shellcheck.wasm", {
        size: 13,
        font: MONO,
        anchor: "middle",
        fill: c("foreground", "#cccccc"),
      }),
      ...cards.flatMap(([name, x], i) => {
        const to = [x + 70, 206];
        const path = `M${from[0]} ${from[1]}C${from[0]} 180 ${to[0]} 176 ${to[0]} ${to[1]}`;
        const start = 0.06 + i * 0.08;
        const end = start + 0.12;
        const lit = `0;${end};${(end + 0.02).toFixed(2)};.95;1`;
        return [
          `<path d="${path}" stroke="${c("widget-border", "#313131")}" stroke-width="1.5" stroke-dasharray="3 4"/>`,
          `<circle r="4" fill="${accent}" opacity="0">` +
            anim(
              "opacity",
              "0;0;1;1;0;0",
              `0;${start};${(start + 0.01).toFixed(2)};${end};${(end + 0.01).toFixed(2)};1`,
            ) +
            `<animateMotion path="${path}" dur="${DUR}" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;${start};${end};1" calcMode="spline" keySplines="0 0 1 1;${EASE};0 0 1 1"/>` +
            `</circle>`,
          `<rect x="${x + 0.5}" y="206.5" width="139" height="55" rx="8" fill="${c("editorWidget-background", "#202020")}" stroke="${c("widget-border", "#313131")}"/>`,
          `<rect x="${x + 0.5}" y="206.5" width="139" height="55" rx="8" stroke="${pass}" stroke-width="1.5" opacity="0">` +
            anim("opacity", "0;0;1;1;0", lit) +
            `</rect>`,
          text(x + 16, 230, name, {
            size: 15,
            weight: 600,
            fill: c("foreground", "#cccccc"),
          }),
          text(x + 16, 250, "x64 · ARM64", {
            size: 12,
            fill: c("descriptionForeground", "#9d9d9d"),
          }),
          `<g opacity="0" transform="translate(${x + 106} 222)">` +
            anim("opacity", "0;0;1;1;0", lit) +
            `<circle cx="10" cy="10" r="10" fill="${pass}"/><path d="M5.5 10.2 8.6 13.2 14.5 7.2" stroke="${c("editor-background", "#1f1f1f")}" stroke-width="2"/></g>`,
        ];
      }),
      text(
        260,
        296,
        "Bundled with the extension. No shellcheck binary to install.",
        {
          size: 13,
          anchor: "middle",
          fill: c("descriptionForeground", "#9d9d9d"),
        },
      ),
    ],
  );
}

const out = new URL("walkthrough/", import.meta.url);
for (const [name, render] of [
  ["status-bar.svg", statusBar],
  ["web.svg", web],
  ["wasm.svg", wasm],
]) {
  writeFileSync(new URL(name, out), render());
}
