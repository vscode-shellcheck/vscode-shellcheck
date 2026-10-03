// Generates the animated walkthrough illustrations in resources/walkthrough/.
//
// Walkthrough `media.svg` inlines the file into a webview whose CSP only
// allows nonce'd styles, so <style> blocks and style="" attributes are
// dropped. Colors therefore go in presentation attributes as
// var(--vscode-*, fallback), and motion uses SMIL instead of CSS.
import { readFileSync, writeFileSync } from "node:fs";

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

// The status bar icon. Not nested as an <svg>: the walkthrough styles every
// svg element in the page as the media itself, which moves a nested one away.
const ICON = readFileSync(
  new URL("icons/shellcheck-logo.svg", import.meta.url),
  "utf8",
);
const ICON_WIDTH = Number(
  /<svg[^>]*\sviewBox="[\d.]+ [\d.]+ ([\d.]+)/.exec(ICON)[1],
);
const ICON_CONTENT = ICON.replace(/^\s*<svg[^>]*>|<\/svg>\s*$/g, "");

const logo = (x, y, size, color) =>
  `<g transform="translate(${x} ${y}) scale(${size / ICON_WIDTH})">` +
  ICON_CONTENT.replaceAll("currentColor", color) +
  `</g>`;

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
    if (line) {
      out.push(
        text(78, y, line, {
          size: 15,
          font: MONO,
          fill: c("editor-foreground", "#cccccc"),
        }),
      );
    }
    return out;
  });
}

