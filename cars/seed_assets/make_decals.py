"""Generates the livery decal artwork in cars/seed_assets/textures/decals/nfs/.

Run from the project folder (needs Pillow, already in requirements.txt):

    .venv\\Scripts\\python cars\\seed_assets\\make_decals.py

The five designs are redrawn (as vector-style art, not copied pixels) from the reference liveries
the project owner supplied: a blue-and-silver "Most Wanted" M3 livery, a green-and-white M2 race
livery, a white/blue/yellow "28" hatchback livery, a red/grey/blue Porsche livery and a flame
livery on a dark body with a white skirt. Every design is a set of transparent PNGs:

  <slug>_top.png        projected straight down onto the hood, roof and boot (front of the car at the TOP)
  <slug>_side.png       the flank where the car faces the RIGHT of the image
  <slug>_side_flip.png  the same design mirrored, for the flank where the car faces the LEFT

Text and numbers are drawn after mirroring, so they read the right way round on both flanks. The
images are stretched over the car's body when projected, so only proportions matter: top images are
tall and narrow (about 0.41:1), side images a long band (5:1). The same artwork is used on every
car; the Future Racer only gets the top images (its flanks are open wheels and tyres).
"""
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

SS = 3  # supersampling factor: drawn big, shrunk for clean anti-aliased edges
TW, TH = 576, 1408  # top image
SW, SH = 2048, 410  # side image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures", "decals", "nfs")
FONTS = r"C:\Windows\Fonts"


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

    def rrect(self, x0, y0, x1, y1, r, fill, outline=None, width=0):
        self.d.rounded_rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], radius=r * SS, fill=fill, outline=outline, width=int(width * SS))

    def line(self, points, fill, width):
        self.d.line(self.pts(points), fill=fill, width=int(width * SS), joint="curve")

    def layer(self):
        c = Canvas.__new__(Canvas)
        c.w, c.h = self.w, self.h
        c.img = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        c.d = ImageDraw.Draw(c.img)
        return c

    def paste(self, other, mask=None):
        if mask is not None:
            other.img.putalpha(ImageChops.multiply(other.img.getchannel("A"), mask))
        self.img = Image.alpha_composite(self.img, other.img)
        self.d = ImageDraw.Draw(self.img)

    def save(self, path):
        out = self.img.resize((self.w, self.h), Image.LANCZOS)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        out.save(path, optimize=True)


def font(size, kind="impact"):
    names = {"impact": ["impact.ttf", "arialbd.ttf"], "cjk": ["msyhbd.ttc", "msyh.ttc", "YuGothB.ttc", "msgothic.ttc"], "bold": ["arialbd.ttf"]}[kind]
    for name in names:
        try:
            return ImageFont.truetype(os.path.join(FONTS, name), int(size * SS))
        except OSError:
            continue
    return ImageFont.load_default()


def text_center(c, cx, cy, s, size, fill, kind="impact", stroke=None, stroke_w=0):
    f = font(size, kind)
    box = c.d.textbbox((0, 0), s, font=f)
    x = cx * SS - (box[2] + box[0]) / 2
    y = cy * SS - (box[3] + box[1]) / 2
    if stroke:
        c.d.text((x, y), s, font=f, fill=fill, stroke_width=int(stroke_w * SS), stroke_fill=stroke)
    else:
        c.d.text((x, y), s, font=f, fill=fill)


def polygon_mask(c, points):
    m = Image.new("L", c.img.size, 0)
    ImageDraw.Draw(m).polygon([(x * SS, y * SS) for x, y in points], fill=255)
    return m


def blade(c, p0, p1, p2, w0, fill, power=0.85, steps=56):
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
        w = w0 * (1 - t) ** power * (0.6 + 0.4 * min(1, t * 6))
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    c.poly(left + right[::-1], fill)


def edged_blade(c, p0, p1, p2, w0, fill, edge, ew=7, power=0.85):
    blade(c, p0, p1, p2, w0 + ew, edge, power)
    blade(c, p0, p1, p2, w0, fill, power)


