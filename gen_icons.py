from PIL import Image, ImageDraw
import math

BLUE = (0, 122, 255, 255)
WHITE = (255, 255, 255, 255)

def rounded_square(size, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BLUE)

    # checkmark, proportioned to canvas
    sw = max(2, round(size * 0.09))
    p1 = (size * 0.27, size * 0.53)
    p2 = (size * 0.44, size * 0.70)
    p3 = (size * 0.76, size * 0.32)

    def thick_line(a, b, width):
        draw.line([a, b], fill=WHITE, width=width, joint="curve")
        r = width / 2
        draw.ellipse([a[0]-r, a[1]-r, a[0]+r, a[1]+r], fill=WHITE)
        draw.ellipse([b[0]-r, b[1]-r, b[0]+r, b[1]+r], fill=WHITE)

    thick_line(p1, p2, sw)
    thick_line(p2, p3, sw)
    return img

for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png"), (32, "favicon.png")]:
    img = rounded_square(size)
    img.save(f"/home/claude/ledger-pwa/public/{name}")
    print("wrote", name, img.size)

# maskable icon: same design but with extra safe-zone padding (icon content within ~80% center)
def maskable(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, size, size], fill=BLUE)
    inner = rounded_square(int(size * 0.6), radius_ratio=0.0)
    # just draw checkmark directly, scaled to inner safe zone, no rounded bg (already full-bleed blue)
    sw = max(2, round(size * 0.07))
    cx, cy = size / 2, size / 2
    scale = size * 0.34
    p1 = (cx - scale * 0.6, cy + scale * 0.05)
    p2 = (cx - scale * 0.15, cy + scale * 0.45)
    p3 = (cx + scale * 0.65, cy - scale * 0.35)

    def thick_line(a, b, width):
        draw.line([a, b], fill=WHITE, width=width, joint="curve")
        r = width / 2
        draw.ellipse([a[0]-r, a[1]-r, a[0]+r, a[1]+r], fill=WHITE)
        draw.ellipse([b[0]-r, b[1]-r, b[0]+r, b[1]+r], fill=WHITE)

    thick_line(p1, p2, sw)
    thick_line(p2, p3, sw)
    return img

m = maskable(512)
m.save("/home/claude/ledger-pwa/public/maskable-icon-512.png")
print("wrote maskable-icon-512.png", m.size)
