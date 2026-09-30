"""Byte-level features of a file, used to estimate residual-pattern risk."""
import io
import numpy as np
from pathlib import Path

CHUNK = 1 << 20
EMPTY = {"bytes": 0, "entropy": 0.0, "chi2_norm": 0.0,
         "zero_fraction": 0.0, "printable_ratio": 0.0, "longest_run_fraction": 0.0}


def _analyze_stream(f) -> dict:
    hist = np.zeros(256, dtype=np.int64)
    longest, cur, last = 0, 0, -1
    while chunk := f.read(CHUNK):
        a = np.frombuffer(chunk, dtype=np.uint8)
        hist += np.bincount(a, minlength=256)
        change = np.flatnonzero(a[1:] != a[:-1])
        starts = np.concatenate(([0], change + 1))
        ends = np.concatenate((change + 1, [len(a)]))
        lens = (ends - starts).astype(np.int64)
        if int(a[0]) == last:
            lens[0] += cur
        longest = max(longest, int(lens.max()))
        cur, last = int(lens[-1]), int(a[-1])

    n = int(hist.sum())
    if n == 0:
        return dict(EMPTY)
    p = hist[hist > 0] / n
    entropy = float(-(p * np.log2(p)).sum())
    expected = n / 256
    chi2_norm = float(((hist - expected) ** 2 / expected).sum() / 255)
    printable = int(hist[32:127].sum() + hist[9] + hist[10] + hist[13])
    return {
        "bytes": n,
        "entropy": round(entropy, 4),
        "chi2_norm": round(chi2_norm, 4),
        "zero_fraction": round(int(hist[0]) / n, 4),
        "printable_ratio": round(printable / n, 4),
        "longest_run_fraction": round(longest / n, 4),
    }


def analyze(path: Path) -> dict:
    with open(path, "rb") as f:
        return _analyze_stream(f)


def analyze_bytes(data: bytes) -> dict:
    return _analyze_stream(io.BytesIO(data))

def iter_blocks(path, block=4096, min_tail=1024):
    """Yield 4 KB blocks; a tiny final tail is merged into the previous block."""
    with open(path, "rb") as f:
        cur = f.read(block)
        while cur:
            nxt = f.read(block)
            if 0 < len(nxt) < min_tail:      # short read = EOF
                cur += nxt
                nxt = b""
            yield cur
            cur = nxt


def analyze_blocks(path, block=4096):
    return [analyze_bytes(b) for b in iter_blocks(path, block)]