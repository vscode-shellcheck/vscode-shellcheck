# /// script
# dependencies = ["fonttools"]
# ///
"""Builds shellcheck-icons.woff from the SVGs next to it.

Run with `uv run resources/build-icon-font.py`. Each SVG must be a 16x16
filled path, and its code point must match the `fontCharacter` in package.json.
"""

from pathlib import Path
from xml.etree import ElementTree

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path

HERE = Path(__file__).parent
ICONS = {"shellcheck-logo": 0xE000}
EM = 1000
SCALE = EM / 16


def glyph(svg: Path):
    pen = TTGlyphPen(None)
    # SVG grows downwards, fonts grow upwards from the baseline.
    flipped = TransformPen(pen, (SCALE, 0, 0, -SCALE, 0, EM))
    for path in ElementTree.parse(svg).iter("{http://www.w3.org/2000/svg}path"):
        parse_path(path.attrib["d"], flipped)
    return pen.glyph()


names = [".notdef", *ICONS]
fb = FontBuilder(EM, isTTF=True)
fb.setupGlyphOrder(names)
fb.setupCharacterMap({cp: name for name, cp in ICONS.items()})
fb.setupGlyf(
    {".notdef": TTGlyphPen(None).glyph()}
    | {name: glyph(HERE / f"{name}.svg") for name in ICONS}
)
fb.setupHorizontalMetrics({name: (EM, 0) for name in names})
# Ascent of a full em and no descent, as VS Code's own codicon font has, so
# the glyph sits on the text line like a codicon.
fb.setupHorizontalHeader(ascent=EM, descent=0)
fb.setupNameTable({"familyName": "shellcheck-icons", "styleName": "Regular"})
fb.setupOS2(sTypoAscender=EM, sTypoDescender=0, usWinAscent=EM, usWinDescent=0)
fb.setupPost()
fb.font.flavor = "woff"
fb.save(HERE / "shellcheck-icons.woff")
