#!/usr/bin/env python3
"""
JarvisMap 배경 — 모던 미니멀 플로어플랜 v3
핵심: 깔끔한 플랫 컬러 + 소프트 섀도 + 4x 렌더 후 다운스케일
"""
from PIL import Image, ImageDraw, ImageFilter
import math, os

# 최종 출력 크기
OUT_W, OUT_H = 1280, 896
# 4x 렌더링 (안티앨리어싱)
SCALE = 4
W, H = OUT_W * SCALE, OUT_H * SCALE
T = 32 * SCALE  # 128px per tile at 4x

COLS, ROWS = 40, 28


# ── 팔레트 ─────────────────────────────────────────────────────────
BG          = (246, 247, 249)
FLOOR_1     = (252, 252, 254)
FLOOR_2     = (248, 248, 251)
WALL_COLOR  = (195, 198, 205)
WALL_LIGHT  = (215, 217, 222)
WALL_DARK   = (175, 178, 185)

WOOD_BASE   = (200, 175, 140)
WOOD_ALT    = (210, 185, 150)
METAL_BASE  = (52, 57, 68)
METAL_ALT   = (58, 63, 74)

CARPET = {
    'president':  (245, 235, 210),
    'infra-lead': (220, 240, 225),
    'trend-lead': (220, 230, 248),
    'record-lead': (238, 230, 218),
    'audit-lead': (245, 225, 225),
    'finance':    (215, 240, 232),
    'library':    (222, 238, 250),
    'brand-lead': (248, 232, 218),
    'standup':    (248, 245, 222),
    'growth-lead': (218, 242, 238),
    'secretary':  (232, 225, 248),
    'server-room': (225, 228, 235),
}

ACCENT = {
    'president':  (185, 155, 65),
    'infra-lead': (60, 175, 105),
    'trend-lead': (70, 125, 215),
    'record-lead': (155, 125, 75),
    'audit-lead': (205, 80, 80),
    'finance':    (45, 175, 135),
    'library':    (55, 155, 215),
    'brand-lead': (215, 115, 55),
    'standup':    (205, 170, 45),
    'growth-lead': (50, 180, 165),
    'secretary':  (135, 100, 215),
    'server-room': (95, 105, 125),
}

ROOMS = [
    {'id': 'president',   'x': 2,  'y': 3,  'w': 7, 'h': 5, 'closed': True,  'floor': 'wood'},
    {'id': 'infra-lead',  'x': 9,  'y': 3,  'w': 5, 'h': 4, 'closed': False, 'floor': 'carpet'},
    {'id': 'trend-lead',  'x': 14, 'y': 3,  'w': 5, 'h': 4, 'closed': False, 'floor': 'carpet'},
    {'id': 'record-lead', 'x': 19, 'y': 3,  'w': 5, 'h': 4, 'closed': False, 'floor': 'carpet'},
    {'id': 'audit-lead',  'x': 24, 'y': 3,  'w': 5, 'h': 4, 'closed': False, 'floor': 'carpet'},
    {'id': 'finance',     'x': 29, 'y': 3,  'w': 7, 'h': 5, 'closed': True,  'floor': 'wood'},
    {'id': 'library',     'x': 2,  'y': 10, 'w': 5, 'h': 4, 'closed': False, 'floor': 'carpet'},
    {'id': 'brand-lead',  'x': 7,  'y': 10, 'w': 5, 'h': 4, 'closed': False, 'floor': 'carpet'},
    {'id': 'standup',     'x': 12, 'y': 10, 'w': 7, 'h': 5, 'closed': True,  'floor': 'carpet', 'glass': True},
    {'id': 'growth-lead', 'x': 19, 'y': 10, 'w': 5, 'h': 4, 'closed': False, 'floor': 'carpet'},
    {'id': 'secretary',   'x': 24, 'y': 10, 'w': 5, 'h': 4, 'closed': False, 'floor': 'carpet'},
    {'id': 'server-room', 'x': 29, 'y': 10, 'w': 7, 'h': 5, 'closed': True,  'floor': 'metal'},
    {'id': 'cron-center', 'x': 1,  'y': 17, 'w': 36, 'h': 8, 'closed': False, 'floor': 'metal'},
]


def tp(tx, ty):
    """타일 → 픽셀"""
    return int(tx * T), int(ty * T)