// Scene 1: the status bar icon opens the ShellCheck menu.
function statusBar() {
  const qpTimes = "0;.34;.38;.90;.95;1";
  const ROW = 22;
  // [label, description, top]; null is the "Settings" separator.
  const rows = [
    ["Lint Current Document", "", 94],
    ["Collect Diagnostics", "", 116],
    null,
    ["Runtime: native", "Switch to wasm", 158],
    ["Run: onType", "Change when ShellCheck runs", 180],
    ["Disable ShellCheck", "For this workspace", 202],
  ];
  return svg("Clicking the ShellCheck icon in the status bar opens its menu", [
    ...workbench(0, "deploy.sh"),
    // Earlier lines of the file, abstracted.
    ...[
      [60, 150],
      [88, 210],
      [116, 120],
      [144, 180],
      [172, 140],
      [200, 190],
    ].map(
      ([y, w], i) =>
        `<rect x="${i % 2 ? 98 : 78}" y="${y - 10}" width="${w}" height="10" rx="5" fill="${c("editor-foreground", "#cccccc")}" opacity=".18"/>`,
    ),
    ...codeLines(["for f in $(ls); do", "  cp $f /bak"], 9, 246),
    squiggle(78 + 9 * CH, 252, 5 * CH, ".04", ".14"),
    squiggle(78 + 5 * CH, 280, 2 * CH, ".06", ".16"),
    text(392, H - 9, "Shell Script", {
      size: 12,
      fill: c("statusBar-foreground", "#cccccc"),
    }),
    `<circle cx="490" cy="${H - 14}" r="4" fill="${c("focusBorder", "#0078d4")}" opacity="0">` +
      anim("opacity", "0;0;.55;0;0", "0;.32;.34;.42;1") +
      anim("r", "4;4;4;13;13", "0;.32;.34;.42;1") +
      `</circle>`,
    logo(482, H - 22, 16, c("statusBar-foreground", "#cccccc")),
    `<g opacity="0">` +
      anim("opacity", "0;0;1;1;0;0", qpTimes) +
      anim("transform", "0 -6;0 -6;0 0;0 0;0 -6;0 -6", qpTimes, {
        type: "translate",
      }),
    `<rect x="110.5" y="36.5" width="340" height="196" rx="6" fill="${c("quickInput-background", "#222222")}" stroke="${c("widget-border", "#313131")}"/>`,
    text(280, 54, "ShellCheck 0.11.0 · native (bundled)", {
      size: 12,
      anchor: "middle",
      fill: c("quickInput-foreground", "#cccccc"),
    }),
    `<rect x="118.5" y="62.5" width="324" height="24" rx="3" fill="${c("input-background", "#313131")}" stroke="${c("focusBorder", "#0078d4")}"/>`,
    `<rect x="114" y="94" width="332" height="${ROW}" rx="3" fill="${c("quickInputList-focusBackground", "#04395e")}">` +
      anim("transform", "0 0;0 0;0 64;0 64", "0;.46;.52;1", {
        type: "translate",
        splines: easeAll(3),
      }) +
      `</rect>`,
    `<path d="M124 148.5H372" stroke="${c("pickerGroup-border", "#3c3c3c")}"/>`,
    text(436, 152, "Settings", {
      size: 11,
      anchor: "end",
      fill: c("pickerGroup-foreground", "#3794ff"),
    }),
    ...rows
      .filter((row) => row !== null)
      .map(
        ([label, desc, top]) =>
          `<text x="126" y="${top + 15}" font-family="${SANS}" font-size="13" fill="${c("quickInput-foreground", "#cccccc")}">${esc(label)}` +
          (desc
            ? `<tspan dx="10" font-size="12" fill="${c("descriptionForeground", "#9d9d9d")}">${esc(desc)}</tspan>`
            : "") +
          `</text>`,
      ),
    `</g>`,
    pointer("300 120", "489 300", "0;.18;.32;.94;1"),
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

// Scene 3: what the bundled WebAssembly build brings.
function wasm() {
  const module = c("charts-purple", "#b180d7");
  const from = [260, 134];
  const icons = {
    platforms:
      "M2.5 2.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM5 14.5h6M8 11.5v3",
    sandbox:
      "M8 1.5 2.5 3.5v4c0 3.4 2.3 5.9 5.5 7 3.2-1.1 5.5-3.6 5.5-7v-4zM5.5 8l1.8 1.8L10.8 6.2",
    web: "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM8 1.5c-1.8 1.8-2.7 4-2.7 6.5s.9 4.7 2.7 6.5c1.8-1.8 2.7-4 2.7-6.5S9.8 3.3 8 1.5zM1.5 8h13",
  };
  const cards = [
    [
      "Every platform",
      "Windows, macOS, Linux",
      icons.platforms,
      c("charts-blue", "#3794ff"),
    ],
    [
      "Sandboxed",
      "Workspace files only",
      icons.sandbox,
      c("charts-green", "#89d185"),
    ],
    ["On the web", "vscode.dev, github.dev", icons.web, module],
  ];
  return svg(
    "The bundled WebAssembly build of ShellCheck runs on every platform, in a sandbox, and on the web",
    [
      `<rect x="218.5" y="18.5" width="83" height="83" rx="16" fill="${c("editorWidget-background", "#202020")}" stroke="${module}" stroke-width="2"/>`,
      logo(234, 34, 52, module),
      text(260, 124, "shellcheck.wasm", {
        size: 13,
        font: MONO,
        anchor: "middle",
        fill: c("foreground", "#cccccc"),
      }),
      ...cards.flatMap(([title, subtitle, icon, color], i) => {
        const x = 16 + i * 166;
        const to = [x + 78, 186];
        const path = `M${from[0]} ${from[1]}C${from[0]} 166 ${to[0]} 160 ${to[0]} ${to[1]}`;
        const start = 0.06 + i * 0.1;
        const end = start + 0.1;
        const lit = `0;${end.toFixed(2)};${(end + 0.02).toFixed(2)};.95;1`;
        const iconPath = (stroke) =>
          `<path d="${icon}" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`;
        return [
          `<path d="${path}" stroke="${c("widget-border", "#313131")}" stroke-width="1.5" stroke-dasharray="3 4"/>`,
          `<circle r="4" fill="${color}" opacity="0">` +
            anim(
              "opacity",
              "0;0;1;1;0;0",
              `0;${start.toFixed(2)};${(start + 0.01).toFixed(2)};${end.toFixed(2)};${(end + 0.01).toFixed(2)};1`,
            ) +
            `<animateMotion path="${path}" dur="${DUR}" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;${start.toFixed(2)};${end.toFixed(2)};1" calcMode="spline" keySplines="0 0 1 1;${EASE};0 0 1 1"/>` +
            `</circle>`,
          `<rect x="${x + 0.5}" y="186.5" width="155" height="84" rx="8" fill="${c("editorWidget-background", "#202020")}" stroke="${c("widget-border", "#313131")}"/>`,
          `<rect x="${x + 0.5}" y="186.5" width="155" height="84" rx="8" stroke="${color}" stroke-width="1.5" opacity="0">` +
            anim("opacity", "0;0;1;1;0", lit) +
            `</rect>`,
          `<g transform="translate(${x + 12} 198) scale(1.25)">` +
            iconPath(c("descriptionForeground", "#9d9d9d")) +
            `<g opacity="0">` +
            anim("opacity", "0;0;1;1;0", lit) +
            iconPath(color) +
            `</g></g>`,
          text(x + 12, 240, title, {
            size: 14,
            weight: 600,
            fill: c("foreground", "#cccccc"),
          }),
          text(x + 12, 258, subtitle, {
            size: 11,
            fill: c("descriptionForeground", "#9d9d9d"),
          }),
        ];
      }),
      text(260, 302, "One bundled build. No shellcheck binary to install.", {
        size: 13,
        anchor: "middle",
        fill: c("descriptionForeground", "#9d9d9d"),
      }),
    ],
  );
}

// Scene 4: open scripts are linted again when a .shellcheckrc changes. Static.
function configFiles() {
  const side = 176;
  const refresh = "M12.5 8a4.5 4.5 0 1 1-1.32-3.18M12.5 3v2.5H10";
  const files = [".shellcheckrc", "build.sh", "deploy.sh", "test.sh"];
  const code = ["# Shared by every script", "disable=SC2086", "shell=bash"];
  return svg("Changing .shellcheckrc lints the open scripts again", [
    ...workbench(0, ".shellcheckrc"),
    // The tab belongs to the editor, right of the side bar.
    `<rect x="36" width="${side - 36}" height="${H - 28}" fill="${c("sideBar-background", "#181818")}"/>`,
    `<rect x="${side}" width="110" height="32" fill="${c("tab-activeBackground", "#1f1f1f")}"/>`,
    text(side + 14, 21, ".shellcheckrc", {
      size: 13,
      fill: c("tab-activeForeground", "#ffffff"),
    }),
    text(50, 21, "EXPLORER", {
      size: 11,
      fill: c("sideBarTitle-foreground", "#cccccc"),
    }),
    `<rect x="36" y="62" width="${side - 36}" height="24" fill="${c("list-inactiveSelectionBackground", "#37373d")}"/>`,
    ...files.flatMap((name, i) => {
      const y = 79 + i * 24;
      const out = [
        text(56, y, name, {
          size: 13,
          fill: c("sideBar-foreground", "#cccccc"),
        }),
      ];
      if (i > 0) {
        out.push(
          `<g transform="translate(${side - 26} ${y - 13})"><path d="${refresh}" stroke="${c("textLink-foreground", "#4daafc")}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></g>`,
        );
      }
      return out;
    }),
    ...code.flatMap((line, i) => {
      const y = 66 + i * 28;
      return [
        text(side + 30, y, String(i + 1), {
          size: 15,
          font: MONO,
          anchor: "end",
          fill: c("editorLineNumber-foreground", "#6e7681"),
        }),
        text(side + 44, y, line, {
          size: 15,
          font: MONO,
          fill:
            i === 0
              ? c("descriptionForeground", "#9d9d9d")
              : c("editor-foreground", "#cccccc"),
        }),
      ];
    }),
    // The line just added.
    `<rect x="${side + 4}" y="78" width="3" height="20" fill="${c("editorGutter-addedBackground", "#2ea043")}"/>`,
    text(492, H - 9, "Plain Text", {
      size: 12,
      anchor: "end",
      fill: c("statusBar-foreground", "#cccccc"),
    }),
  ]);
}

const out = new URL("walkthrough/", import.meta.url);
for (const [name, render] of [
  ["status-bar.svg", statusBar],
  ["web.svg", web],
  ["wasm.svg", wasm],
  ["config-files.svg", configFiles],
]) {
  writeFileSync(new URL(name, out), render());
}
