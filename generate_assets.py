import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs("assets", exist_ok=True)

# Load fonts
try:
    font_title = ImageFont.truetype("segoeui.ttf", 26)
    font_heading = ImageFont.truetype("segoeuib.ttf", 16)
    font_sub = ImageFont.truetype("segoeui.ttf", 13)
    font_bold = ImageFont.truetype("segoeuib.ttf", 12)
    font_regular = ImageFont.truetype("segoeui.ttf", 11)
    font_small = ImageFont.truetype("segoeui.ttf", 10)
    font_tiny = ImageFont.truetype("segoeuib.ttf", 9)
except:
    font_title = font_heading = font_sub = font_bold = font_regular = font_small = font_tiny = ImageFont.load_default()

def draw_rounded_rect(draw, *args, **kwargs):
    if len(args) >= 2 and isinstance(args[0], (tuple, list)) and len(args[0]) == 2 and isinstance(args[1], (tuple, list)) and len(args[1]) == 2:
        bbox = (args[0][0], args[0][1], args[1][0], args[1][1])
        radius = kwargs.get('radius', 5)
        fill = kwargs.get('fill', None)
        outline = kwargs.get('outline', None)
        width = kwargs.get('width', 1)
    else:
        bbox = args[0]
        radius = args[1] if len(args) > 1 else kwargs.get('radius', 5)
        fill = kwargs.get('fill', None)
        outline = kwargs.get('outline', None)
        width = kwargs.get('width', 1)
    x0, y0, x1, y1 = bbox
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill, outline=outline, width=width)

# ==========================================
# 1. Generate Banner (assets/banner.png)
# ==========================================
def generate_banner():
    w, h = 900, 260
    img = Image.new("RGBA", (w, h), (18, 22, 34, 255))
    draw = ImageDraw.Draw(img)

    # Background gradient
    for y in range(h):
        r = int(18 + (30 - 18) * (y / h))
        g = int(22 + (45 - 22) * (y / h))
        b = int(34 + (75 - 34) * (y / h))
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))

    # Top accent line (Google colors: Blue, Red, Yellow, Green)
    draw.line([(0, 0), (225, 0)], fill=(66, 133, 244, 255), width=3)
    draw.line([(225, 0), (450, 0)], fill=(234, 67, 53, 255), width=3)
    draw.line([(450, 0), (675, 0)], fill=(251, 188, 5, 255), width=3)
    draw.line([(675, 0), (900, 0)], fill=(52, 168, 83, 255), width=3)

    # Icon circle
    draw.ellipse([45, 45, 115, 115], fill=(26, 115, 232, 255))
    # Draw download arrow inside
    draw.polygon([(80, 60), (80, 85), (70, 85), (80, 100), (90, 85), (80, 85), (80, 60)], fill=(255, 255, 255, 255))
    draw.line([(70, 105), (90, 105)], fill=(255, 255, 255, 255), width=3)

    # Titles
    draw.text((135, 46), "Gmail Bulk Attachment Downloader", fill=(255, 255, 255, 255), font=font_title)
    draw.text((135, 84), "Manifest V3 • Universal File Support • Single .ZIP Bundling • 100% Client-Side", fill=(170, 195, 230, 255), font=font_sub)

    # Features Badges
    badges = [
        ("📦 Single .ZIP Bundling", (41, 123, 255)),
        ("🛡️ Rate-Limit Shield", (30, 142, 62)),
        ("📅 Date Range Filter", (242, 153, 0)),
        ("🔍 Interactive Modal", (142, 36, 170)),
        ("📊 CSV Audit Export", (0, 150, 136)),
        ("🚫 Duplicate Blocker", (217, 48, 37))
    ]

    bx = 45
    by = 145
    for text, col in badges:
        bw = len(text) * 7.5 + 24
        draw_rounded_rect(draw, (bx, by, bx + bw, by + 28), radius=14, fill=(col[0], col[1], col[2], 40), outline=col, width=1)
        draw.text((bx + 12, by + 6), text, fill=(240, 245, 255, 255), font=font_regular)
        bx += bw + 10

    # Bottom safe guarantee bar
    draw_rounded_rect(draw, (45, 195, 855, 235), radius=8, fill=(30, 36, 52, 255), outline=(50, 60, 85, 255))
    draw.text((60, 206), "🔒 100% Secure: Operates strictly within your browser tab. Zero passwords or external servers.", fill=(160, 175, 200, 255), font=font_small)

    img.save("assets/banner.png", "PNG")
    print("Banner created successfully!")

