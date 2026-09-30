import os
import pytest
from synth import text_blob
from classifier import scan_file, MODEL

pytestmark = pytest.mark.skipif(not MODEL.exists(), reason="run train.py first")


def test_random_passes(tmp_path):
    p = tmp_path / "r.bin"; p.write_bytes(os.urandom(200_000))
    assert scan_file(p)["verdict"] == "PASS"


def test_zeros_pass(tmp_path):
    p = tmp_path / "z.bin"; p.write_bytes(bytes(200_000))
    assert scan_file(p)["verdict"] == "PASS"


def test_text_fails(tmp_path):
    p = tmp_path / "t.txt"; p.write_bytes(text_blob(50_000))
    assert scan_file(p)["verdict"] == "FAIL"


def test_one_percent_survivor_fails(tmp_path):
    d = bytearray(os.urandom(1_000_000)); d[:10_000] = text_blob(10_000)
    p = tmp_path / "p.bin"; p.write_bytes(bytes(d))
    assert scan_file(p)["verdict"] == "FAIL"
