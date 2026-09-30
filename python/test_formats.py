import io, os, tempfile, zipfile
from pathlib import Path
from synth import text_blob
from classifier import scan_file


def make(data, name):
    p = Path(tempfile.mkdtemp()) / name
    p.write_bytes(data)
    return p


buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("word/document.xml", text_blob(60_000))
zb = buf.getvalue()

zipcase = bytearray(os.urandom(1_000_000))
zipcase[100_000:100_000 + len(zb)] = zb           # surviving docx/zip fragment
pdfcase = bytearray(os.urandom(1_000_000))
pdfcase[500_000:500_009] = b"%PDF-1.7\n"          # surviving pdf header

print("zip fragment in random :", scan_file(make(bytes(zipcase), "a.bin"))["verdict"], "(expect FAIL)")
print("pdf header in random   :", scan_file(make(bytes(pdfcase), "b.bin"))["verdict"], "(expect FAIL)")
print("pure random            :", scan_file(make(os.urandom(1_000_000), "c.bin"))["verdict"], "(expect PASS)")
print("all zeros              :", scan_file(make(bytes(1_000_000), "d.bin"))["verdict"], "(expect PASS)")