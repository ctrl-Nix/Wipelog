import os, shutil, sys
from pathlib import Path
import pytest
from wipe import check_target, ROOT

win = pytest.mark.skipif(sys.platform != "win32", reason="Windows paths")


@win
@pytest.mark.parametrize("p", [r"C:\Windows", r"C:\Users", "C:\\"])
def test_refuses_system_paths(p):
    with pytest.raises(SystemExit):
        check_target(Path(p))


def test_refuses_project_root():
    with pytest.raises(SystemExit):
        check_target(ROOT)


def test_refuses_project_source():
    with pytest.raises(SystemExit):
        check_target(ROOT / "python")


def test_accepts_sandbox_subfolder():
    d = ROOT / "sandbox" / "_pytest_tmp"
    d.mkdir(parents=True, exist_ok=True)
    try:
        assert check_target(d) == d.resolve()
    finally:
        shutil.rmtree(d, ignore_errors=True)
