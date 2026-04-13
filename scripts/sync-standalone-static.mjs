#!/usr/bin/env node
/**
 * postbuild: standalone 디렉토리에 static + public 자동 동기화.
 * npm run build 후 항상 실행되므로, 수동 빌드 시에도 JS 404가 발생하지 않음.
 */
import { cpSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;
const candidates = [
  join(root, '.next/standalone/jarvis-board'),
  join(root, '.next/standalone'),
];
const standalone = candidates.find(d => existsSync(d));

if (!standalone) {
  console.log('[postbuild] standalone 디렉토리 없음 — 스킵 (dev 모드일 수 있음)');
  process.exit(0);
}

// static 동기화
const srcStatic = join(root, '.next/static');
const dstStatic = join(standalone, '.next/static');
if (existsSync(srcStatic)) {
  mkdirSync(join(standalone, '.next'), { recursive: true });
  if (existsSync(dstStatic)) rmSync(dstStatic, { recursive: true });
  cpSync(srcStatic, dstStatic, { recursive: true });
  console.log(`[postbuild] ✅ static 동기화 완료 → ${dstStatic}`);
}

// public 동기화
const srcPublic = join(root, 'public');
const dstPublic = join(standalone, 'public');
if (existsSync(srcPublic)) {
  if (existsSync(dstPublic)) rmSync(dstPublic, { recursive: true });
  cpSync(srcPublic, dstPublic, { recursive: true });
  console.log(`[postbuild] ✅ public 동기화 완료 → ${dstPublic}`);
}
