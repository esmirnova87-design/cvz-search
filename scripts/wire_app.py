from pathlib import Path

root = Path(__file__).resolve().parents[1]
p = root / "index.html"
text = p.read_text(encoding="utf-8")
start = text.index("  <script>")
end = text.index("  </script>") + len("  </script>")
new = '  <script src="app.js"></script>'
p.write_text(text[:start] + new + text[end:], encoding="utf-8")
(root / "mockup-search.html").write_text(p.read_text(encoding="utf-8"), encoding="utf-8")
print("ok")
