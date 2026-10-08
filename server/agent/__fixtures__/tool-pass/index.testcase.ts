import { test, expect } from 'bun:test';
import analyze from './index.ts';
test('echo', () => { expect(analyze({ a: 1 }).usable).toBe(true); });
