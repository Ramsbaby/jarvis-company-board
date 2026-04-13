#!/usr/bin/env python3
from playwright.sync_api import sync_playwright
import shutil, os

html_path = os.path.join(os.path.dirname(__file__), 'gen-map-bg.html')
out_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'map-bg.png')
desktop_path = os.path.expanduser('~/Desktop/map-bg.png')

with sync_playwright() as p:
    browser = p.chromium.launch()
    # 2x 렌더링 후 다운스케일 (안티앨리어싱)
    page = browser.new_page(viewport={'width': 2560, 'height': 1792})
    page.goto(f'file://{os.path.abspath(html_path)}')
    page.wait_for_timeout(1000)
    temp_path = out_path + '.2x.png'
    page.screenshot(path=temp_path, type='png')
    # 다운스케일
    from PIL import Image
    img = Image.open(temp_path).resize((1280, 896), Image.LANCZOS)
    img.save(out_path, 'PNG', optimize=True)
    os.remove(temp_path)
    browser.close()

shutil.copy(out_path, desktop_path)
size_kb = os.path.getsize(out_path) / 1024
print(f'✅ 생성 완료: {out_path} ({size_kb:.0f}KB)')
print(f'📋 Desktop 복사 완료')