# ==========================================
# 2. Generate Modal Demo Mockup (assets/modal_demo.png)
# ==========================================
def generate_modal_demo():
    w, h = 880, 560
    img = Image.new("RGB", (w, h), (246, 248, 252)) # Gmail surface light grey
    draw = ImageDraw.Draw(img)

    # Top Gmail Header Bar
    draw.rectangle([(0, 0), (w, 54)], fill=(255, 255, 255))
    draw.line([(0, 54), (w, 54)], fill=(225, 228, 232))
    draw.text((20, 16), "Gmail", fill=(217, 48, 37), font=font_heading)

    # Search bar in Gmail header
    draw_rounded_rect(draw, (120, 9), (560, 45), radius=20, fill=(238, 243, 249))
    draw.text((140, 18), "has:attachment from:idlcslcs@idlc.com", fill=(60, 64, 67), font=font_regular)

    # Floating Action Button in Gmail Top-Right
    draw_rounded_rect(draw, (w - 240, 11), (w - 20, 43), radius=16, fill=(232, 240, 254), outline=(168, 199, 250), width=1)
    draw.text((w - 225, 19), "Download Attachments", fill=(26, 115, 232), font=font_bold)
    draw_rounded_rect(draw, (w - 60, 17), (w - 32, 37), radius=10, fill=(26, 115, 232))
    draw.text((w - 53, 20), "15", fill=(255, 255, 255), font=font_bold)

    # Modal backdrop overlay
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 120))
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"))
    draw = ImageDraw.Draw(img)

    # Centered Modal Box
    mx0, my0, mx1, my1 = 150, 45, w - 150, h - 45
    draw_rounded_rect(draw, (mx0, my0, mx1, my1), radius=14, fill=(255, 255, 255), outline=(218, 220, 224))

    # Modal Header
    draw.rectangle([(mx0, my0), (mx1, my0 + 44)], fill=(255, 255, 255))
    draw.line([(mx0, my0 + 44), (mx1, my0 + 44)], fill=(241, 243, 244))
    draw.text((mx0 + 18, my0 + 13), "Review & Select Attachments to Download", fill=(32, 33, 36), font=font_heading)
    draw.text((mx1 - 32, my0 + 13), "✕", fill=(95, 99, 104), font=font_bold)

    # Output Format Choice (Individual vs ZIP)
    fy = my0 + 56
    draw_rounded_rect(draw, (mx0 + 18, fy), (mx1 - 18, fy + 32), radius=8, fill=(241, 243, 244))
    draw_rounded_rect(draw, (mx0 + 20, fy + 2), ((mx0 + mx1) // 2 - 4, fy + 30), radius=6, fill=(255, 255, 255))
    draw.text((mx0 + 36, fy + 8), "📁 Individual Files (to Downloads/)", fill=(26, 115, 232), font=font_bold)
    draw.text(((mx0 + mx1) // 2 + 16, fy + 8), "📦 Single .ZIP Archive (Bundles all)", fill=(95, 99, 104), font=font_regular)

    # Summary Box
    sy = fy + 40
    draw_rounded_rect(draw, (mx0 + 18, sy), (mx1 - 18, sy + 58), radius=8, fill=(248, 250, 253), outline=(211, 227, 253))
    # Column 1
    draw.text((mx0 + 30, sy + 10), "Total Files Found", fill=(95, 99, 104), font=font_small)
    draw.text((mx0 + 30, sy + 28), "15 files (12 new, 3 saved)", fill=(32, 33, 36), font=font_bold)
    # Column 2
    draw.text((mx0 + 220, sy + 10), "Save Destination", fill=(95, 99, 104), font=font_small)
    draw.text((mx0 + 220, sy + 28), "Downloads/IDLC_Statements/", fill=(32, 33, 36), font=font_bold)
    # Column 3
    draw.text((mx0 + 420, sy + 10), "Account Protection", fill=(95, 99, 104), font=font_small)
    draw.text((mx0 + 420, sy + 28), "🛡️ Safe Mode (~18s)", fill=(30, 142, 62), font=font_bold)

    # Search & Filter row
    fy2 = sy + 68
    draw_rounded_rect(draw, (mx0 + 18, fy2), (mx0 + 320, fy2 + 28), radius=6, fill=(248, 249, 250), outline=(218, 220, 224))
    draw.text((mx0 + 28, fy2 + 6), "🔍 Search filename, date, sender...", fill=(128, 134, 139), font=font_regular)

    # Filter chips
    cx = mx0 + 330
    for chip, active in [("All (15)", True), ("✨ New (12)", False), ("📄 PDFs", False)]:
        cw = len(chip) * 7 + 16
        col_bg = (26, 115, 232) if active else (241, 243, 244)
        col_txt = (255, 255, 255) if active else (60, 64, 67)
        draw_rounded_rect(draw, (cx, fy2), (cx + cw, fy2 + 26), radius=13, fill=col_bg)
        draw.text((cx + 8, fy2 + 5), chip, fill=col_txt, font=font_small)
        cx += cw + 6

    # Select all bar
    sby = fy2 + 34
    draw_rounded_rect(draw, (mx0 + 18, sby), (mx1 - 18, sby + 26), radius=5, fill=(241, 243, 244))
    draw_rounded_rect(draw, (mx0 + 24, sby + 5), (mx0 + 38, sby + 19), radius=3, fill=(26, 115, 232))
    draw.text((mx0 + 27, sby + 3), "✓", fill=(255, 255, 255), font=font_bold)
    draw.text((mx0 + 45, sby + 6), "Select All Visible (15)", fill=(60, 64, 67), font=font_bold)
    draw.text((mx1 - 170, sby + 6), "Select New Only  |  Deselect All", fill=(26, 115, 232), font=font_small)

    # Preview List Items
    ly = sby + 30
    items = [
        ("2026-10-19_Portfolio_U533.pdf", "IDLC Securities • Daily Portfolio Statement", "Oct 19", True, "New", (230, 244, 234), (19, 115, 51)),
        ("2026-10-18_Portfolio_U533.pdf", "IDLC Securities • Daily Portfolio Statement", "Oct 18", True, "New", (230, 244, 234), (19, 115, 51)),
        ("2026-10-17_Portfolio_U533.pdf", "IDLC Securities • Daily Portfolio Statement", "Oct 17", False, "Saved", (254, 247, 224), (176, 96, 0)),
        ("2026-10-16_Portfolio_U533.pdf", "IDLC Securities • Daily Portfolio Statement", "Oct 16", True, "New", (230, 244, 234), (19, 115, 51)),
    ]

    for fname, sub, dt, sel, badge, bbg, bfg in items:
        row_bg = (237, 242, 252) if sel else (255, 255, 255)
        draw.rectangle([(mx0 + 18, ly), (mx1 - 18, ly + 36)], fill=row_bg)
        draw.line([(mx0 + 18, ly + 36), (mx1 - 18, ly + 36)], fill=(245, 247, 250))

        # Checkbox
        if sel:
            draw_rounded_rect(draw, (mx0 + 26, ly + 10), (mx0 + 40, ly + 24), radius=3, fill=(26, 115, 232))
            draw.text((mx0 + 29, ly + 8), "✓", fill=(255, 255, 255), font=font_bold)
        else:
            draw_rounded_rect(draw, (mx0 + 26, ly + 10), (mx0 + 40, ly + 24), radius=3, outline=(180, 184, 190))

        # Text
        draw.text((mx0 + 50, ly + 5), fname, fill=(32, 33, 36), font=font_bold)
        draw.text((mx0 + 50, ly + 20), "✉️ " + sub, fill=(95, 99, 104), font=font_tiny)

        # Date & Badge
        draw.text((mx1 - 120, ly + 10), dt, fill=(95, 99, 104), font=font_small)
        draw_rounded_rect(draw, (mx1 - 70, ly + 8), (mx1 - 28, ly + 26), radius=4, fill=bbg)
        draw.text((mx1 - 62, ly + 10), badge, fill=bfg, font=font_tiny)

        ly += 37

    # Modal Footer
    fty = my1 - 46
    draw.rectangle([(mx0, fty), (mx1, my1)], fill=(250, 251, 252))
    draw.line([(mx0, fty), (mx1, fty)], fill=(241, 243, 244))
    draw.text((mx0 + 20, fty + 14), "Selected: 12 of 15 files", fill=(95, 99, 104), font=font_bold)

    # Cancel & Download Buttons
    draw_rounded_rect(draw, (mx1 - 240, fty + 8), (mx1 - 170, fty + 38), radius=6, fill=(241, 243, 244), outline=(218, 220, 224))
    draw.text((mx1 - 225, fty + 14), "Cancel", fill=(60, 64, 67), font=font_bold)

    draw_rounded_rect(draw, (mx1 - 160, fty + 8), (mx1 - 18, fty + 38), radius=6, fill=(26, 115, 232))
    draw.text((mx1 - 150, fty + 14), "Start Download (12)", fill=(255, 255, 255), font=font_bold)

    img.save("assets/modal_demo.png", "PNG")
    print("Modal mockup created successfully!")

# ==========================================
# 3. Generate Animated GIF (assets/demo.gif)
# ==========================================
def generate_demo_gif():
    w, h = 760, 440
    frames = []

    # Frame sequence steps:
    # 1: Gmail Search View -> Button idle
    # 2: Hover / Badge activates (15 found)
    # 3: Click -> Modal pops up
    # 4: In modal -> select items / filter
    # 5: Click Start Download
    # 6: Toast appears -> Downloading 1 of 12
    # 7: Safe Cooldown pause 5s
    # 8: Completed Toast -> Export CSV & Open Folder

    for step in range(12):
        img = Image.new("RGB", (w, h), (246, 248, 252))
        draw = ImageDraw.Draw(img)

        # Header
        draw.rectangle([(0, 0), (w, 48)], fill=(255, 255, 255))
        draw.line([(0, 48), (w, 48)], fill=(225, 228, 232))
        draw.text((18, 14), "Gmail", fill=(217, 48, 37), font=font_heading)

        # Search Bar
        draw_rounded_rect(draw, (100, 8), (480, 40), radius=16, fill=(238, 243, 249))
        draw.text((120, 15), "from:idlcslcs@idlc.com has:attachment", fill=(60, 64, 67), font=font_small)

        # Action Button
        btn_active = step >= 1
        btn_bg = (232, 240, 254) if btn_active else (255, 255, 255)
        draw_rounded_rect(draw, (w - 230, 9), (w - 18, 39), radius=15, fill=btn_bg, outline=(168, 199, 250))
        draw.text((w - 215, 16), "Download Attachments", fill=(26, 115, 232), font=font_bold)
        draw_rounded_rect(draw, (w - 55, 14), (w - 28, 34), radius=10, fill=(26, 115, 232))
        draw.text((w - 48, 17), "15", fill=(255, 255, 255), font=font_bold)

        # Background email rows
        for r_i, (dt, subj) in enumerate([("Oct 19", "Daily Portfolio Statement"), ("Oct 18", "Daily Portfolio Statement"), ("Oct 17", "Daily Portfolio Statement"), ("Oct 16", "Daily Portfolio Statement")]):
            ry = 65 + r_i * 38
            draw.rectangle([(20, ry), (w - 20, ry + 32)], fill=(255, 255, 255), outline=(235, 238, 242))
            draw.text((35, ry + 8), "IDLC Securities", fill=(32, 33, 36), font=font_bold)
            draw.text((160, ry + 8), subj, fill=(95, 99, 104), font=font_regular)
            draw_rounded_rect(draw, (440, ry + 6), (580, ry + 26), radius=10, fill=(241, 243, 244))
            draw.text((450, ry + 8), "📎 Portfolio_U533.pdf", fill=(60, 64, 67), font=font_tiny)
            draw.text((w - 70, ry + 8), dt, fill=(128, 134, 139), font=font_small)

        # Modal open in steps 2 to 5
        if 2 <= step <= 5:
            # Semi-transparent overlay
            overlay = Image.new("RGBA", (w, h), (0, 0, 0, 100))
            img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"))
            draw = ImageDraw.Draw(img)

            # Modal Box
            draw_rounded_rect(draw, (110, 40), (w - 110, h - 50), radius=12, fill=(255, 255, 255), outline=(218, 220, 224))
            draw.text((130, 52), "Review & Select Attachments to Download", fill=(32, 33, 36), font=font_heading)

            # Format toggle
            draw_rounded_rect(draw, (130, 85), (w - 130, 115), radius=6, fill=(241, 243, 244))
            zip_sel = step >= 4
            draw_rounded_rect(draw, (132, 87), (350, 113), radius=5, fill=(241, 243, 244) if zip_sel else (255, 255, 255))
            draw.text((145, 93), "📁 Individual Files", fill=(95, 99, 104) if zip_sel else (26, 115, 232), font=font_small)

            draw_rounded_rect(draw, (355, 87), (w - 134, 113), radius=5, fill=(255, 255, 255) if zip_sel else (241, 243, 244))
            draw.text((370, 93), "📦 Single .ZIP Archive", fill=(26, 115, 232) if zip_sel else (95, 99, 104), font=font_bold if zip_sel else font_small)

            # Summary
            draw_rounded_rect(draw, (130, 125), (w - 130, 175), radius=8, fill=(248, 250, 253), outline=(211, 227, 253))
            draw.text((145, 135), "Found: 15 files (12 new)", fill=(32, 33, 36), font=font_bold)
            draw.text((320, 135), "Folder: Downloads/IDLC_Statements/", fill=(95, 99, 104), font=font_small)
            draw.text((145, 153), "🛡️ Safe Mode Anti-Throttle Active", fill=(30, 142, 62), font=font_small)

            # Item previews
            for idx, fn in enumerate(["2026-10-19_Portfolio_U533.pdf", "2026-10-18_Portfolio_U533.pdf", "2026-10-17_Portfolio_U533.pdf"]):
                iy = 190 + idx * 32
                draw.rectangle([(130, iy), (w - 130, iy + 28)], fill=(237, 242, 252))
                draw_rounded_rect(draw, (140, iy + 6), (154, iy + 20), radius=3, fill=(26, 115, 232))
                draw.text((143, iy + 5), "✓", fill=(255, 255, 255), font=font_tiny)
                draw.text((162, iy + 7), fn, fill=(32, 33, 36), font=font_small)
                draw.text((w - 200, iy + 7), "IDLC Securities", fill=(128, 134, 139), font=font_tiny)

            # Footer button
            draw.line([(110, h - 95), (w - 110, h - 95)], fill=(241, 243, 244))
            draw_rounded_rect(draw, (w - 280, h - 85), (w - 130, h - 58), radius=6, fill=(26, 115, 232))
            draw.text((w - 265, h - 77), "Start Download (12)" if not zip_sel else "Download as .ZIP (12)", fill=(255, 255, 255), font=font_bold)

        # Toast notification in steps 6 to 11
        if step >= 6:
            # Floating toast
            tx0, ty0, tx1, ty1 = w - 340, h - 130, w - 20, h - 20
            draw_rounded_rect(draw, (tx0, ty0), (tx1, ty1), radius=10, fill=(255, 255, 255), outline=(218, 220, 224))

            if step == 6:
                draw.text((tx0 + 15, ty0 + 12), "📥 Downloading 3 of 12", fill=(32, 33, 36), font=font_bold)
                draw.text((tx0 + 15, ty0 + 32), "2026-10-18_Portfolio_U533.pdf", fill=(95, 99, 104), font=font_tiny)
                draw_rounded_rect(draw, (tx0 + 15, ty0 + 55), (tx1 - 15, ty0 + 61), radius=3, fill=(232, 234, 237))
                draw_rounded_rect(draw, (tx0 + 15, ty0 + 55), (tx0 + 95, ty0 + 61), radius=3, fill=(26, 115, 232))
            elif 7 <= step <= 8:
                draw.text((tx0 + 15, ty0 + 12), "🛡️ Safe Cooldown (Batch 10/12)", fill=(242, 153, 0), font=font_bold)
                draw.text((tx0 + 15, ty0 + 32), "Pausing 5s to protect Gmail rate limits...", fill=(95, 99, 104), font=font_tiny)
                draw_rounded_rect(draw, (tx0 + 15, ty0 + 55), (tx1 - 15, ty0 + 61), radius=3, fill=(232, 234, 237))
                draw_rounded_rect(draw, (tx0 + 15, ty0 + 55), (tx0 + 240, ty0 + 61), radius=3, fill=(242, 153, 0))
            else: # completed
                draw.text((tx0 + 15, ty0 + 12), "🎉 Bulk Download Complete!", fill=(30, 142, 62), font=font_heading)
                draw.text((tx0 + 15, ty0 + 32), "Saved 12 statements to Downloads/IDLC_Statements/", fill=(95, 99, 104), font=font_tiny)
                # Action buttons
                draw_rounded_rect(draw, (tx0 + 15, ty0 + 60), (tx0 + 125, ty0 + 84), radius=5, fill=(241, 243, 244), outline=(218, 220, 224))
                draw.text((tx0 + 25, ty0 + 67), "📊 Export CSV", fill=(60, 64, 67), font=font_tiny)

                draw_rounded_rect(draw, (tx0 + 135, ty0 + 60), (tx1 - 15, ty0 + 84), radius=5, fill=(26, 115, 232))
                draw.text((tx0 + 150, ty0 + 67), "Open Folder", fill=(255, 255, 255), font=font_tiny)

        frames.append(img)

    # Save animated GIF
    durations = [600, 600, 1000, 1200, 1200, 800, 800, 900, 900, 1400, 1400, 1800]
    frames[0].save("assets/demo.gif", save_all=True, append_images=frames[1:], duration=durations, loop=0)
    print("Demo GIF created successfully!")

if __name__ == "__main__":
    generate_banner()
    generate_modal_demo()
    generate_demo_gif()
