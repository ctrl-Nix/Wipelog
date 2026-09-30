import os
import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

from wipe import check_target


def test_refuses_windows_dir():
    sys_root = os.environ.get("SystemRoot", r"C:\Windows")
    with pytest.raises(SystemExit):
        check_target(Path(sys_root))


def test_refuses_users_dir():
    with pytest.raises(SystemExit):
        check_target(Path(r"C:\Users"))


def test_refuses_project_root():
    with pytest.raises(SystemExit):
        check_target(ROOT)


def test_refuses_project_code():
    with pytest.raises(SystemExit):
        check_target(ROOT / "python")


def test_refuses_drive_root():
    with pytest.raises(SystemExit):
        check_target(Path(r"C:\\"))


def test_refuses_symlink(tmp_path, monkeypatch):
    test_link = tmp_path / "link_target"
    try:
        test_link.symlink_to(tmp_path)
        with pytest.raises(SystemExit):
            check_target(test_link)
    except OSError:
        # Fallback when Windows Developer Mode / symlink privilege is not enabled
        dummy = tmp_path / "dummy_file"
        dummy.touch()
        monkeypatch.setattr(Path, "is_symlink", lambda self: True if self == dummy else False)
        with pytest.raises(SystemExit):
            check_target(dummy)


def test_accepts_sandbox():
    sandbox = ROOT / "sandbox"
    sandbox.mkdir(exist_ok=True)
    res = check_target(sandbox)
    assert res == sandbox.resolve()
