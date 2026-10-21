"""Apply exactly one local item to the current published archive, or delete one
published item (--delete); preserve other items."""
from pathlib import Path
import argparse, csv, importlib.util, io, json

def patch(files, local, identity, policy):
    # Exact filenames preserve case-distinct IDs. Do not import unrelated local changes.
    csvs=list((local/'metadata - copy').glob('*.csv'))
    if len(csvs)!=1: raise ValueError('Expected one local metadata CSV')
    with csvs[0].open(encoding='utf-8-sig',newline='') as stream:
        reader=csv.DictReader(stream); fields=reader.fieldnames; rows=list(reader)
    matches=[row for row in rows if row['PIN']==identity]
    if len(matches)>1: raise ValueError('Duplicate local metadata ID')
    name=next(name for name in files if name.startswith('metadata - copy/') and name.endswith('.csv'))
    reader=csv.DictReader(io.StringIO(files[name].decode('utf-8-sig'),newline=''))
    if reader.fieldnames!=fields: raise ValueError('Metadata columns differ from the published catalog. Use the full updater.')
    published=list(reader)
    known={row['PIN'] for row in published}|{Path(name).stem for name in files if name.endswith('.txt')}|set(json.loads(files[policy.MANIFEST]))
    if identity not in known: raise ValueError('This is not an existing published ID. Use the full updater to add or rename records.')
    if matches:
        if not any(row['PIN']==identity for row in published): published.append(matches[0])
        else: published=[matches[0] if row['PIN']==identity else row for row in published]
    output=io.StringIO(newline=''); writer=csv.DictWriter(output,fieldnames=fields,lineterminator='\n');writer.writeheader();writer.writerows(published)
    result=dict(files);result[name]=output.getvalue().encode('utf-8')
    for folder in policy.FOLDERS[1:]:
        filename=identity+'.txt'; key=folder+'/'+filename
        # Windows paths are case insensitive; enumeration enforces exact identity.
        actual=next((p for p in (local/folder).iterdir() if p.name==filename),None)
        if actual is None: result.pop(key,None)
        else: result[key]=actual.read_bytes()
    return policy.public_files(result)

def delete(files, identity, policy):
    # Remove every published trace of one ID: its metadata row, both texts and
    # any withheld-original entry. Other rows keep their exact published bytes.
    name=next(name for name in files if name.startswith('metadata - copy/') and name.endswith('.csv'))
    reader=csv.DictReader(io.StringIO(files[name].decode('utf-8-sig'),newline=''));fields=reader.fieldnames;published=list(reader)
    withheld=json.loads(files[policy.MANIFEST])
    texts=[folder+'/'+identity+'.txt' for folder in policy.FOLDERS[1:]]
    if not any(row['PIN']==identity for row in published) and not any(key in files for key in texts) and identity not in withheld:
        raise ValueError('This ID is not in the published catalog.')
    output=io.StringIO(newline='');writer=csv.DictWriter(output,fieldnames=fields,lineterminator='\n');writer.writeheader();writer.writerows(row for row in published if row['PIN']!=identity)
    result={key:value for key,value in files.items() if key not in texts}
    result[name]=output.getvalue().encode('utf-8')
    result[policy.MANIFEST]=(json.dumps(sorted(set(withheld)-{identity}),ensure_ascii=False)+'\n').encode('utf-8')
    return policy.public_files(result)

def main():
    args=argparse.ArgumentParser();args.add_argument('--root',type=Path);args.add_argument('--archive',type=Path,required=True);args.add_argument('--id',required=True);args.add_argument('--delete',action='store_true')
    options=args.parse_args()
    if not options.delete and options.root is None: args.error('--root is required unless --delete is given')
    if not options.id or len(options.id)>160 or any(not(c.isalnum() or c in '_ ()-') for c in options.id): raise ValueError('Invalid ID')
    spec=importlib.util.spec_from_file_location('archive_sources',Path(__file__).with_name('archive-sources.py'));policy=importlib.util.module_from_spec(spec);spec.loader.exec_module(policy)
    before=policy.read_archive(options.archive)
    files=delete(before,options.id,policy) if options.delete else patch(before,options.root,options.id,policy)
    if files==before:
        print('This item already matches the published source.')
        return
    changed=policy.write_archive(options.archive,files)
    print(f'Prepared one-item public archive {"without" if options.delete else "for"} {options.id} ({changed} changed shard(s))')

if __name__=='__main__': main()
