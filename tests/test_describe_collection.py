import importlib.util, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('describe','%s/scripts/describe-collection-update.py'%ROOT)
describe=importlib.util.module_from_spec(spec);spec.loader.exec_module(describe)
def csv(*rows): return ('PIN,Title,Manuscripts\n'+''.join(r+'\n' for r in rows)).encode()
class DescribeCollection(unittest.TestCase):
    def test_lists_changes_by_catalog_id(self):
        old={'metadata - copy/items.csv':csv('AB1,First,M','AB2,Second,M','AB3,Third,M'),
             'original_texts - copy/AB1.txt':b'one','translated_texts - copy/AB1.txt':b'one','translated_texts - copy/AB3.txt':b'three'}
        new={'metadata - copy/items.csv':csv('AB1,First (revised),M','AB2,Second,M','AB4,Fourth,M'),
             'original_texts - copy/AB1.txt':b'one','translated_texts - copy/AB1.txt':b'one, corrected','translated_texts - copy/AB4.txt':b'four'}
        text=describe.describe(old,new,{'records':3,'original':1,'english':2,'pairs':1,'metadataOnly':1})
        self.assertIn('- English translations added (1): `AB4`',text)
        self.assertIn('- English translations changed (1): `AB1`',text)
        self.assertIn('- English translations removed (1): `AB3`',text)
        self.assertIn('- Metadata rows changed (1): `AB1 (Title)`',text)
        self.assertIn('- Metadata rows added (1): `AB4`',text)
        self.assertIn('- Metadata rows removed (1): `AB3`',text)
        self.assertNotIn('Original texts',text)
        self.assertIn('The tested build has 3 records',text)
        self.assertIn('No catalog texts or metadata changed',describe.describe(old,old))
if __name__=='__main__': unittest.main()
