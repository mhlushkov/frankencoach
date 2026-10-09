// Text → PNG with macOS AppKit (osascript -l JavaScript), because the installed ffmpeg has no drawtext.
// Usage:
//   osascript -l JavaScript render-text.js caption <text> <#rrggbb> <out.png> [size]   box: text on black at 62 %
//   osascript -l JavaScript render-text.js card <line1> <line2> <out.png>              1920x1080 black card
// Env FC_FONT_DIR: folder with BarlowCondensed-600.woff2 and IBMPlexMono-400.woff2 (registered for this process).
// Falls back to Arial Narrow Bold / Menlo if the brand fonts cannot be loaded. Prints "font=<name>".
ObjC.import('Foundation'); ObjC.import('AppKit'); ObjC.import('CoreText');

function register(dir, file) {
  if (!dir) return;
  $.CTFontManagerRegisterFontsForURL($.NSURL.fileURLWithPath(dir + '/' + file), 1, null);
}
function font(names, size) {
  for (const n of names) {
    const f = $.NSFont.fontWithNameSize(n, size);
    if (!f.isNil()) return f;
  }
  return $.NSFont.boldSystemFontOfSize(size);
}
function hex(h, a) {
  const v = parseInt(h.replace('#', ''), 16);
  return $.NSColor.colorWithSRGBRedGreenBlueAlpha(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, a);
}
function attrs(f, c) {
  return $.NSDictionary.dictionaryWithObjectsForKeys($([f, c]), $([$.NSFontAttributeName, $.NSForegroundColorAttributeName]));
}
function canvas(W, H, draw, out) {
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, W, H, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext(ctx);
  draw();
  ctx.flushGraphics;
  $.NSGraphicsContext.restoreGraphicsState;
  const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
  if (!png.writeToFileAtomically(out, true)) throw new Error('cannot write ' + out);
}

function run(argv) {
  const dir = $.NSProcessInfo.processInfo.environment.objectForKey('FC_FONT_DIR');
  const fontDir = dir.isNil() ? '' : ObjC.unwrap(dir);
  register(fontDir, 'BarlowCondensed-600.woff2');
  register(fontDir, 'IBMPlexMono-400.woff2');
  const condensed = ['BarlowCondensed-SemiBold', 'ArialNarrow-Bold'];
  const mono = ['IBMPlexMono', 'IBMPlexMono-Regular', 'Menlo-Regular'];
  const mode = argv[0];

  if (mode === 'caption') {
    const [, text, colour, out, size] = argv;
    const f = font(condensed, Number(size || 44));
    const a = attrs(f, hex(colour, 1));
    const s = $(text);
    const sz = s.sizeWithAttributes(a);
    const padX = 22, padY = 12;
    const W = Math.ceil(sz.width) + 2 * padX, H = Math.ceil(sz.height) + 2 * padY;
    canvas(W, H, () => {
      hex('#000000', 0.62).setFill;
      $.NSRectFill($.NSMakeRect(0, 0, W, H));
      s.drawAtPointWithAttributes($.NSMakePoint(padX, padY), a);
    }, out);
    return 'font=' + ObjC.unwrap(f.fontName);
  }

  if (mode === 'card') {
    const [, line1, line2, out] = argv;
    const W = 1920, H = 1080;
    const f1 = font(condensed, 120), f2 = font(mono, 40);
    const a1 = attrs(f1, hex('#e4e7e5', 1)), a2 = attrs(f2, hex('#8b9296', 1));
    const s1 = $(line1), s2 = $(line2);
    const z1 = s1.sizeWithAttributes(a1), z2 = s2.sizeWithAttributes(a2);
    canvas(W, H, () => {
      hex('#000000', 1).setFill;
      $.NSRectFill($.NSMakeRect(0, 0, W, H));
      s1.drawAtPointWithAttributes($.NSMakePoint((W - z1.width) / 2, H / 2 + 10), a1);
      s2.drawAtPointWithAttributes($.NSMakePoint((W - z2.width) / 2, H / 2 - z2.height - 20), a2);
    }, out);
    return 'font=' + ObjC.unwrap(f1.fontName) + ',' + ObjC.unwrap(f2.fontName);
  }

  throw new Error('usage: render-text.js caption <text> <#hex> <out.png> [size] | card <line1> <line2> <out.png>');
}