def bez(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c_, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        out.append((a * p0[0] + b * p1[0] + c_ * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c_ * p2[1] + d * p3[1]))
    return out


def band(c, upper, lower, fill, edge=None, ew=6):
    """Fill the region between two curves (lists of points running the same direction)."""
    pts = upper + lower[::-1]
    if edge:
        c.line(pts + [pts[0]], edge, ew * 2)
    c.poly(pts, fill)


def speed_lines(c, region, angle_deg, spacing, width, fill, fade_to=None):
    """Parallel hatch lines clipped to a region (a polygon), optionally fading across it."""
    lay = c.layer()
    a = math.radians(angle_deg)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    xs = [p[0] for p in region]
    ys = [p[1] for p in region]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    reach = math.hypot(max(xs) - min(xs), max(ys) - min(ys))
    k = -reach
    while k < reach:
        lay.line([(cx + nx * k - dx * reach, cy + ny * k - dy * reach), (cx + nx * k + dx * reach, cy + ny * k + dy * reach)], fill, width)
        k += spacing
    c.paste(lay, polygon_mask(c, region))


def sticker(c, cx, cy, s, size, bg, fg, kind="bold", pad=(16, 8)):
    f = font(size, kind)
    box = c.d.textbbox((0, 0), s, font=f)
    w, h = (box[2] - box[0]) / SS + pad[0] * 2, (box[3] - box[1]) / SS + pad[1] * 2
    c.rrect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, 8, bg)
    text_center(c, cx, cy - 1, s, size, fg, kind)


WHITE = (246, 247, 250, 255)
SILVER = (214, 220, 230, 255)
BLACK = (14, 15, 20, 255)
NAVY = (12, 26, 92, 255)
BLUE = (30, 70, 190, 255)
SKY = (120, 170, 240, 255)
RED = (222, 36, 40, 255)
CYAN = (40, 200, 235, 255)
YELLOW = (255, 196, 14, 255)
LIME = (122, 224, 40, 255)
MINT = (60, 222, 170, 255)
DGREEN = (14, 96, 50, 255)
ORANGE = (255, 138, 20, 255)
GREY = (150, 156, 166, 255)


def mirror_x(x, m):
    return SW - x if m else x


# ---- 1. Most Wanted: blue & silver sweeping bands -----------------------------------------------
def most_wanted():
    side = Canvas(SW, SH)
    # navy rocker line with a white pinstripe
    side.rect(SW * 0.06, SH * 0.93, SW * 0.94, SH * 0.985, NAVY)
    side.rect(SW * 0.06, SH * 0.905, SW * 0.94, SH * 0.917, WHITE)
    # the big silver bands rising from the sill toward the front, outlined in navy so they read on any paint
    edged_blade(side, (SW * 0.16, SH * 1.03), (SW * 0.44, SH * 0.82), (SW * 0.74, SH * 0.02), 92, SILVER, NAVY, 9)
    edged_blade(side, (SW * 0.31, SH * 1.03), (SW * 0.56, SH * 0.93), (SW * 0.80, SH * 0.30), 52, WHITE, NAVY, 8)
    edged_blade(side, (SW * 0.60, SH * 1.03), (SW * 0.78, SH * 0.92), (SW * 0.94, SH * 0.40), 44, SILVER, NAVY, 8)
    blade(side, (SW * 0.18, SH * 1.0), (SW * 0.46, SH * 0.84), (SW * 0.71, SH * 0.10), 22, SKY)  # light-blue core

    def deco(cv, m):
        sticker(cv, SW * (0.12 if not m else 0.88), SH * 0.58, "M3 GTR", 34, NAVY, WHITE, "impact")

    top = Canvas(TW, TH)
    cx = TW / 2
    for sgn in (-1, 1):  # hood: two silver swooshes fanning out from the windscreen, navy centre stripe
        edged_blade(top, (cx + sgn * 20, TH * 0.31), (cx + sgn * 150, TH * 0.17), (cx + sgn * 235, TH * 0.01), 52, SILVER, NAVY, 7)
        edged_blade(top, (cx + sgn * 60, TH * 0.30), (cx + sgn * 160, TH * 0.22), (cx + sgn * 250, TH * 0.10), 24, WHITE, NAVY, 5)
    top.rect(cx - 26, 0, cx + 26, TH * 0.30, NAVY)
    top.rect(cx - 6, 0, cx + 6, TH * 0.30, SILVER)
    top.rect(cx - 46, TH * 0.4, cx + 46, TH * 0.64, SILVER)  # roof stripe
    top.rect(cx - 18, TH * 0.4, cx + 18, TH * 0.64, NAVY)
    for sgn in (-1, 1):  # boot
        edged_blade(top, (cx + sgn * 40, TH * 0.995), (cx + sgn * 120, TH * 0.9), (cx + sgn * 200, TH * 0.76), 38, SILVER, NAVY, 6)
    return top, side, deco


