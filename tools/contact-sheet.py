# Before/after contact sheet: python tools/contact-sheet.py out.jpg "title" before_dir after_dir name1 name2 ...
# Each row: the same shot before (left) and after (right), labelled.
import sys
from PIL import Image, ImageDraw, ImageFont
out, title, bdir, adir, names = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:]
W = 800
rows = []
for n in names:
    a = Image.open(f"{bdir}/{n}.png").convert("RGB"); b = Image.open(f"{adir}/{n}.png").convert("RGB")
    h = int(a.height * W / a.width)
    rows.append((n, a.resize((W, h), Image.LANCZOS), b.resize((W, h), Image.LANCZOS)))
try:
    font = ImageFont.truetype("arialbd.ttf", 22); small = ImageFont.truetype("arial.ttf", 18)
except OSError:
    font = small = ImageFont.load_default()
H = 50 + sum(r[1].height + 34 for r in rows)
sheet = Image.new("RGB", (W * 2 + 30, H), (24, 25, 27))
d = ImageDraw.Draw(sheet)
d.text((10, 12), title, fill=(240, 236, 226), font=font)
y = 50
for n, a, b in rows:
    d.text((10, y + 4), f"{n}  -  before", fill=(200, 196, 186), font=small)
    d.text((W + 20, y + 4), f"{n}  -  after", fill=(200, 196, 186), font=small)
    sheet.paste(a, (10, y + 28)); sheet.paste(b, (W + 20, y + 28))
    y += a.height + 34
sheet.save(out, quality=88)
print(out, sheet.size)
