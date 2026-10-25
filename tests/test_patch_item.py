import base64, csv, importlib.util, io, json, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
patcher=load('patcher','patch-item-archive.py');policy=load('policy','archive-sources.py')
FIELDS=['PIN','Title','Manuscripts','Publications','First line (original)']
def metadata(rows):
    stream=io.StringIO(newline='');writer=csv.DictWriter(stream,fieldnames=FIELDS,lineterminator='\n');writer.writeheader();writer.writerows(rows);return stream.getvalue().encode()
def rows_of(result):
    return list(csv.DictReader(io.StringIO(result['metadata - copy/items.csv'].decode())))
b64=lambda value:base64.b64encode(value).decode()
class ItemBatch(unittest.TestCase):
    def setUp(self):
        self.a=dict(zip(FIELDS,['AB1','First','M','','اول']));self.b=dict(zip(FIELDS,['AB2','Second','M','','دوم']))
        self.files={'metadata - copy/items.csv':metadata([self.a,self.b]),policy.MANIFEST:b'[]\n','original_texts - copy/AB1.txt':b'old','translated_texts - copy/AB1.txt':b'old translation','translated_texts - copy/AB2.txt':b'keep'}
    def test_edits_change_only_their_items_and_follow_the_publication_policy(self):
        edited=dict(self.a,Title='Corrected',Manuscripts='')
        result=patcher.apply_batch(self.files,{'items':{'AB1':{'action':'edit','metadata':edited,'original':b64(b'withheld original'),'english':b64(b'corrected translation')}}},policy)
        rows=rows_of(result)
        self.assertEqual(rows[0]['Title'],'Corrected');self.assertEqual(rows[0]['First line (original)'],'')
        self.assertEqual(rows[1],self.b);self.assertEqual(result['translated_texts - copy/AB2.txt'],b'keep')
        self.assertNotIn('original_texts - copy/AB1.txt',result);self.assertEqual(result['translated_texts - copy/AB1.txt'],b'corrected translation')
        self.assertEqual(json.loads(result[policy.MANIFEST]),['AB1'])
        # Permitted again: the original is published and leaves the manifest.
        again=patcher.apply_batch(result,{'items':{'AB1':{'action':'edit','metadata':dict(edited,Manuscripts='M'),'original':b64(b'back'),'english':None}}},policy)
        self.assertEqual(again['original_texts - copy/AB1.txt'],b'back');self.assertEqual(json.loads(again[policy.MANIFEST]),[])
        self.assertNotIn('translated_texts - copy/AB1.txt',again)
        with self.assertRaises(ValueError):patcher.apply_batch(self.files,{'items':{'NEW':{'action':'edit','metadata':dict(self.a,PIN='NEW'),'original':None,'english':None}}},policy)
        with self.assertRaises(ValueError):patcher.apply_batch(self.files,{'items':{'AB1':{'action':'edit','metadata':{**self.a,'Extra':''},'original':None,'english':None}}},policy)
    def test_deletions_remove_only_the_item(self):
        files=dict(self.files);files['metadata - copy/items.csv']=metadata([dict(self.a,Manuscripts=''),self.b]);files[policy.MANIFEST]=b'["AB1"]\n';del files['original_texts - copy/AB1.txt']
        result=patcher.apply_batch(files,{'items':{'AB1':{'action':'delete'}}},policy)
        self.assertEqual([row['PIN'] for row in rows_of(result)],['AB2']);self.assertEqual(rows_of(result)[0]['First line (original)'],'دوم')
        self.assertNotIn('translated_texts - copy/AB1.txt',result);self.assertEqual(json.loads(result[policy.MANIFEST]),[])
        self.assertEqual(result['translated_texts - copy/AB2.txt'],b'keep')
        with self.assertRaises(ValueError):patcher.apply_batch(result,{'items':{'AB1':{'action':'delete'}}},policy)
    def test_published_state_reports_each_part(self):
        state=patcher.published_state(dict(self.files,**{policy.MANIFEST:b'["AB9"]\n'}),['AB1','AB2','AB9'],policy)
        self.assertEqual(state['fields'],FIELDS)
        self.assertEqual(state['items']['AB1'],{'metadata':self.a,'original':b64(b'old'),'english':b64(b'old translation'),'withheld':False})
        self.assertEqual(state['items']['AB2']['original'],None);self.assertEqual(state['items']['AB9'],{'metadata':None,'original':None,'english':None,'withheld':True})
    def test_partial_archive_directory_rewrites_only_changed_shards(self):
        with tempfile.TemporaryDirectory() as temporary:
            full=Path(temporary)/'full';policy.write_archive(full,policy.public_files(self.files))
            partial=Path(temporary)/'partial';partial.mkdir()
            needed={'metadata.tar',policy.shard_name('translated_texts - copy/AB1.txt'),policy.shard_name('original_texts - copy/AB1.txt')}
            for name in needed:(partial/name).write_bytes((full/name).read_bytes())
            files=policy.read_archive(partial,partial=True)
            self.assertEqual(set(files),{'metadata - copy/items.csv',policy.MANIFEST,'original_texts - copy/AB1.txt','translated_texts - copy/AB1.txt'}|({'translated_texts - copy/AB2.txt'} if policy.shard_name('translated_texts - copy/AB2.txt') in needed else set()))
            result=patcher.apply_batch(files,{'items':{'AB1':{'action':'edit','metadata':self.a,'original':b64(b'old'),'english':b64(b'new translation')}}},policy)
            changed=policy.write_shards(partial,result,only=needed)
            self.assertEqual(changed,[policy.shard_name('translated_texts - copy/AB1.txt')])
            self.assertEqual(sorted(p.name for p in partial.iterdir()),sorted(needed))
            with self.assertRaises(ValueError):policy.read_archive(partial)
if __name__=='__main__':unittest.main()
