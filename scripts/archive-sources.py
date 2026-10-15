"""Pack publishable source inputs without modifying local source folders."""
from pathlib import Path, PurePosixPath
import argparse, csv, hashlib, io, json, tarfile
FOLDERS = ['metadata - copy', 'original_texts - copy', 'translated_texts - copy']
MANIFEST = FOLDERS[0] + '/withheld-original-ids.json'

def permitted(row):
    # Same availability test as countReferences > 0: any nonseparator content.
    return any(str(row.get(f, '')).replace(',', '').strip() for f in ('Manuscripts', 'Publications'))

def public_files(files):
    names = [n for n in files if n.startswith(FOLDERS[0] + '/') and n.endswith('.csv')]
    if len(names) != 1: raise ValueError('Expected exactly one metadata CSV')
    name = names[0]
    reader = csv.DictReader(io.StringIO(files[name].decode('utf-8-sig'), newline=''))
    fields = reader.fieldnames
    if not fields or not {'PIN', 'Manuscripts', 'Publications'}.issubset(fields):
        raise ValueError('Missing publication-policy metadata columns')
    rows = list(reader)
    by_id = {r['PIN']: r for r in rows}
    if len(by_id) != len(rows): raise ValueError('Duplicate metadata IDs')
    withheld = set(json.loads(files.get(MANIFEST, b'[]')))
    result = {}
    for filename, contents in files.items():
        if filename.startswith(FOLDERS[1] + '/') and filename.endswith('.txt'):
            identity = PurePosixPath(filename).stem
            if not permitted(by_id.get(identity, {})):
                withheld.add(identity)
                continue
        result[filename] = contents
    for row in rows:
        if not permitted(row) and 'First line (original)' in row: row['First line (original)'] = ''
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    result[name] = output.getvalue().encode('utf-8')
    result[MANIFEST] = (json.dumps(sorted(withheld), ensure_ascii=False) + '\n').encode('utf-8')
    return result

# The archive is a directory of uncompressed tar shards. Git compresses stored
# objects itself, and an uncompressed shard lets Git send a small delta when one
# item changes instead of re-uploading the whole collection.
ARCHIVE = Path('data') / 'collection'
SHARD_FOLDERS = {FOLDERS[1]: 'original', FOLDERS[2]: 'translated'}
HEX = '0123456789abcdef'

def shard_name(name):
    folder, filename = name.split('/', 1)
    if folder == FOLDERS[0]: return 'metadata.tar'
    return f'{SHARD_FOLDERS[folder]}-{hashlib.sha256(filename.encode("utf-8")).hexdigest()[0]}.tar'

def shard_names():
    return ['metadata.tar'] + [f'{prefix}-{h}.tar' for prefix in SHARD_FOLDERS.values() for h in HEX]

def _read_entries(archive, files, shard=None):
    for entry in archive:
        if entry.isdir(): continue
        parts = PurePosixPath(entry.name).parts
        if not entry.isfile() or len(parts) != 2 or parts[0] not in FOLDERS or parts[1] in ('.', '..'):
            raise ValueError('Unexpected archive entry: ' + entry.name)
        if entry.name in files: raise ValueError('Duplicate archive entry: ' + entry.name)
        if shard is not None and shard_name(entry.name) != shard:
            raise ValueError(f'{entry.name} is in the wrong archive shard {shard}')
        files[entry.name] = archive.extractfile(entry).read()

def read_archive(source):
    """Read a sharded archive directory, or a legacy single .tar.gz archive."""
    source = Path(source)
    files = {}
    if source.is_dir():
        present = sorted(p.name for p in source.iterdir())
        if present != sorted(shard_names()):
            raise ValueError(f'Unexpected archive shards in {source}: expected {len(shard_names())} .tar files')
        for name in shard_names():
            with tarfile.open(source / name, 'r:') as archive: _read_entries(archive, files, name)
    else:
        with tarfile.open(source, 'r:gz') as archive: _read_entries(archive, files)
    return files

def shard_bytes(files):
    """Deterministic shard contents: sorted names, fixed owner, mode and time."""
    groups = {name: [] for name in shard_names()}
    for name in sorted(files): groups[shard_name(name)].append(name)
    result = {}
    for shard, names in groups.items():
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w', format=tarfile.PAX_FORMAT) as archive:
            for name in names:
                info = tarfile.TarInfo(name)
                info.size = len(files[name])
                info.mode = 0o644
                archive.addfile(info, io.BytesIO(files[name]))
        result[shard] = buffer.getvalue()
    return result

def write_archive(target, files):
    """Replace only shards whose bytes change, then remove unexpected files."""
    target = Path(target)
    target.mkdir(parents=True, exist_ok=True)
    shards = shard_bytes(files)
    changed = 0
    for name, contents in shards.items():
        path = target / name
        if path.exists() and path.read_bytes() == contents: continue
        temporary = path.with_name(path.name + '.tmp')
        temporary.write_bytes(contents)
        temporary.replace(path)
        changed += 1
    for path in target.iterdir():
        if path.name not in shards: path.unlink()
    return changed

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, help='Archive directory (default: data/collection)')
    parser.add_argument('--from-archive', type=Path, help='Filter an archive directory, or a legacy .tar.gz, without importing local edits')
    parser.add_argument('--check', action='store_true', help='Reject an archive containing withheld originals')
    args = parser.parse_args()
    target = args.output or args.root / ARCHIVE
    if args.from_archive or args.check:
        files = read_archive(args.from_archive or target)
    else:
        files = {}
        for folder in FOLDERS:
            for path in sorted((args.root / folder).glob('*.csv' if folder == FOLDERS[0] else '*.txt')):
                files[path.relative_to(args.root).as_posix()] = path.read_bytes()
    filtered = public_files(files)
    if args.check:
        if files != filtered: raise SystemExit('Source archive is not publication-safe; run scripts/archive-sources.py')
        print('Source archive publication policy verified')
        return
    changed = write_archive(target, filtered)
    print(f'Archived {len(filtered):,} public files in {changed} changed shard(s); withheld {len(json.loads(filtered[MANIFEST])):,} originals')

if __name__ == '__main__': main()