def rounded_rect(d, bbox, r, **kw):
    x1, y1, x2, y2 = bbox
    r = min(r, (x2 - x1) // 2, (y2 - y1) // 2)
    if r < 1:
        d.rectangle(bbox, **kw)
        return
    # 중앙 + 날개 + 4코너
    if 'fill' in kw and kw['fill']:
        d.rectangle([x1 + r, y1, x2 - r, y2], fill=kw['fill'])
        d.rectangle([x1, y1 + r, x2, y2 - r], fill=kw['fill'])
        d.pieslice([x1, y1, x1 + 2*r, y1 + 2*r], 180, 270, fill=kw['fill'])
        d.pieslice([x2 - 2*r, y1, x2, y1 + 2*r], 270, 360, fill=kw['fill'])
        d.pieslice([x1, y2 - 2*r, x1 + 2*r, y2], 90, 180, fill=kw['fill'])
        d.pieslice([x2 - 2*r, y2 - 2*r, x2, y2], 0, 90, fill=kw['fill'])
    if 'outline' in kw and kw['outline']:
        w = kw.get('width', 1)
        ol = kw['outline']
        d.line([(x1 + r, y1), (x2 - r, y1)], fill=ol, width=w)
        d.line([(x1 + r, y2), (x2 - r, y2)], fill=ol, width=w)
        d.line([(x1, y1 + r), (x1, y2 - r)], fill=ol, width=w)
        d.line([(x2, y1 + r), (x2, y2 - r)], fill=ol, width=w)
        d.arc([x1, y1, x1 + 2*r, y1 + 2*r], 180, 270, fill=ol, width=w)
        d.arc([x2 - 2*r, y1, x2, y1 + 2*r], 270, 360, fill=ol, width=w)
        d.arc([x1, y2 - 2*r, x1 + 2*r, y2], 90, 180, fill=ol, width=w)
        d.arc([x2 - 2*r, y2 - 2*r, x2, y2], 0, 90, fill=ol, width=w)


def make_shadow(x, y, w, h, blur=20, alpha=22):
    """소프트 섀도 레이어"""
    s = Image.new('RGBA', (W, H), (0,0,0,0))
    ImageDraw.Draw(s).rectangle([x+8, y+8, x+w+8, y+h+8], fill=(0,0,0,alpha))
    return s.filter(ImageFilter.GaussianBlur(blur))


# ══════════════════════════════════════════════════════════════════
# 캔버스 준비
# ══════════════════════════════════════════════════════════════════
canvas = Image.new('RGBA', (W, H), BG + (255,))
draw = ImageDraw.Draw(canvas)

print("  [1/6] 바닥...")

# ── 복도 바닥 (미세한 타일) ──
for ty in range(2, ROWS - 2):
    for tx in range(1, COLS - 1):
        x, y = tp(tx, ty)
        c = FLOOR_1 if (tx + ty) % 2 == 0 else FLOOR_2
        draw.rectangle([x, y, x + T - 1, y + T - 1], fill=c)
        # 타일 조인트
        draw.line([(x, y), (x + T, y)], fill=(238, 239, 242), width=SCALE)
        draw.line([(x, y), (x, y + T)], fill=(238, 239, 242), width=SCALE)

# ── 외벽 ──
print("  [2/6] 벽...")
wall_t = T * 2  # 벽 두께 2타일
# 상단
draw.rectangle([0, 0, W, wall_t - 1], fill=WALL_COLOR)
draw.line([(0, wall_t), (W, wall_t)], fill=WALL_DARK, width=SCALE * 2)
draw.line([(0, SCALE * 2), (W, SCALE * 2)], fill=WALL_LIGHT, width=SCALE)
# 하단
draw.rectangle([0, H - wall_t, W, H], fill=WALL_COLOR)
draw.line([(0, H - wall_t), (W, H - wall_t)], fill=WALL_DARK, width=SCALE * 2)
# 좌우
draw.rectangle([0, 0, T - 1, H], fill=WALL_COLOR)
draw.line([(T, 0), (T, H)], fill=WALL_DARK, width=SCALE * 2)
draw.rectangle([W - T, 0, W, H], fill=WALL_COLOR)
draw.line([(W - T, 0), (W - T, H)], fill=WALL_DARK, width=SCALE * 2)


# ── 방 바닥 ──
print("  [3/6] 방 바닥...")
for room in ROOMS:
    x, y = tp(room['x'], room['y'])
    w, h = room['w'] * T, room['h'] * T
    rid = room['id']
    margin = SCALE * 3

    if room['floor'] == 'wood':
        # 원목 — 깔끔한 플랭크 패턴
        for row in range(room['h'] * 4):
            for col in range(room['w'] * 2):
                bx = x + col * (T // 2)
                by = y + row * (T // 4)
                c = WOOD_BASE if (row + col) % 2 == 0 else WOOD_ALT
                draw.rectangle([bx, by, bx + T // 2 - 1, by + T // 4 - 1], fill=c)
                # 조인트
                draw.line([(bx, by), (bx + T // 2, by)], fill=(185, 162, 128), width=SCALE)

    elif room['floor'] == 'carpet':
        # 카펫 — 소프트 섀도 + 라운드 코너 + 플랫
        shadow = make_shadow(x + margin, y + margin, w - margin*2, h - margin*2, blur=SCALE*5, alpha=18)
        canvas = Image.alpha_composite(canvas, shadow)
        draw = ImageDraw.Draw(canvas)

        rounded_rect(draw, [x + margin, y + margin, x + w - margin, y + h - margin],
                     r=SCALE * 5, fill=CARPET[rid])
        # 악센트 보더
        rounded_rect(draw, [x + margin, y + margin, x + w - margin, y + h - margin],
                     r=SCALE * 5, outline=ACCENT[rid] + (80,), width=SCALE * 2)

    elif room['floor'] == 'metal':
        # 메탈 — 깔끔한 체커보드 (작은 타일)
        tile_s = T // 4
        for row in range(room['h'] * 4):
            for col in range(room['w'] * 4):
                bx = x + col * tile_s
                by = y + row * tile_s
                c = METAL_BASE if (row + col) % 2 == 0 else METAL_ALT
                draw.rectangle([bx, by, bx + tile_s - 1, by + tile_s - 1], fill=c)


# ── 닫힌 방 벽 ──
for room in ROOMS:
    if not room.get('closed'):
        continue
    x, y = tp(room['x'], room['y'])
    w, h = room['w'] * T, room['h'] * T
    wt = SCALE * 5  # 벽 두께

    # 방 섀도
    shadow = make_shadow(x, y, w, h, blur=SCALE*6, alpha=20)
    canvas = Image.alpha_composite(canvas, shadow)
    draw = ImageDraw.Draw(canvas)

    # 4면 벽
    draw.rectangle([x, y, x + w, y + wt], fill=WALL_COLOR)
    draw.rectangle([x, y + h - wt, x + w, y + h], fill=WALL_COLOR)
    draw.rectangle([x, y, x + wt, y + h], fill=WALL_COLOR)
    draw.rectangle([x + w - wt, y, x + w, y + h], fill=WALL_COLOR)

    # 벽 하이라이트 (상단)
    draw.line([(x, y + 1), (x + w, y + 1)], fill=WALL_LIGHT, width=SCALE)
    # 벽 다크 (하단 내부)
    draw.line([(x + wt, y + wt), (x + w - wt, y + wt)], fill=WALL_DARK, width=SCALE)
    draw.line([(x + wt, y + wt), (x + wt, y + h - wt)], fill=WALL_DARK, width=SCALE)

    # 문 (하단 중앙)
    door_w = T * 2
    door_x = x + (w - door_w) // 2
    draw.rectangle([door_x, y + h - wt, door_x + door_w, y + h], fill=FLOOR_1)

    # 유리벽
    if room.get('glass'):
        glass_c = (190, 215, 240, 100)
        frame_c = (155, 178, 200)
        # 상단 유리 패널들
        panel_w = SCALE * 18
        gap = SCALE * 4
        gx = x + wt + gap
        while gx + panel_w < x + w - wt - gap:
            # 유리 패널
            glass_panel = Image.new('RGBA', (W, H), (0,0,0,0))
            gpd = ImageDraw.Draw(glass_panel)
            gpd.rectangle([gx, y + SCALE, gx + panel_w, y + wt - SCALE], fill=glass_c)
            gpd.rectangle([gx, y + SCALE, gx + panel_w, y + wt - SCALE], outline=frame_c, width=SCALE)
            # 반사
            gpd.line([(gx + SCALE*2, y + SCALE*2), (gx + panel_w//2, y + SCALE*2)],
                     fill=(255, 255, 255, 50), width=SCALE)
            canvas = Image.alpha_composite(canvas, glass_panel)
            draw = ImageDraw.Draw(canvas)
            gx += panel_w + gap

        # 좌측 유리 패널들
        gy = y + wt + gap
        while gy + panel_w < y + h - wt - gap:
            glass_panel = Image.new('RGBA', (W, H), (0,0,0,0))
            gpd = ImageDraw.Draw(glass_panel)
            gpd.rectangle([x + SCALE, gy, x + wt - SCALE, gy + panel_w], fill=glass_c)
            gpd.rectangle([x + SCALE, gy, x + wt - SCALE, gy + panel_w], outline=frame_c, width=SCALE)
            canvas = Image.alpha_composite(canvas, glass_panel)
            draw = ImageDraw.Draw(canvas)
            gy += panel_w + gap


# ══════════════════════════════════════════════════════════════════
# 가구 (4x 스케일에서 디테일)
# ══════════════════════════════════════════════════════════════════
print("  [4/6] 가구...")
S = SCALE  # 축약

def desk(cx, cy, dw=24, dh=12, style='flat'):
    """모던 데스크"""
    dw *= S; dh *= S
    # 그림자
    draw.rectangle([cx-dw//2+S*2, cy-dh//2+S*2, cx+dw//2+S*2, cy+dh//2+S*2], fill=(0,0,0,15))
    # 상판
    rounded_rect(draw, [cx-dw//2, cy-dh//2, cx+dw//2, cy+dh//2], r=S*3, fill=(82, 78, 72))
    rounded_rect(draw, [cx-dw//2+S, cy-dh//2+S, cx+dw//2-S, cy+dh//2-S], r=S*2, fill=(92, 88, 82))
    # 하이라이트
    draw.line([(cx-dw//2+S*3, cy-dh//2+S), (cx+dw//2-S*3, cy-dh//2+S)], fill=(105, 100, 95), width=S)

    if style == 'L':
        ew, eh = S*12, dh + S*10
        draw.rectangle([cx-dw//2+S*2, cy-dh//2+S*2, cx-dw//2+ew+S*2, cy-dh//2+eh+S*2], fill=(0,0,0,15))
        rounded_rect(draw, [cx-dw//2, cy-dh//2, cx-dw//2+ew, cy-dh//2+eh], r=S*2, fill=(82, 78, 72))
        rounded_rect(draw, [cx-dw//2+S, cy-dh//2+S, cx-dw//2+ew-S, cy-dh//2+eh-S], r=S, fill=(92, 88, 82))

def monitor(cx, cy, accent=(100,180,150), big=False):
    """모니터"""
    mw = S * (20 if big else 16)
    mh = S * (14 if big else 10)
    # 스탠드
    draw.rectangle([cx-S*2, cy+mh//2-S, cx+S*2, cy+mh//2+S*4], fill=(70, 72, 78))
    rounded_rect(draw, [cx-S*5, cy+mh//2+S*3, cx+S*5, cy+mh//2+S*5], r=S, fill=(75, 77, 82))
    # 프레임
    rounded_rect(draw, [cx-mw//2, cy-mh//2, cx+mw//2, cy+mh//2], r=S*2, fill=(60, 62, 68))
    # 화면
    rounded_rect(draw, [cx-mw//2+S*2, cy-mh//2+S*2, cx+mw//2-S*2, cy+mh//2-S*2], r=S, fill=(28, 30, 38))
    # 화면 내용
    for i, ly in enumerate(range(cy-mh//2+S*4, cy+mh//2-S*4, S*3)):
        lw = mw - S*12 - (i % 3) * S*4
        draw.line([(cx-lw//2, ly), (cx+lw//2, ly)], fill=accent + (160,), width=S)
    # 화면 반사
    draw.line([(cx-mw//2+S*3, cy-mh//2+S*3), (cx-mw//2+S*8, cy-mh//2+S*3)],
              fill=(255,255,255,40), width=S)

def chair(cx, cy):
    """의자"""
    # 그림자
    draw.ellipse([cx-S*6, cy-S*4+S*2, cx+S*8, cy+S*8+S*2], fill=(0,0,0,15))
    # 좌석
    draw.ellipse([cx-S*6, cy-S*5, cx+S*6, cy+S*5], fill=(65, 68, 75))
    draw.ellipse([cx-S*4, cy-S*3, cx+S*4, cy+S*3], fill=(72, 75, 82))
    # 등받이
    draw.arc([cx-S*7, cy-S*7, cx+S*7, cy+S*3], 200, 340, fill=(55, 58, 65), width=S*3)

def server_rack(x, y, rh=S*32):
    """서버 랙"""
    rw = S * 16
    draw.rectangle([x+S*2, y+S*2, x+rw+S*2, y+rh+S*2], fill=(0,0,0,18))
    rounded_rect(draw, [x, y, x+rw, y+rh], r=S*2, fill=(42, 47, 58))
    rounded_rect(draw, [x+S, y+S, x+rw-S, y+rh-S], r=S, fill=(50, 55, 66))
    # 유닛
    unit_h = S * 4
    for i in range(rh // (unit_h + S*2)):
        uy = y + S*3 + i * (unit_h + S*2)
        if uy + unit_h > y + rh - S*3: break
        draw.rectangle([x+S*3, uy, x+rw-S*3, uy+unit_h], fill=(38, 42, 52))
        # LED
        led_c = [(34,197,94), (59,130,246)][i % 2]
        draw.ellipse([x+rw-S*6, uy+S, x+rw-S*3, uy+S*3], fill=led_c)
        # LED 글로우
        glow = Image.new('RGBA', (W, H), (0,0,0,0))
        ImageDraw.Draw(glow).ellipse([x+rw-S*8, uy-S, x+rw-S, uy+S*4], fill=led_c + (25,))
        canvas_ref = canvas  # workaround

def bookshelf(x, y, bh=S*40):
    """책장"""
    bw = S * 14
    draw.rectangle([x+S*2, y+S*2, x+bw+S*2, y+bh+S*2], fill=(0,0,0,15))
    rounded_rect(draw, [x, y, x+bw, y+bh], r=S*2, fill=(135, 110, 80))
    # 선반
    shelves = 4
    sh_h = bh // shelves
    for i in range(shelves + 1):
        sy = y + i * sh_h
        draw.line([(x+S, sy), (x+bw-S, sy)], fill=(115, 92, 65), width=S*2)
    # 책
    book_colors = [(185,70,70),(70,135,185),(70,165,95),(195,170,60),(155,80,155)]
    import random
    random.seed(42)
    for shelf in range(shelves):
        by = y + shelf * sh_h + S*4
        book_h = sh_h - S*6
        bx = x + S*3
        for b in range(random.randint(4, 6)):
            bwidth = random.randint(S*2, S*4)
            bc = book_colors[(shelf*7+b) % len(book_colors)]
            draw.rectangle([bx, by, bx+bwidth, by+book_h], fill=bc)
            bx += bwidth + S
            if bx > x + bw - S*5: break

def whiteboard(x, y, ww=S*30, wh=S*22):
    """화이트보드"""
    draw.rectangle([x+S*2, y+S*2, x+ww+S*2, y+wh+S*2], fill=(0,0,0,12))
    rounded_rect(draw, [x, y, x+ww, y+wh], r=S*2, fill=(210, 212, 218))
    rounded_rect(draw, [x+S*2, y+S*2, x+ww-S*2, y+wh-S*2], r=S, fill=(250, 250, 252))
    # 내용
    draw.line([(x+S*5, y+S*6), (x+ww-S*8, y+S*6)], fill=(90,90,100,130), width=S)
    draw.line([(x+S*5, y+S*11), (x+ww-S*14, y+S*11)], fill=(205,85,85,130), width=S)
    draw.line([(x+S*5, y+S*16), (x+ww-S*6, y+S*16)], fill=(85,85,205,130), width=S)

def meeting_table(cx, cy, tw=S*56, th=S*20):
    """회의 테이블"""
    draw.rectangle([cx-tw//2+S*3, cy-th//2+S*3, cx+tw//2+S*3, cy+th//2+S*3], fill=(0,0,0,18))
    rounded_rect(draw, [cx-tw//2, cy-th//2, cx+tw//2, cy+th//2], r=S*8, fill=(78, 75, 70))
    rounded_rect(draw, [cx-tw//2+S*2, cy-th//2+S*2, cx+tw//2-S*2, cy+th//2-S*2],
                 r=S*6, fill=(88, 85, 80))
    draw.line([(cx-tw//2+S*8, cy-th//2+S*3), (cx+tw//2-S*8, cy-th//2+S*3)],
             fill=(98, 95, 90), width=S)

def plant(cx, cy, size=1.0):
    """화분"""
    s = size
    pw, ph = int(S*10*s), int(S*12*s)
    # 그림자
    draw.ellipse([cx-pw//2+S*2, cy+ph//2-S*2, cx+pw//2+S*4, cy+ph//2+S*4], fill=(0,0,0,15))
    # 화분
    pts = [(cx-pw//2, cy+S*2), (cx+pw//2, cy+S*2), (cx+pw//2-S*2, cy+ph), (cx-pw//2+S*2, cy+ph)]
    draw.polygon(pts, fill=(185, 125, 85))
    draw.line([pts[0], pts[1]], fill=(200, 140, 95), width=S*2)
    # 잎
    leaf_r = int(S * 10 * s)
    greens = [(65,160,75), (75,175,85), (55,145,65), (80,185,90)]
    for i, angle in enumerate(range(0, 360, 50)):
        rad = math.radians(angle)
        lx = cx + int(math.cos(rad) * leaf_r * 0.5)
        ly = cy - int(S*2) + int(math.sin(rad) * leaf_r * 0.3) - int(S*3*s)
        lr = int(leaf_r * 0.45)
        draw.ellipse([lx-lr, ly-lr, lx+lr, ly+lr], fill=greens[i % 4])
    draw.ellipse([cx-int(S*3*s), cy-int(S*10*s), cx+int(S*3*s), cy-int(S*2)], fill=(80,180,92))

def sofa(cx, cy):
    """소파"""
    sw, sh = S*30, S*12
    draw.rectangle([cx-sw//2+S*2, cy-sh//2+S*2, cx+sw//2+S*2, cy+sh//2+S*2], fill=(0,0,0,15))
    rounded_rect(draw, [cx-sw//2, cy-sh//2, cx+sw//2, cy+sh//2], r=S*4, fill=(80,125,165))
    # 쿠션
    rounded_rect(draw, [cx-sw//2+S*3, cy-sh//2+S*2, cx-S*2, cy+sh//2-S*2], r=S*3, fill=(90,135,175))
    rounded_rect(draw, [cx+S*2, cy-sh//2+S*2, cx+sw//2-S*3, cy+sh//2-S*2], r=S*3, fill=(90,135,175))
    # 하이라이트
    draw.line([(cx-sw//2+S*5, cy-sh//2+S*3), (cx-S*4, cy-sh//2+S*3)], fill=(100,145,185), width=S)

def watercooler(cx, cy):
    """정수기"""
    draw.ellipse([cx-S*5, cy+S*7, cx+S*7, cy+S*13], fill=(0,0,0,12))
    rounded_rect(draw, [cx-S*5, cy-S*2, cx+S*5, cy+S*9], r=S*2, fill=(215,218,225))
    rounded_rect(draw, [cx-S*3, cy-S*12, cx+S*3, cy-S], r=S*3, fill=(185,218,240,200))
    draw.rectangle([cx-S, cy+S, cx+S, cy+S*3], fill=(165,168,175))

def vending(cx, cy):
    """자판기"""
    vw, vh = S*20, S*26
    draw.rectangle([cx-vw//2+S*2, cy-vh//2+S*2, cx+vw//2+S*2, cy+vh//2+S*2], fill=(0,0,0,15))
    rounded_rect(draw, [cx-vw//2, cy-vh//2, cx+vw//2, cy+vh//2], r=S*3, fill=(195,65,65))
    # 진열대
    rounded_rect(draw, [cx-vw//2+S*3, cy-vh//2+S*3, cx+vw//2-S*3, cy+vh//2-S*10],
                 r=S*2, fill=(235,238,242))
    # 상품
    colors = [(65,165,85),(65,125,205),(205,185,55)]
    for row in range(3):
        for col in range(3):
            sx = cx - S*5 + col * S*5
            sy = cy - vh//2 + S*5 + row * S*5
            draw.rectangle([sx, sy, sx+S*3, sy+S*3], fill=colors[col])
    # 투입구
    rounded_rect(draw, [cx-S*3, cy+vh//2-S*8, cx+S*3, cy+vh//2-S*4], r=S, fill=(45,48,55))

def cron_ws(cx, cy):
    """크론 워크스테이션"""
    # 미니 데스크
    draw.rectangle([cx-S*7, cy+S*1, cx+S*7, cy+S*5], fill=(48,52,62))
    draw.rectangle([cx-S*6, cy+S*2, cx+S*6, cy+S*4], fill=(55,58,68))
    # 미니 모니터
    rounded_rect(draw, [cx-S*5, cy-S*5, cx+S*5, cy+S*1], r=S, fill=(55,58,68))
    draw.rectangle([cx-S*4, cy-S*4, cx+S*4, cy], fill=(30,33,42))
    # 화면 라인
    draw.line([(cx-S*3, cy-S*3), (cx+S*2, cy-S*3)], fill=(34,197,94,150), width=S)
    draw.line([(cx-S*3, cy-S*1), (cx+S*1, cy-S*1)], fill=(59,130,246,150), width=S)
    # 스탠드
    draw.rectangle([cx-S, cy, cx+S, cy+S], fill=(58,61,70))


# ── 가구 배치 ──
for room in ROOMS:
    rx, ry = tp(room['x'], room['y'])
    rw, rh = room['w'] * T, room['h'] * T
    cx = rx + rw // 2
    cy = ry + rh // 2
    rid = room['id']
    acc = ACCENT.get(rid, (100,180,150))

    if rid in ('president', 'finance'):
        desk(cx - S*14, cy - S*6, dw=28, dh=14, style='L')
        monitor(cx - S*6, cy - S*22, acc)
        chair(cx + S*18, cy + S*8)
        bookshelf(rx + rw - S*18, ry + S*14)

    elif rid == 'standup':
        meeting_table(cx, cy)
        for i in range(4):
            chair(cx - S*22 + i * S*15, cy - S*20)
            chair(cx - S*22 + i * S*15, cy + S*20)
        whiteboard(rx + rw - S*36, ry + S*16)
        monitor(cx - S*22, cy - S*34, acc, big=True)

    elif rid == 'server-room':
        server_rack(rx + rw - S*20, ry + S*14, rh=S*34)
        server_rack(rx + rw - S*40, ry + S*14, rh=S*34)
        server_rack(rx + rw - S*20, ry + S*54, rh=S*34)
        desk(cx - S*28, cy + S*6, dw=22, dh=12)
        monitor(cx - S*28, cy - S*10, acc)
        chair(cx - S*28, cy + S*22)

    elif rid == 'cron-center':
        for i in range(72):
            col = i % 16
            row = i // 16
            ws_x = int((room['x'] + 1.5 + col * 2.0) * T)
            ws_y = int((room['y'] + 1.5 + row * 1.2) * T)
            cron_ws(ws_x, ws_y)
        # 양끝 서버랙
        server_rack(rx + S*4, ry + S*12, rh=S*30)
        server_rack(rx + rw - S*20, ry + S*12, rh=S*30)
        server_rack(rx + S*4, ry + S*52, rh=S*30)
        server_rack(rx + rw - S*20, ry + S*52, rh=S*30)

    elif not room.get('closed'):
        desk(cx, cy - S*4, dw=24, dh=12)
        monitor(cx, cy - S*16, acc)
        chair(cx, cy + S*14)


# ── 복도 오브젝트 ──
print("  [5/6] 복도...")
plant(int(1.5*T), int(9*T))
plant(int(38.5*T), int(9*T))
plant(int(1.5*T), int(16*T))
plant(int(38.5*T), int(16*T))
plant(int(10*T), int(15.5*T), size=0.7)
plant(int(30*T), int(15.5*T), size=0.7)

sofa(int(6*T), int(15.5*T))
sofa(int(27*T), int(15.5*T))
watercooler(int(16*T), int(15.5*T))
vending(int(22*T), int(15.5*T))


# ══════════════════════════════════════════════════════════════════
# 다운스케일 (안티앨리어싱)
# ══════════════════════════════════════════════════════════════════
print("  [6/6] 4x → 1x 다운스케일...")
final = canvas.convert('RGB').resize((OUT_W, OUT_H), Image.LANCZOS)

out_path = '/Users/ramsbaby/jarvis-board/public/map-bg.png'
final.save(out_path, 'PNG', optimize=True)

import shutil
shutil.copy(out_path, '/Users/ramsbaby/Desktop/map-bg.png')

size_kb = os.path.getsize(out_path) / 1024
print(f"✅ 완료: {out_path} ({OUT_W}x{OUT_H}px, {size_kb:.0f}KB)")
