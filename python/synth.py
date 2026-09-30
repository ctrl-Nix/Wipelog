"""Synthetic training data.
label 0 = properly overwritten (uniform fill or random)
label 1 = residual data likely recoverable (intact content or partial wipe)
"""
import os, json, random
import numpy as np
from features import analyze_bytes

FEATURES = ["entropy", "chi2_norm", "zero_fraction", "printable_ratio", "longest_run_fraction"]
rng = random.Random(42)
WORDS = ["budget", "meeting", "user", "email", "invoice", "report",
         "salary", "account", "password", "demo", "client", "contract"]


def text_blob(n):
    out, size = [], 0
    while size < n:
        line = " ".join(rng.choices(WORDS, k=rng.randint(4, 12))) + "\n"
        out.append(line); size += len(line)
    return "".join(out).encode()[:n]


def csv_blob(n):
    out, size, i = ["id,name,email,salary\n"], 0, 0
    while size < n:
        line = f"{i},User{rng.randint(1,9999)},u{i}@example.com,{rng.randint(20000,90000)}\n"
        out.append(line); size += len(line); i += 1
    return "".join(out).encode()[:n]


def json_blob(n):
    items = [{"id": i, "v": rng.random(), "tag": rng.choice(WORDS)} for i in range(n // 20 + 1)]
    return json.dumps(items).encode()[:n]


def binary_blob(n):
    # structured binary: header, fixed-size records with zero padding
    rec = lambda: os.urandom(8) + bytes(rng.randint(8, 40))
    out, size = [b"\x89HDR\x00\x01"], 6
    while size < n:
        r = rec(); out.append(r); size += len(r)
    return b"".join(out)[:n]


ORIGINALS = [text_blob, csv_blob, json_blob, binary_blob]


def clean_sample(n):
    kind = rng.choice(["random", "random", "fill"])
    if kind == "random":
        return os.urandom(n)
    return bytes([rng.choice([0x00, 0xFF, 0x55, 0xAA])]) * n


def residual_sample(n):
    data = rng.choice(ORIGINALS)(n)
    if rng.random() < 0.4:
        return data                      # not wiped at all
    intact = rng.uniform(0.05, 0.9)      # partial wipe: part of the file survives
    cut = int(n * (1 - intact))
    wiped = os.urandom(cut)
    return wiped + data[cut:] if rng.random() < 0.5 else data[:n - cut] + wiped


def make_block_dataset(per_class=6000):
    """Per-block training data. Most blocks are 4096 bytes; some are shorter (file tails)."""
    X, y = [], []
    for label, gen in ((0, clean_sample), (1, residual_blob)):
        for _ in range(per_class):
            n = 4096 if rng.random() < 0.8 else rng.randint(1024, 4096)
            f = analyze_bytes(gen(n))
            X.append([f[k] for k in FEATURES]); y.append(label)
    return np.array(X), np.array(y)


def residual_blob(n):
    return rng.choice(ORIGINALS)(n)