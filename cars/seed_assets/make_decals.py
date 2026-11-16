"""Generates the livery decal artwork in cars/seed_assets/textures/decals/.

Run from the project folder (needs Pillow, already in requirements.txt):

    .venv\\Scripts\\python cars\\seed_assets\\make_decals.py

Every design is a set of transparent PNGs:
  <slug>_top.png        projected straight down onto the hood, roof and boot (front of the car at the TOP)
  <slug>_side.png       the flank where the car faces the RIGHT of the image
  <slug>_side_flip.png  the same design mirrored, for the flank where the car faces the LEFT

The images are stretched to the car's body when they are projected, so only the proportions matter:
top images are tall and narrow (about 0.41:1), side images are a long band (5:1). The F1 car only gets
top images - its sides are tyres and open wheels, so a flank decal would just smear across the rubber.
"""
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

SS = 3  # supersampling factor, drawn big and shrunk for clean anti-aliased edges
TW, TH = 576, 1408  # top image
SW, SH = 2048, 410  # side image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures", "decals")


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def pts(self, points):
        return [(x * SS, y * SS) for x, y in points]

    def poly(self, points, fill):
        self.d.polygon(self.pts(points), fill=fill)

    def ellipse(self, x0, y0, x1, y1, fill):
        self.d.ellipse([x0 * SS, y0 * SS, x1 * SS, y1 * SS], fill=fill)

    def rect(self, x0, y0, x1, y1, fill):
        self.d.rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], fill=fill)

    def line(self, points, fill, width):
        self.d.line(self.pts(points), fill=fill, width=int(width * SS), joint="curve")

    def layer(self):
        """A blank layer the same size, to draw into and composite (for fades and masks)."""
        c = Canvas.__new__(Canvas)
        c.w, c.h = self.w, self.h
        c.img = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        c.d = ImageDraw.Draw(c.img)
        return c

    def paste(self, other, mask=None):
        if mask is not None:
            a = ImageChops.multiply(other.img.getchannel("A"), mask)
            other.img.putalpha(a)
        self.img = Image.alpha_composite(self.img, other.img)
        self.d = ImageDraw.Draw(self.img)

    def save(self, path):
        out = self.img.resize((self.w, self.h), Image.LANCZOS)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        out.save(path, optimize=True)


