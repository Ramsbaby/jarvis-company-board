#!/usr/bin/env node
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { copyFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, 'gen-map-bg.html');
const outPath = join(__dirname, '..', 'public', 'map-bg.png');
const desktopPath = join(process.env.HOME, 'Desktop', 'map-bg.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 896 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: outPath, type: 'png' });
await browser.close();

copyFileSync(outPath, desktopPath);
console.log(`✅ 생성 완료: ${outPath}`);
console.log(`📋 Desktop 복사 완료`);
