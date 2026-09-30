import os
import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

from classifier import scan_file
from synth import text_blob


def test_random_block_passes(tmp_path):
    p = tmp_path / "random.bin"
    p.write_bytes(os.urandom(64 * 1024))
    res = scan_file(p)
    assert res["verdict"] == "PASS"
    assert res["flagged_blocks"] == 0


def test_plain_text_block_fails(tmp_path):
    p = tmp_path / "plaintext.txt"
    p.write_bytes(text_blob(8192))
    res = scan_file(p)
    assert res["verdict"] == "FAIL"
    assert res["flagged_blocks"] > 0


def test_one_percent_surviving_text_fails(tmp_path):
    # 1% surviving text in random data (e.g. partial wipe)
    data = bytearray(os.urandom(1_000_000))
    data[:10_000] = text_blob(10_000)
    p = tmp_path / "partial_wipe.bin"
    p.write_bytes(bytes(data))

    res = scan_file(p)
    assert res["verdict"] == "FAIL"
    assert res["flagged_blocks"] > 0
