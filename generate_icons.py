import zlib
import struct
import os

def create_png(width, height, color_bg, color_accent):
    # Create RGBA raw buffer
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter type none
        for x in range(width):
            # Draw rounded rectangle / icon badge
            # Center coordinates
            cx, cy = width / 2.0, height / 2.0
            dx, dy = abs(x - cx), abs(y - cy)
            
            # Rounded box mask
            radius = width * 0.2
            bx = width / 2.0 - radius
            by = height / 2.0 - radius
            
            in_shape = False
            if dx <= bx and dy <= height / 2.0:
                in_shape = True
            elif dy <= by and dx <= width / 2.0:
                in_shape = True
            elif (dx - bx)**2 + (dy - by)**2 <= radius**2:
                in_shape = True
            
            if not in_shape:
                raw_data.extend([0, 0, 0, 0])
                continue
                
            # Draw PDF document icon inside
            # Document page: from 25% to 75% width, 20% to 80% height
            doc_x0, doc_x1 = width * 0.22, width * 0.78
            doc_y0, doc_y1 = height * 0.18, height * 0.82
            
            # Download arrow or document body
            is_accent = False
            if doc_x0 <= x <= doc_x1 and doc_y0 <= y <= doc_y1:
                # Top-right folded corner
                corner_size = width * 0.18
                if x >= doc_x1 - corner_size and y <= doc_y0 + corner_size:
                    if x - (doc_x1 - corner_size) > corner_size - (y - doc_y0):
                        # Background behind folded corner
                        raw_data.extend([*color_bg, 255])
                        continue
                is_accent = True
                
            if is_accent:
                # White document with red PDF banner or blue accent
                # Red banner in middle-bottom
                if height * 0.52 <= y <= height * 0.70 and doc_x0 <= x <= doc_x1:
                    raw_data.extend([234, 67, 53, 255]) # Google Red / PDF Red
                elif height * 0.32 <= y <= height * 0.42 and width * 0.35 <= x <= width * 0.65:
                    raw_data.extend([100, 100, 100, 255]) # Text line
                else:
                    raw_data.extend([255, 255, 255, 255])
            else:
                raw_data.extend([*color_bg, 255])

    # PNG chunks
    def chunk(chunk_type, data):
        return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xffffffff)

    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    compressed = zlib.compress(bytes(raw_data), 9)
    
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr_data) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    return png

os.makedirs("icons", exist_ok=True)
for size in [16, 48, 128]:
    # Blue background: Google Blue #1A73E8 = (26, 115, 232)
    png_bytes = create_png(size, size, (26, 115, 232), (255, 255, 255))
    with open(f"icons/icon{size}.png", "wb") as f:
        f.write(png_bytes)

print("Icons created successfully!")