# ---- 2. Green & white race livery with a number plate -------------------------------------------
def logy_green():
    side = Canvas(SW, SH)
    # lime sill band
    side.rect(SW * 0.06, SH * 0.86, SW * 0.94, SH * 1.0, LIME)
    side.rect(SW * 0.06, SH * 0.835, SW * 0.94, SH * 0.85, WHITE)
    # big lime swoosh with a mint core, rising toward the front
    edged_blade(side, (SW * 0.10, SH * 1.02), (SW * 0.46, SH * 0.92), (SW * 0.90, SH * 0.14), 120, LIME, WHITE, 8, power=0.7)
    blade(side, (SW * 0.14, SH * 1.0), (SW * 0.5, SH * 0.88), (SW * 0.86, SH * 0.24), 54, MINT, power=0.7)
    # speed hatching over the door
    region = [(SW * 0.26, SH * 0.96), (SW * 0.66, SH * 0.96), (SW * 0.66, SH * 0.1), (SW * 0.34, SH * 0.1)]
    speed_lines(side, region, -62, 15, 3.5, (255, 255, 255, 200))
    # white number plate on the door
    side.rrect(SW * 0.405, SH * 0.2, SW * 0.5, SH * 0.8, 20, WHITE, DGREEN, 7)

    def deco(cv, m):
        text_center(cv, mirror_x(SW * 0.4525, m), SH * 0.5, "26", 190, DGREEN, "impact")
        sticker(cv, SW * (0.2 if not m else 0.8), SH * 0.93, "TURBO TUNES RACING", 40, DGREEN, WHITE)
        sticker(cv, SW * (0.82 if not m else 0.18), SH * 0.93, "BOOST", 40, WHITE, DGREEN)

    top = Canvas(TW, TH)
    cx = TW / 2
    top.rrect(cx - 190, 0, cx + 190, TH * 0.30, 40, LIME)  # hood panel
    for k, off in enumerate((-110, -60, 60, 110)):
        top.rect(cx + off - 7, 0, cx + off + 7, TH * 0.3, WHITE)
    top.rect(cx - 14, 0, cx + 14, TH * 0.3, MINT)
    top.rect(cx - 58, TH * 0.4, cx + 58, TH * 0.64, LIME)  # roof
    top.rect(cx - 20, TH * 0.4, cx + 20, TH * 0.64, WHITE)
    for sgn in (-1, 1):
        edged_blade(top, (cx + sgn * 30, TH * 0.995), (cx + sgn * 150, TH * 0.92), (cx + sgn * 230, TH * 0.78), 46, LIME, WHITE, 6)
    return top, side, deco


# ---- 3. White/blue/yellow "28" hatchback livery -------------------------------------------------
def gti_28():
    side = Canvas(SW, SH)
    # blue wedge along the sill, rising at the rear, with a yellow edge line
    upper = bez((SW * 0.05, SH * 0.86), (SW * 0.25, SH * 0.78), (SW * 0.7, SH * 0.9), (SW * 0.95, SH * 0.8))
    lower = [(x, SH * 1.0) for x, _ in upper]
    band(side, upper, lower, BLUE)
    side.line([(x, y - 14) for x, y in upper], YELLOW, 9)
    # front fender swooshes: yellow and blue
    edged_blade(side, (SW * 0.66, SH * 1.02), (SW * 0.79, SH * 0.78), (SW * 0.93, SH * 0.1), 58, YELLOW, WHITE, 6)
    edged_blade(side, (SW * 0.74, SH * 1.02), (SW * 0.84, SH * 0.84), (SW * 0.96, SH * 0.36), 34, BLUE, WHITE, 6)
    # rear quarter wedge
    edged_blade(side, (SW * 0.06, SH * 0.82), (SW * 0.14, SH * 0.5), (SW * 0.2, SH * 0.08), 34, BLUE, WHITE, 6)
    # door shield: white with a navy border and yellow wedges either side
    for sgn in (-1, 1):
        cxs = SW * 0.495 + sgn * SW * 0.062
        side.poly([(cxs - sgn * 40, SH * 0.2), (cxs + sgn * 40, SH * 0.14), (cxs + sgn * 40, SH * 0.82), (cxs - sgn * 40, SH * 0.76)], YELLOW)
    side.rrect(SW * 0.42, SH * 0.12, SW * 0.57, SH * 0.88, 30, WHITE, NAVY, 8)

    def deco(cv, m):
        text_center(cv, mirror_x(SW * 0.495, m), SH * 0.34, "28", 190, NAVY, "impact")
        text_center(cv, mirror_x(SW * 0.495, m), SH * 0.68, "極速", 120, RED, "cjk")
        sticker(cv, SW * (0.2 if not m else 0.8), SH * 0.93, "TURBO TUNES", 38, WHITE, BLUE)

    top = Canvas(TW, TH)
    cx = TW / 2
    for sgn in (-1, 1):  # hood: yellow and blue swooshes
        edged_blade(top, (cx + sgn * 30, TH * 0.31), (cx + sgn * 140, TH * 0.18), (cx + sgn * 230, TH * 0.02), 60, YELLOW, WHITE, 6)
        edged_blade(top, (cx + sgn * 90, TH * 0.3), (cx + sgn * 190, TH * 0.22), (cx + sgn * 262, TH * 0.12), 34, BLUE, WHITE, 5)
    top.rect(cx - 36, TH * 0.4, cx + 36, TH * 0.64, BLUE)
    top.rect(cx - 12, TH * 0.4, cx + 12, TH * 0.64, YELLOW)
    for sgn in (-1, 1):
        edged_blade(top, (cx + sgn * 30, TH * 0.995), (cx + sgn * 140, TH * 0.92), (cx + sgn * 220, TH * 0.78), 40, YELLOW, WHITE, 6)
    return top, side, deco


