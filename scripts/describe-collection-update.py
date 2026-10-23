"""Describe a collection update for its pull request: which items' metadata,
original texts and translations were added, changed or removed, comparing the
published source archive with the newly packaged one. Reads only.

  python scripts/describe-collection-update.py --old data/collection --new STAGE/data/collection --stats STAGE/dist/stats.json --output BODY.md
"""
from pathlib import Path
import argparse, csv, importlib.util, io, json

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('archive_sources', root / 'scripts' / 'archive-sources.py')
policy = importlib.util.module_from_spec(spec); spec.loader.exec_module(policy)
LIMIT = 200

def metadata_rows(files):
    names = [n for n in files if n.endswith('.csv')]
    if not names: return {}
    rows = csv.DictReader(io.StringIO(files[names[0]].decode('utf-8-sig'), newline=''))
    return {row['PIN']: row for row in rows}

def listed(label, values):
    if not values: return []
    shown = ', '.join(f'`{v}`' for v in values[:LIMIT])
    more = f' and {len(values) - LIMIT} more' if len(values) > LIMIT else ''
    return [f'- {label} ({len(values)}): {shown}{more}']

def describe(old, new, stats=None):
    lines = []
    for folder, label in [(policy.FOLDERS[1], 'Original texts'), (policy.FOLDERS[2], 'English translations')]:
        before = {n.split('/', 1)[1].removesuffix('.txt'): b for n, b in old.items() if n.startswith(folder + '/')}
        after = {n.split('/', 1)[1].removesuffix('.txt'): b for n, b in new.items() if n.startswith(folder + '/')}
        lines += listed(f'{label} added', sorted(set(after) - set(before)))
        lines += listed(f'{label} changed', sorted(k for k in set(after) & set(before) if after[k] != before[k]))
        lines += listed(f'{label} removed', sorted(set(before) - set(after)))
    before, after = metadata_rows(old), metadata_rows(new)
    lines += listed('Metadata rows added', sorted(set(after) - set(before)))
    changed = []
    for pin in sorted(set(after) & set(before)):
        fields = sorted(f for f in set(after[pin]) | set(before[pin]) if after[pin].get(f) != before[pin].get(f))
        if fields: changed.append(f'{pin} ({", ".join(fields)})')
    lines += listed('Metadata rows changed', changed)
    lines += listed('Metadata rows removed', sorted(set(before) - set(after)))
    if not lines: lines = ['- No catalog texts or metadata changed.']
    text = 'Collection sources packaged with Update-Collection.cmd from the source folders on the editor\'s computer. The whole collection was rebuilt and every test passed on that exact snapshot before this pull request was opened.\n\n'
    text += 'Changes to the source archive (`data/collection`), by catalog ID:\n\n' + '\n'.join(lines)
    if stats:
        text += ('\n\nThe tested build has {records} records: {original} with original text, {english} with English translation, '
                 '{pairs} with both, and {metadataOnly} with metadata only.').format(**stats)
    return text

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--old', required=True); parser.add_argument('--new', required=True)
    parser.add_argument('--stats'); parser.add_argument('--output', required=True)
    args = parser.parse_args()
    stats = json.loads(Path(args.stats).read_text(encoding='utf-8')) if args.stats else None
    Path(args.output).write_text(describe(policy.read_archive(args.old), policy.read_archive(args.new), stats) + '\n', encoding='utf-8')
