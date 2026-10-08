// Subprocess entry for runner.runTool: `bun run tools/_run.ts <name>`, input JSON on stdin, output JSON on stdout.
// Parser input is { raw, filename } → parse(raw, { filename }); anything else → analyze(input).
export {};
const name = process.argv[2];
try {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`bad tool name: ${name}`);
  const input = JSON.parse(await Bun.stdin.text());
  const mod = await import('./' + name + '/index.ts');
  const fn = mod.default;
  if (typeof fn !== 'function') throw new Error(`tool ${name} has no default export`);
  const isRaw = input && typeof input === 'object' && typeof input.raw === 'string' && typeof input.filename === 'string';
  const out = isRaw ? await fn(input.raw, { filename: input.filename }) : await fn(input);
  process.stdout.write(JSON.stringify(out));
} catch (e) {
  process.stderr.write(String((e as Error)?.stack ?? e));
  process.exit(1);
}
