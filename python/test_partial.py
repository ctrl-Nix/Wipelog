import os, tempfile
from pathlib import Path
from synth import text_blob
from features import analyze
from classifier import scan_file

data = bytearray(os.urandom(1_000_000))
data[:10_000] = text_blob(10_000)          # 1% survives
p = Path(tempfile.mkdtemp()) / "partial.bin"
p.write_bytes(bytes(data))

print("whole-file entropy :", analyze(p)["entropy"], "(looks random, fooled)")
print("block-level scan   :", scan_file(p))
