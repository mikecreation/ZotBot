from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import subprocess, textwrap

ROOT = Path(__file__).resolve().parent
SLIDES = ROOT / "_slides"
SLIDES.mkdir(exist_ok=True)
W, H = 1280, 720

font_candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
]
reg_candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
]
bold = next(p for p in font_candidates if Path(p).exists())
reg = next(p for p in reg_candidates if Path(p).exists())
F_TITLE = ImageFont.truetype(bold, 54)
F_BODY = ImageFont.truetype(reg, 34)
F_SMALL = ImageFont.truetype(reg, 26)

slides = [
    ("The Not-So-Hard Problem\nof Consciousness", "What if the hard problem begins with a definition error?", 6),
    ("One word. Many variables.", "Biological continuity  •  Wakefulness  •  Responsiveness\nMemory  •  Report  •  Intelligence  •  Subjective experience", 6),
    ("Anesthesia exposes the split.", "The biological individual can continue while:\nR = 0    and    E = 1, 0, or unknown", 6),
    ("Hard question ≠ same target", "‘Why did a dream occur?’ is a question about experience E.\n‘Did the biological individual continue?’ is a question about L_B.", 7),
    ("SCTC fixes the system-level target", "C_B(t) ≡ L_B(t)\n\nFaculties and experiences get their own coordinates.", 7),
    ("The theory can lose.", "Compare C := E against C := Γ.\nSearch for an independent system-level variable SCTC cannot absorb.", 7),
    ("Define the object before\nexplaining the mechanism.", "Paper + LaTeX + experiments + falsifiers\nGitHub research repository", 6),
]

for i, (title, body, _) in enumerate(slides, 1):
    im = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(im)
    d.rectangle([80, 72, W-80, 76], fill="black")
    y = 130
    for line in title.split("\n"):
        box = d.textbbox((0, 0), line, font=F_TITLE)
        d.text(((W-(box[2]-box[0]))//2, y), line, font=F_TITLE, fill="black")
        y += 66
    y += 28
    for para in body.split("\n"):
        lines = textwrap.wrap(para, width=52) if len(para) > 60 else [para]
        for line in lines:
            box = d.textbbox((0, 0), line, font=F_BODY)
            d.text(((W-(box[2]-box[0]))//2, y), line, font=F_BODY, fill="black")
            y += 48
        y += 12
    d.text((80, H-78), "Systemic Continuity Theory of Consciousness (SCTC)", font=F_SMALL, fill="black")
    im.save(SLIDES / f"slide-{i:02d}.png")

concat = []
for i, (_, _, duration) in enumerate(slides, 1):
    concat += [f"file 'slide-{i:02d}.png'", f"duration {duration}"]
concat.append(f"file 'slide-{len(slides):02d}.png'")
(SLIDES / "concat.txt").write_text("\n".join(concat) + "\n")

subprocess.run([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "concat.txt",
    "-vf", "fps=24,format=yuv420p", "-c:v", "libx264", "-preset", "medium",
    "-b:v", "500k", "-movflags", "+faststart", "../SCTC-explainer.mp4"
], cwd=SLIDES, check=True)
