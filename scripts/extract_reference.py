"""Extract the user's bundled HTML without executing its bundled runtime.

Usage: python3 scripts/extract_reference.py '/path/to/Wireframes.html' /tmp/output
"""
import base64
import gzip
import json
import re
import sys
from pathlib import Path
import reference_converter as converter

source, destination = Path(sys.argv[1]), Path(sys.argv[2])
destination.mkdir(parents=True, exist_ok=True)
bundle = source.read_text()
template = json.loads(re.search(r'<script type="__bundler/template">\s*(.*?)\s*</script>', bundle, re.S)[1])
manifest = json.loads(re.search(r'<script type="__bundler/manifest">\s*(.*?)\s*</script>', bundle, re.S)[1])
# The export itself contains malformed quoted Century Schoolbook declarations.
# Repair the intended font stack before HTML parsing.
template = re.sub(r'font-family:" century="" schoolbook","new="" schoolbook",georgia,"times="" new="" roman",serif;([^"<>]*)"=""', r"font-family:'Century Schoolbook','New Century Schoolbook',Georgia,'Times New Roman',serif;\1\"", template)
template = template.replace('font-family:" century="" schoolbook","new="" schoolbook",georgia,"times="" new="" roman",serif"=""', "font-family:'Century Schoolbook','New Century Schoolbook',Georgia,'Times New Roman',serif\"")
(destination / 'reference.html').write_text(template)
root = converter.parse(template)
def walk(node):
    if isinstance(node, converter.Node):
        yield node
        for child in node.children:
            yield from walk(child)
nodes = list(walk(root))
frames = [n for n in nodes if n.attrs.get('class') == 'dv-opt']
converter.FONT_MAP = []
converter.ATTR_MAP.update({'sc-camel-view-box': 'viewBox', 'stroke-width':'strokeWidth', 'stroke-linecap':'strokeLinecap', 'stroke-linejoin':'strokeLinejoin', 'fill-rule':'fillRule', 'clip-rule':'clipRule', 'sc-on-click':'onClick'})
inventory = []
for frame in frames:
    fid = frame.attrs['id']
    card = next(n for n in walk(frame) if n.attrs.get('class') == 'dv-card')
    original_parse = converter.parse
    converter.parse = lambda _: card
    converter.KEEP_CHAT = fid in ('4f', '4g')
    code, kind = converter.convert(fid, '')
    converter.parse = original_parse
    code = code.replace('Wireframes (2)', 'Wireframes (4)')
    (destination / f'F{fid}.tsx').write_text(code)
    inventory.append({'id': fid, 'kind': kind, 'style': card.attrs.get('style')})
(destination / 'inventory.json').write_text(json.dumps(inventory, indent=2))
# Bundle fonts needed by the canonical design, locally rather than CDN-dependent.
for block in re.findall(r'@font-face\s*{(.*?)}', template, re.S):
    if 'U+0000-00FF' not in block: continue
    family = re.search(r"font-family:\s*'([^']+)'", block)[1]
    asset = re.search(r'url\("([^"]+)"\)', block)[1]
    weight = re.search(r'font-weight:\s*([^;]+)', block)[1]
    if asset not in manifest: continue
    record = manifest[asset]
    data = base64.b64decode(record['data'])
    if record.get('compressed'): data = gzip.decompress(data)
    (destination / f'{family.lower().replace(" ", "-")}-{weight}.woff2').write_bytes(data)
print(json.dumps(inventory, indent=2))
