"""ホーム画面に置くアイコンを作る。

外部の部品を足さずに済ませたいので、画素を自分で並べて PNG を書き出す。
絵柄は「木漏れ日」の配色（テラコッタの地にクリームの家系図）。
やり直すときは `python3 scripts/make-icons.py`。
"""

import struct
import zlib
from pathlib import Path

BG = (201, 123, 74)  # テラコッタ --accent
FG = (251, 244, 232)  # クリーム --bg
SAGE = (163, 185, 138)  # セージ --sage


def render(size: int, inset: float) -> bytes:
    """1辺 size の画素を作る。inset は絵柄を内側へ寄せる割合（maskable 用）。"""
    pixels = [[BG for _ in range(size)] for _ in range(size)]

    def disc(cx: float, cy: float, r: float, color: tuple[int, int, int]) -> None:
        for y in range(max(0, int(cy - r)), min(size, int(cy + r) + 1)):
            for x in range(max(0, int(cx - r)), min(size, int(cx + r) + 1)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    pixels[y][x] = color

    def bar(x1: float, y1: float, x2: float, y2: float, w: float) -> None:
        for y in range(max(0, int(min(y1, y2) - w)), min(size, int(max(y1, y2) + w) + 1)):
            for x in range(max(0, int(min(x1, x2) - w)), min(size, int(max(x1, x2) + w) + 1)):
                pixels[y][x] = FG

    # 親ひとり、子ふたり。線でつないだだけの、いちばん小さな家系図
    unit = size * inset
    mid = size / 2
    top = mid - unit * 0.26
    bottom = mid + unit * 0.28
    gap = unit * 0.27
    r = unit * 0.115
    thin = max(1.0, unit * 0.022)

    bar(mid, top, mid, (top + bottom) / 2, thin)
    bar(mid - gap, (top + bottom) / 2, mid + gap, (top + bottom) / 2, thin)
    bar(mid - gap, (top + bottom) / 2, mid - gap, bottom, thin)
    bar(mid + gap, (top + bottom) / 2, mid + gap, bottom, thin)

    disc(mid, top, r * 1.15, FG)
    disc(mid - gap, bottom, r, FG)
    disc(mid + gap, bottom, r, SAGE)

    raw = b''.join(
        b'\x00' + b''.join(struct.pack('3B', *pixel) for pixel in row) for row in pixels
    )
    return raw


def png(size: int, inset: float) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack('>2I5B', size, size, 8, 2, 0, 0, 0)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(render(size, inset), 9))
        + chunk(b'IEND', b'')
    )


out = Path(__file__).resolve().parent.parent / 'public'
out.mkdir(exist_ok=True)

# 通常のアイコンは大きめに、マスクされるものは内側へ寄せて欠けないようにする
(out / 'icon-192.png').write_bytes(png(192, 0.86))
(out / 'icon-512.png').write_bytes(png(512, 0.86))
(out / 'icon-maskable-512.png').write_bytes(png(512, 0.62))
(out / 'apple-touch-icon.png').write_bytes(png(180, 0.86))
print('wrote', *(p.name for p in sorted(out.glob('*.png'))))