# ---- 4. Red, grey & blue flowing race livery ----------------------------------------------------
def heat_rsr():
    side = Canvas(SW, SH)
    # red lower sill stripe with a cyan line
    side.rect(SW * 0.06, SH * 0.9, SW * 0.94, SH * 0.985, RED)
    side.rect(SW * 0.06, SH * 0.875, SW * 0.94, SH * 0.89, CYAN)
    # the main red flow along the beltline, outlined in blue, finishing in a point over the front wheel
    edged_blade(side, (SW * 0.07, SH * 0.96), (SW * 0.42, SH * 0.5), (SW * 0.93, SH * 0.5), 112, RED, BLUE, 12, power=0.65)
    edged_blade(side, (SW * 0.12, SH * 1.02), (SW * 0.56, SH * 0.92), (SW * 0.96, SH * 0.8), 56, RED, BLUE, 9, power=0.7)
    blade(side, (SW * 0.1, SH * 0.95), (SW * 0.44, SH * 0.52), (SW * 0.9, SH * 0.5), 26, CYAN, power=0.65)
    # rear-quarter blue tick marks
    for k in range(4):
        x = SW * (0.05 + 0.018 * k)
        side.poly([(x, SH * 0.2), (x + 22, SH * 0.2), (x + 4, SH * 0.6), (x - 18, SH * 0.6)], BLUE if k % 2 == 0 else CYAN)

    def deco(cv, m):
        cv.rrect(SW * 0.43, SH * 0.2, SW * 0.55, SH * 0.58, 16, WHITE, BLUE, 6)
        text_center(cv, SW * 0.49, SH * 0.39, "RSR", 80, RED, "impact")
        sticker(cv, SW * (0.22 if not m else 0.78), SH * 0.935, "TURBO TUNES", 38, WHITE, RED)

    top = Canvas(TW, TH)
    cx = TW / 2
    top.poly([(cx - 70, 0), (cx + 70, 0), (cx + 150, TH * 0.31), (cx - 150, TH * 0.31)], BLUE)  # hood: red panel, blue edge
    top.poly([(cx - 58, 0), (cx + 58, 0), (cx + 130, TH * 0.31), (cx - 130, TH * 0.31)], RED)
    top.poly([(cx - 14, 0), (cx + 14, 0), (cx + 30, TH * 0.31), (cx - 30, TH * 0.31)], CYAN)
    top.rect(cx - 52, TH * 0.4, cx + 52, TH * 0.64, RED)
    top.rect(cx - 52, TH * 0.4, cx - 38, TH * 0.64, BLUE)
    top.rect(cx + 38, TH * 0.4, cx + 52, TH * 0.64, BLUE)
    for sgn in (-1, 1):
        edged_blade(top, (cx + sgn * 30, TH * 0.995), (cx + sgn * 150, TH * 0.92), (cx + sgn * 235, TH * 0.78), 46, RED, BLUE, 7)
    return top, side, deco