def font(size):
    for name in ("impact.ttf", "arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, int(size * SS))
        except OSError:
            continue
    return ImageFont.load_default()


def text_center(c, cx, cy, s, size, fill):
    f = font(size)
    box = c.d.textbbox((0, 0), s, font=f)
    c.d.text((cx * SS - (box[2] + box[0]) / 2, cy * SS - (box[3] + box[1]) / 2), s, font=f, fill=fill)


def gradient_mask(c, x0, x1, vertical=False, lo=0.0, hi=1.0):
    """Alpha mask fading from lo at one end to hi at the other, in supersampled pixels."""
    w, h = c.img.size
    m = Image.new("L", (w, h), 0)
    px = m.load()
    if vertical:
        for y in range(h):
            t = min(1, max(0, (y / SS - x0) / max(1e-6, (x1 - x0))))
            v = int(255 * (lo + (hi - lo) * t))
            for x in range(w):
                px[x, y] = v
    else:
        row = [int(255 * (lo + (hi - lo) * min(1, max(0, (x / SS - x0) / max(1e-6, (x1 - x0)))))) for x in range(w)]
        for y in range(h):
            for x in range(w):
                px[x, y] = row[x]
    return m


def blade(c, p0, p1, p2, w0, fill, power=0.85, steps=48):
    """A tapering slash along a quadratic curve: thick at p0, a sharp point at p2."""
    left, right = [], []
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
        dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        w = w0 * (1 - t) ** power * (0.55 + 0.45 * min(1, t * 6))  # slight blunt start
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    c.poly(left + right[::-1], fill)


def hexagon(cx, cy, r, rot=0):
    return [(cx + r * math.cos(math.pi / 3 * k + rot), cy + r * math.sin(math.pi / 3 * k + rot)) for k in range(6)]


def sticker(c, cx, cy, s, size, bg, fg):
    f = font(size)
    box = c.d.textbbox((0, 0), s, font=f)
    w, h = (box[2] - box[0]) / SS + 26, (box[3] - box[1]) / SS + 16
    c.d.rounded_rectangle([(cx - w / 2) * SS, (cy - h / 2) * SS, (cx + w / 2) * SS, (cy + h / 2) * SS], radius=10 * SS, fill=bg)
    text_center(c, cx, cy - 2, s, size, fg)


def roundel(c, cx, cy, r, number, ring, bg, fg):
    c.ellipse(cx - r, cy - r, cx + r, cy + r, ring)
    c.ellipse(cx - r * 0.86, cy - r * 0.86, cx + r * 0.86, cy + r * 0.86, bg)
    text_center(c, cx, cy + r * 0.04, str(number), r * 1.15, fg)


WHITE = (246, 247, 250, 255)
BLACK = (14, 15, 20, 255)
RED = (226, 38, 48, 255)
BLUE = (28, 52, 148, 255)
NAVY = (14, 24, 78, 255)
LIGHT_BLUE = (80, 160, 235, 255)


# ---- design: claws (the reference livery's sharp slashes) -------------------------------------
def claws(c1, c2, c3, edge, tag="TURBO TUNES"):
    side = Canvas(SW, SH)
    for g, (xs, spread, n) in enumerate([(0.04, 0.075, 6), (0.57, 0.062, 4)]):
        for i in range(n):
            x0 = SW * (xs + spread * i)
            p0, p1, p2 = (x0, SH * 1.02), (x0 + SW * 0.07, SH * 0.52), (x0 + SW * (0.19 + 0.012 * i), SH * 0.02)
            col = c2 if i % 3 == 1 else c1
            blade(side, (p0[0] + 14, p0[1] + 8), (p1[0] + 14, p1[1] + 8), (p2[0] + 14, p2[1] + 8), 46, edge)
            blade(side, p0, p1, p2, 44 - i * 2, col)
        # a bold accent blade per group
        x0 = SW * (xs + 0.015)
        blade(side, (x0, SH * 1.02), (x0 + SW * 0.1, SH * 0.6), (x0 + SW * 0.27, SH * 0.1), 18, c3)
    def deco(cv, m):
        if tag:
            sticker(cv, SW * (0.1 if m else 0.9), SH * 0.84, tag, 40, (14, 15, 20, 235), WHITE)

    top = Canvas(TW, TH)
    cx = TW / 2
    for sgn in (-1, 1):
        for i in range(5):
            x0 = cx + sgn * (26 + 26 * i)
            p0, p1, p2 = (x0, TH * 0.01), (x0 + sgn * 80, TH * (0.1 + 0.015 * i)), (cx + sgn * (210 + 18 * i), TH * (0.3 + 0.012 * i))
            blade(top, (p0[0], p0[1] + 6), (p1[0], p1[1] + 6), (p2[0], p2[1] + 6), 30, edge)
            blade(top, p0, p1, p2, 28 - i * 2, c2 if i == 2 else c1)
    # roof stripe and boot slashes
    top.poly([(cx - 44, TH * 0.36), (cx + 44, TH * 0.36), (cx + 26, TH * 0.66), (cx - 26, TH * 0.66)], c1)
    top.poly([(cx - 14, TH * 0.36), (cx + 14, TH * 0.36), (cx + 8, TH * 0.66), (cx - 8, TH * 0.66)], c2)
    for sgn in (-1, 1):
        for i in range(3):
            x0 = cx + sgn * (30 + 30 * i)
            blade(top, (x0, TH * 0.99), (x0 + sgn * 50, TH * 0.9), (cx + sgn * (130 + 30 * i), TH * 0.76), 24 - i * 3, c1 if i != 1 else c2)
    return top, side, deco


# ---- design: stripes -------------------------------------------------------------------------
def stripes(cols, fade=True):
    side = Canvas(SW, SH)
    n = len(cols)
    for i, col in enumerate(cols):
        y = SH * (0.30 + 0.17 * i)
        h = 30 if i != n // 2 else 40
        # long band with a diagonal-cut front end and a tapered rear
        side.poly([(SW * (0.02 + 0.015 * i), y + h), (SW * (0.06 + 0.015 * i), y), (SW * (0.95 - 0.012 * i), y), (SW * (0.985 - 0.012 * i), y + h)], col)
    top = Canvas(TW, TH)
    cx = TW / 2
    widths = [(-96, -64), (-52, -36), (36, 52), (64, 96)] if n < 3 else [(-110, -78), (-68, -44), (-34, -14), (14, 34), (44, 68), (78, 110)]
    for k, (a, b) in enumerate(widths):
        col = cols[min(k if k < len(widths) // 2 else len(widths) - 1 - k, n - 1)]
        top.poly([(cx + a, 0), (cx + b, 0), (cx + b, TH), (cx + a, TH)], col)
    return top, side


# ---- design: carbon weave + accent -----------------------------------------------------------
def carbon_pattern(c, x0, y0, x1, y1, cell=9):
    base = c.layer()
    base.rect(x0, y0, x1, y1, (18, 19, 24, 255))
    for yy in range(int(y0), int(y1), cell):
        for xx in range(int(x0), int(x1), cell):
            if ((xx // cell) + (yy // cell)) % 2:
                base.poly([(xx, yy), (xx + cell, yy), (xx + cell, yy + cell * 0.5)], (44, 47, 56, 255))
            else:
                base.poly([(xx, yy), (xx, yy + cell), (xx + cell * 0.5, yy + cell)], (30, 32, 40, 255))
    c.paste(base)


def carbon(accent):
    side = Canvas(SW, SH)
    carbon_pattern(side, SW * 0.04, SH * 0.78, SW * 0.96, SH * 0.98)  # carbon side-skirt band
    side.rect(SW * 0.04, SH * 0.72, SW * 0.96, SH * 0.755, accent)
    side.rect(SW * 0.04, SH * 0.755, SW * 0.96, SH * 0.77, WHITE)
    top = Canvas(TW, TH)
    carbon_pattern(top, 80, TH * 0.03, TW - 80, TH * 0.28)  # hood panel
    carbon_pattern(top, 130, TH * 0.4, TW - 130, TH * 0.64)  # roof panel
    carbon_pattern(top, 110, TH * 0.82, TW - 110, TH * 0.97)  # boot lid
    for y0, y1 in [(0.03, 0.28), (0.4, 0.64), (0.82, 0.97)]:
        inset = 80 if y0 < 0.3 else (130 if y0 < 0.5 else 110)
        top.line([(inset, TH * y0), (TW - inset, TH * y0), (TW - inset, TH * y1), (inset, TH * y1), (inset, TH * y0)], accent, 7)
    return top, side


# ---- design: chevrons ------------------------------------------------------------------------
def chevrons(c1, c2, number=None, num_ring=WHITE, num_bg=BLACK, num_fg=WHITE):
    side = Canvas(SW, SH)
    n = 11
    for i in range(n):
        x = SW * (0.1 + 0.075 * i)
        w = 34 + 8 * math.sin(i)
        col = c1 if i % 2 == 0 else c2
        side.poly([(x, SH * 0.22), (x + 90, SH * 0.5), (x, SH * 0.78), (x + w, SH * 0.78), (x + w + 90, SH * 0.5), (x + w, SH * 0.22)], col)

    def deco(cv, m):
        if number is not None:
            roundel(cv, SW * 0.5, SH * 0.5, 92, number, num_ring, num_bg, num_fg)

    top = Canvas(TW, TH)
    cx = TW / 2
    for i in range(9):
        y = TH * (0.04 + 0.1 * i)
        col = c1 if i % 2 == 0 else c2
        top.poly([(cx - 190, y + 110), (cx, y), (cx + 190, y + 110), (cx + 190, y + 150), (cx, y + 40), (cx - 190, y + 150)], col)
    return top, side, deco


# ---- design: lightning -----------------------------------------------------------------------
def bolt(c, x, y, w, h, fill, glow=None):
    pts = [(x, y), (x + w * 0.58, y), (x + w * 0.34, y + h * 0.42), (x + w * 0.82, y + h * 0.42), (x + w * 0.1, y + h), (x + w * 0.3, y + h * 0.56), (x - w * 0.12, y + h * 0.56)]
    if glow:
        c.poly([(px + 10, py + 8) for px, py in pts], glow)
    c.poly(pts, fill)


def lightning(c1, c2):
    side = Canvas(SW, SH)
    for i in range(7):
        x = SW * (0.08 + 0.125 * i)
        bolt(side, x, SH * 0.1, 80 + 16 * (i % 3), SH * 0.8, c1 if i % 2 == 0 else c2, glow=(10, 14, 40, 200))
    top = Canvas(TW, TH)
    cx = TW / 2
    for i, (y, s) in enumerate([(0.02, 1.0), (0.4, 0.9), (0.78, 0.8)]):
        bolt(top, cx - 70 * s, TH * y, 150 * s, TH * 0.2 * s, c1 if i != 1 else c2, glow=(10, 14, 40, 200))
    top.rect(cx - 5, 0, cx + 5, TH, c2)
    return top, side


# ---- design: hex fade ------------------------------------------------------------------------
def hex_fade(c1, c2, base_ring=None):
    def fill(cv, fade_axis_len, vertical):
        lay = cv.layer()
        r = 34
        row_h = r * math.sqrt(3)
        yy, row = -r, 0
        while yy < cv.h + r:
            xx = -r + (r * 1.5 if row % 2 else 0)
            while xx < cv.w + r:
                t = (yy / cv.h) if vertical else (xx / cv.w)
                shade = c1 if ((int(xx / r) + row) % 3) else c2
                lay.poly(hexagon(xx, yy, r * 0.9, math.pi / 6), shade)
                xx += r * 3
            yy += row_h / 2
            row += 1
        return lay

    side = Canvas(SW, SH)
    side.paste(fill(side, SW, False), gradient_mask(side, SW * 0.05, SW * 0.9, False, 0.0, 1.0))
    top = Canvas(TW, TH)
    top.paste(fill(top, TH, True), gradient_mask(top, TH * 0.0, TH * 0.55, True, 1.0, 0.0))
    return top, side


# ---- design: flames --------------------------------------------------------------------------
def flames(c_out, c_mid, c_in):
    side = Canvas(SW, SH)
    base = SH * 0.9
    for k, (x0, length, hgt) in enumerate([(0.02, 0.5, 0.78), (0.12, 0.42, 0.6), (0.3, 0.36, 0.55), (0.46, 0.33, 0.5), (0.6, 0.28, 0.44)]):
        for layer, (col, shrink) in enumerate([(c_out, 1.0), (c_mid, 0.72), (c_in, 0.42)]):
            x = SW * x0
            L, Hh = SW * length * shrink, SH * hgt * shrink
            y0 = base - (1 - shrink) * 8
            # a flame lick: sweeps back along the body then flicks up to a point
            pts = [(x + L, y0), (x + L * 0.65, y0 - Hh * 0.15), (x + L * 0.3, y0 - Hh * 0.55), (x, y0 - Hh)]
            pts += [(x + L * 0.1, y0 - Hh * 0.45), (x + L * 0.38, y0 - Hh * 0.25), (x + L * 0.55, y0 - Hh * 0.05)]
            lay = side.layer()
            lay.poly([(x + L, y0)] + pts[1:] + [(x + L * 0.9, y0 + 6)], col)
            side.paste(lay)
    top = Canvas(TW, TH)
    cx = TW / 2
    for sgn in (-1, 1):
        for k, (dx, ln) in enumerate([(14, 0.3), (60, 0.26), (110, 0.2), (160, 0.14)]):
            for col, shrink in [(c_out, 1), (c_mid, 0.7), (c_in, 0.4)]:
                x = cx + sgn * dx
                y = TH * 0.01
                lng = TH * ln * shrink
                w = 38 * shrink
                top.poly([(x, y), (x + sgn * w, y + lng * 0.35), (x + sgn * w * 0.2, y + lng * 0.6), (x + sgn * w * 0.9, y + lng), (x - sgn * w * 0.2, y + lng * 0.45), (x - sgn * w * 0.5, y + lng * 0.2)], col)
    return top, side


# ---- design: camo / mud / checker / tribal / pixel -------------------------------------------
def camo(cols, seed):
    rnd = random.Random(seed)

    def fill(cv, n):
        lay = cv.layer()
        for _ in range(n):
            col = cols[rnd.randrange(len(cols))]
            cx, cy = rnd.random() * cv.w, rnd.random() * cv.h
            rx, ry = rnd.uniform(0.03, 0.09) * cv.w, rnd.uniform(0.1, 0.35) * cv.h
            rot = rnd.uniform(-0.6, 0.6)
            pts = []
            for k in range(14):
                a = k / 14 * math.tau
                rr = 1 + rnd.uniform(-0.28, 0.28)
                px, py = rx * math.cos(a) * rr, ry * math.sin(a) * rr
                pts.append((cx + px * math.cos(rot) - py * math.sin(rot), cy + px * math.sin(rot) + py * math.cos(rot)))
            lay.poly(pts, col)
        return lay

    side = Canvas(SW, SH)
    side.paste(fill(side, 70), gradient_mask(side, SH * 0.0, SH * 0.55, True, 0.2, 1.0))
    top = Canvas(TW, TH)
    top.paste(fill(top, 55))
    return top, side


def mud(dark, light, number):
    rnd = random.Random(4)
    side = Canvas(SW, SH)
    lay = side.layer()
    for _ in range(420):
        x = rnd.random() * SW
        y = SH * (1 - rnd.random() ** 2.4)  # concentrated low on the body
        r = rnd.uniform(2, 15) * (1 + (y / SH) * 1.4)
        lay.ellipse(x - r, y - r, x + r, y + r, dark if rnd.random() > 0.35 else light)
    for _ in range(28):
        x = rnd.random() * SW
        w = rnd.uniform(10, 34)
        lay.poly([(x, SH * 0.55), (x + w, SH * 0.55), (x + w * 0.5, SH * (0.7 + rnd.random() * 0.3))], dark)
    side.paste(lay, gradient_mask(side, SH * 0.3, SH * 0.95, True, 0.0, 1.0))

    def deco(cv, m):
        roundel(cv, SW * 0.5, SH * 0.42, 86, number, WHITE, (220, 100, 25, 255), BLACK)
        sticker(cv, SW * (0.12 if m else 0.88), SH * 0.36, "BACKROAD", 34, (14, 15, 20, 235), WHITE)

    top = Canvas(TW, TH)
    lay = top.layer()
    for _ in range(260):
        x, y = rnd.random() * TW, TH * (rnd.random() ** 1.8)
        r = rnd.uniform(2, 11)
        lay.ellipse(x - r, y - r, x + r, y + r, dark if rnd.random() > 0.35 else light)
    top.paste(lay, gradient_mask(top, 0, TH * 0.5, True, 1.0, 0.0))
    return top, side, deco


def checker(c1, c2):
    side = Canvas(SW, SH)
    lay = side.layer()
    n = 14
    for i in range(48):
        for j in range(n):
            if (i + j) % 2 == 0:
                s = SH / n
                lay.rect(i * s, j * s, (i + 1) * s, (j + 1) * s, c1 if j % 4 else c2)
    side.paste(lay, gradient_mask(side, SW * 0.05, SW * 0.7, False, 0.0, 1.0))
    top = Canvas(TW, TH)
    lay = top.layer()
    s = 48
    for i in range(int(TW / s) + 1):
        for j in range(int(TH / s) + 1):
            if (i + j) % 2 == 0:
                lay.rect(i * s, j * s, (i + 1) * s, (j + 1) * s, c1 if i % 3 else c2)
    top.paste(lay, gradient_mask(top, TH * 0.0, TH * 0.4, True, 1.0, 0.0))
    return top, side


def pixels(c1, c2):
    rnd = random.Random(9)
    side = Canvas(SW, SH)
    lay = side.layer()
    s = 26
    for i in range(int(SW / s)):
        p = 1 - i / (SW / s) * 0.95  # dissolves from the rear (left) toward the front
        for j in range(int(SH / s)):
            if rnd.random() < p ** 1.4 * 0.8:
                lay.rect(i * s, j * s, i * s + s - 3, j * s + s - 3, c1 if rnd.random() > 0.3 else c2)
    side.paste(lay)
    top = Canvas(TW, TH)
    lay = top.layer()
    s = 30
    for j in range(int(TH / s)):
        p = 1 - j / (TH / s) * 0.95
        for i in range(int(TW / s)):
            if rnd.random() < p ** 1.4 * 0.7:
                lay.rect(i * s, j * s, i * s + s - 3, j * s + s - 3, c1 if rnd.random() > 0.3 else c2)
    top.paste(lay)
    return top, side


def tribal(c1, c2):
    side = Canvas(SW, SH)
    for layer_off, col in [(10, c2), (0, c1)]:
        pts = [(SW * 0.03, SH * 0.98)]
        n = 17
        for i in range(n):
            x0 = SW * (0.03 + 0.95 * i / n)
            h = SH * (0.45 + 0.35 * ((i * 5) % 7) / 6)
            pts += [(x0 + SW * 0.02, SH * 0.98 - h), (x0 + SW * 0.0475, SH * 0.98 - h * 0.35)]
        pts += [(SW * 0.98, SH * 0.98)]
        side.poly([(x + layer_off, y + layer_off * 0.4) for x, y in pts], col)
    top = Canvas(TW, TH)
    cx = TW / 2
    for layer_off, col in [(8, c2), (0, c1)]:
        for sgn in (-1, 1):
            pts = [(cx + sgn * 20, TH * 0.02)]
            for i in range(8):
                y = TH * (0.02 + 0.12 * i)
                pts += [(cx + sgn * (150 + 18 * (i % 3)), y + TH * 0.05), (cx + sgn * 40, y + TH * 0.1)]
            top.poly([(x + sgn * layer_off, y + layer_off) for x, y in pts], col)
    return top, side


def number_stripe(c1, c2, number):
    """Heritage twin stripe with a number roundel on each door."""
    top, side = stripes([c1, c2, c1])

    def deco(cv, m):
        roundel(cv, SW * 0.5, SH * 0.5, 100, number, WHITE, BLACK, WHITE)

    return top, side, deco


# ---- F1 car (top only, narrow so it stays on the nose and engine cover, off the tyres) -------
def f1_flames(c_out, c_mid, c_in):
    top = Canvas(TW, TH)
    cx = TW / 2
    for k, (dx, y0, ln) in enumerate([(0, 0.0, 0.42), (46, 0.05, 0.34), (-46, 0.05, 0.34), (86, 0.14, 0.24), (-86, 0.14, 0.24)]):
        for col, shrink in [(c_out, 1), (c_mid, 0.7), (c_in, 0.42)]:
            x, y = cx + dx, TH * y0
            lng, w = TH * ln * shrink, 38 * shrink
            top.poly([(x, y), (x + w, y + lng * 0.3), (x + w * 0.3, y + lng * 0.55), (x + w * 0.8, y + lng), (x - w * 0.3, y + lng * 0.5), (x - w, y + lng * 0.28)], col)
    return top, None


def f1_circuit(c1, c2):
    top = Canvas(TW, TH)
    cx = TW / 2
    rnd = random.Random(2)
    for lane in (-70, -30, 30, 70):
        y, x = 0, cx + lane
        pts = [(x, y)]
        while y < TH * 0.98:
            y += rnd.uniform(90, 200)
            pts.append((x, y))
            nx = x + rnd.choice([-1, 1]) * rnd.uniform(14, 30)
            nx = max(cx - 110, min(cx + 110, nx))
            y += 16
            pts.append((nx, y))
            x = nx
        top.line(pts, c1 if lane in (-30, 30) else c2, 9)
        for px, py in pts[::2]:
            top.ellipse(px - 9, py - 9, px + 9, py + 9, c2)
    return top, None


def f1_delta(c1, c2):
    top = Canvas(TW, TH)
    cx = TW / 2
    for i in range(10):
        y = TH * (0.03 + 0.09 * i)
        w = 150 - i * 4
        top.poly([(cx, y), (cx + w, y + 120), (cx + w, y + 160), (cx, y + 40), (cx - w, y + 160), (cx - w, y + 120)], c1 if i % 2 == 0 else c2)
    return top, None


def f1_number(c1, c2, number):
    top = Canvas(TW, TH)
    cx = TW / 2
    top.rect(cx - 12, 0, cx + 12, TH, c1)
    top.rect(cx - 46, 0, cx - 30, TH, c2)
    top.rect(cx + 30, 0, cx + 46, TH, c2)
    roundel(top, cx, TH * 0.42, 110, number, c2, BLACK, WHITE)
    return top, None


# ---- the lineup -------------------------------------------------------------------------------
DESIGNS = {
    "sedan": [
        ("street_claw", lambda: claws(WHITE, RED, BLUE, NAVY)),
        ("tri_stripe", lambda: stripes([LIGHT_BLUE, BLUE, RED])),
        ("carbon_sport", lambda: carbon(RED)),
        ("speed_chevron", lambda: chevrons((240, 190, 40, 255), BLACK)),
    ],
    "sports_sedan": [
        ("voltage", lambda: lightning((60, 225, 255, 255), (255, 214, 40, 255))),
        ("heritage_stripe", lambda: number_stripe((226, 38, 48, 255), WHITE, 1)),
        ("hex_pulse", lambda: hex_fade((30, 200, 190, 255), WHITE)),
        ("amber_claw", lambda: claws((255, 140, 20, 255), BLACK, WHITE, (40, 20, 5, 255), tag="E-GT")),
    ],
    "suv": [
        ("mud_splash", lambda: mud((88, 60, 38, 255), (140, 104, 66, 255), 7)),
        ("expedition", lambda: stripes([(222, 156, 40, 255), BLACK, (222, 156, 40, 255)])),
        ("safari_camo", lambda: camo([(86, 98, 58, 255), (150, 132, 92, 255), (52, 58, 40, 255)], 6)),
        ("tribal_ridge", lambda: tribal(BLACK, (222, 156, 40, 255))),
    ],
    "hatchback": [
        ("rally_chevron", lambda: chevrons(WHITE, (40, 215, 215, 255), number=45, num_ring=WHITE, num_bg=BLACK, num_fg=WHITE)),
        ("pixel_fade", lambda: pixels((40, 215, 215, 255), (255, 60, 150, 255))),
        ("cyan_claw", lambda: claws((40, 215, 215, 255), WHITE, (255, 60, 150, 255), (8, 40, 60, 255), tag="HOT HATCH")),
        ("checker_run", lambda: checker(WHITE, (255, 60, 150, 255))),
    ],
    "racer": [
        ("plasma_flames", lambda: f1_flames((120, 40, 220, 255), (255, 70, 180, 255), (255, 230, 250, 255))),
        ("circuit_lines", lambda: f1_circuit((60, 225, 255, 255), WHITE)),
        ("delta_chevron", lambda: f1_delta((255, 140, 20, 255), WHITE)),
        ("number_one", lambda: f1_number(WHITE, RED, 1)),
    ],
}


def main():
    for car, designs in DESIGNS.items():
        for slug, build in designs:
            top, side, *rest = build()
            deco = rest[0] if rest else None
            top.save(os.path.join(OUT, car, f"{slug}_top.png"))
            if side is not None:
                # Two flank images: the car faces the right of the image on one side and the left on the
                # other, so the second is the first mirrored (text and numbers are drawn after mirroring
                # so they still read the right way round).
                for name, mirrored in (("side", False), ("side_flip", True)):
                    flank = Canvas(SW, SH)
                    flank.img = ImageOps.mirror(side.img) if mirrored else side.img.copy()
                    flank.d = ImageDraw.Draw(flank.img)
                    if deco:
                        deco(flank, mirrored)
                    flank.save(os.path.join(OUT, car, f"{slug}_{name}.png"))
            print("wrote", car, slug, "(top only)" if side is None else "")


if __name__ == "__main__":
    main()
