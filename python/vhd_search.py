import sys
CHUNK = 8 * 1024 * 1024
path, marker = sys.argv[1], sys.argv[2].encode()
hits, tail = 0, b""
with open(path, "rb") as f:
    while c := f.read(CHUNK):
        buf = tail + c
        hits += buf.count(marker)
        tail = buf[-(len(marker) - 1):]
print(f"'{sys.argv[2]}' found {hits} times in {path}")