# ---- 5. Flames on a white skirt -----------------------------------------------------------------
def flame_cluster(c, base, angle_deg, length, spread_deg, n, width, seed):
    """Tongues of fire fanning out from `base`: red outside, orange, yellow, a white-hot core."""
    rnd = random.Random(seed)
    for layer, (col, shrink, off) in enumerate([(RED, 1.0, 0), ((255, 96, 24, 255), 0.78, 3), (ORANGE, 0.58, 6), (YELLOW, 0.4, 9), ((255, 250, 210, 255), 0.2, 12)]):
        rnd.seed(seed)
        for k in range(n):
            a = math.radians(angle_deg + (k - (n - 1) / 2) * spread_deg / max(1, n - 1) + rnd.uniform(-5, 5))
            ln = length * rnd.uniform(0.7, 1.0) * (1 - 0.18 * abs(k - (n - 1) / 2) / max(1, (n - 1) / 2))
            curl = rnd.uniform(-0.35, 0.35)
            p0 = (base[0] + math.cos(a + math.pi / 2) * off * 0.2, base[1] + math.sin(a + math.pi / 2) * off * 0.2)
            p2 = (base[0] + math.cos(a) * ln * shrink, base[1] + math.sin(a) * ln * shrink)
            mid = ((p0[0] + p2[0]) / 2 - math.sin(a) * ln * curl, (p0[1] + p2[1]) / 2 + math.cos(a) * ln * curl)
            blade(c, p0, mid, p2, width * shrink * (1 - 0.08 * abs(k - (n - 1) / 2)), col, power=0.7)


def flame_run():
    side = Canvas(SW, SH)
    # white skirt that fades up into the body, the wide-body look
    sill = Canvas(SW, SH)
    sill.rect(SW * 0.05, SH * 0.78, SW * 0.95, SH * 1.0, WHITE)
    side.paste(sill, None)
    side.rect(SW * 0.05, SH * 0.755, SW * 0.95, SH * 0.78, (255, 255, 255, 150))
    # the door badge: dark bubble with a cream double outline
    side.rrect(SW * 0.27, SH * 0.07, SW * 0.7, SH * 0.74, 60, (14, 22, 70, 245), (250, 238, 200, 255), 7)
    side.rrect(SW * 0.28, SH * 0.1, SW * 0.69, SH * 0.71, 52, None, (250, 238, 200, 255), 3)
    # big flame inside it: head toward the front, tongues streaming back
    flame_cluster(side, (SW * 0.63, SH * 0.42), 180, SW * 0.3, 40, 5, 40, 3)
    flame_cluster(side, (SW * 0.66, SH * 0.5), 184, SW * 0.19, 22, 3, 34, 8)
    # a small flame lick on the front fender
    flame_cluster(side, (SW * 0.88, SH * 0.6), 186, SW * 0.09, 26, 3, 26, 5)

    def deco(cv, m):
        for k, (label, bg, fg) in enumerate([("TURBO", RED, WHITE), ("TUNES", NAVY, WHITE), ("BOOST", YELLOW, BLACK), ("GRIP", BLUE, WHITE), ("DRIFT", ORANGE, BLACK)]):
            x = SW * (0.14 + 0.15 * k) if not m else SW * (0.86 - 0.15 * k)
            sticker(cv, x, SH * 0.89, label, 34, bg, fg, pad=(14, 7))

    top = Canvas(TW, TH)
    cx = TW / 2
    for sgn in (-1, 1):  # hood: flames licking back from the front corners
        flame_cluster(top, (cx + sgn * 150, TH * 0.015), 90 + sgn * -14, TH * 0.34, 46, 5, 62, 4 + sgn)
    flame_cluster(top, (cx, TH * 0.995), -90, TH * 0.2, 44, 4, 56, 11)  # boot: flames rising off the tail
    return top, side, deco


DESIGNS = [
    ("most_wanted", most_wanted),
    ("logy_green", logy_green),
    ("gti_28", gti_28),
    ("heat_rsr", heat_rsr),
    ("flame_run", flame_run),
]


def main():
    for slug, build in DESIGNS:
        top, side, deco = build()
        top.save(os.path.join(OUT, f"{slug}_top.png"))
        # Two flank images: the car faces the right of the image on one side and the left on the
        # other, so the second is the first mirrored (text drawn after mirroring).
        for name, mirrored in (("side", False), ("side_flip", True)):
            flank = Canvas(SW, SH)
            flank.img = ImageOps.mirror(side.img) if mirrored else side.img.copy()
            flank.d = ImageDraw.Draw(flank.img)
            if deco:
                deco(flank, mirrored)
            flank.save(os.path.join(OUT, f"{slug}_{name}.png"))
        print("wrote", slug)


if __name__ == "__main__":
    main()
