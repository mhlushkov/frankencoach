import type { AnalyzeInput, ChainStep, ToolInputType, ToolKind, ToolManifest } from '../../contracts/types';

export interface Ident { activity: string; formatId?: string }
export type FindFn = (q: { kind: ToolKind; inputType: ToolInputType; activity: string }) => ToolManifest | undefined;

/**
 * landmarks → [analyze(landmarks)]; file → [parse(raw:<formatId>), analyze(session)]; none → [].
 * Each step is resolved with an EXACT registry lookup; '*' tools never satisfy a step (find() must not return them).
 */
export function plan(input: AnalyzeInput, ident: Ident, find: FindFn): ChainStep[] {
  const steps: ChainStep[] = [];
  if (input.kind === 'none') return steps;
  if (input.kind === 'file') {
    const formatId = ident.formatId ?? 'unknown';
    steps.push(resolve({ step: 'parse', inputType: `raw:${formatId}`, activity: ident.activity }, find));
    steps.push(resolve({ step: 'analyze', inputType: 'session', activity: ident.activity }, find));
    return steps;
  }
  steps.push(resolve({ step: 'analyze', inputType: 'landmarks', activity: ident.activity }, find));
  return steps;
}

function resolve(s: Omit<ChainStep, 'tool' | 'missing'>, find: FindFn): ChainStep {
  const kind: ToolKind = s.step === 'parse' ? 'parser' : 'analyzer';
  const m = find({ kind, inputType: s.inputType, activity: s.activity });
  if (m && m.activity !== '*') return { ...s, tool: m.name, missing: false };
  return { ...s, missing: true };
}
