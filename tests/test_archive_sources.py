import importlib.util
import io
import csv
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('archive_sources', Path(__file__).resolve().parents[1] / 'scripts/archive-sources.py')
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)

class PublicationArchiveTests(unittest.TestCase):
    def test_filters_originals_and_incipits_preserving_translations_and_ids(self):
        text = io.StringIO(newline='')
        writer = csv.writer(text)
        writer.writerow(['PIN', 'Manuscripts', 'Publications', 'First line (original)'])
        writer.writerows([['BLOCK', ' , ', '', 'PRIVATE'], ['ALLOW', '', '<a href="https://example.org/a,b">a,b</a>', 'PUBLIC']])
        files = {'metadata - copy/catalog.csv': text.getvalue().encode(),
                 'original_texts - copy/BLOCK.txt': b'PRIVATE',
                 'original_texts - copy/UNKNOWN.txt': b'PRIVATE',
                 'original_texts - copy/ALLOW.txt': b'PUBLIC',
                 'translated_texts - copy/BLOCK.txt': b'English\r\n'}
        result = archive.public_files(files)
        self.assertNotIn('original_texts - copy/BLOCK.txt', result)
        self.assertNotIn('original_texts - copy/UNKNOWN.txt', result)
        self.assertEqual(result['original_texts - copy/ALLOW.txt'], b'PUBLIC')
        self.assertEqual(result['translated_texts - copy/BLOCK.txt'], b'English\r\n')
        self.assertNotIn(b'PRIVATE', result['metadata - copy/catalog.csv'])
        self.assertEqual(json.loads(result[archive.MANIFEST]), ['BLOCK', 'UNKNOWN'])
        self.assertEqual(archive.public_files(result), result)
        self.assertEqual(files['original_texts - copy/BLOCK.txt'], b'PRIVATE')

    def test_missing_policy_columns_and_duplicate_ids_fail_closed(self):
        for data in (b'PIN\nA\n', b'PIN,Manuscripts,Publications\nA,,\nA,,\n'):
            with self.assertRaises(ValueError): archive.public_files({'metadata - copy/catalog.csv': data})

    def test_sharded_archive_is_deterministic_and_rewrites_only_changed_shards(self):
        import tempfile
        files = {'metadata - copy/catalog.csv': b'PIN,Manuscripts,Publications\nA,M,\n',
                 archive.MANIFEST: b'[]\n',
                 'original_texts - copy/A.txt': b'original',
                 'translated_texts - copy/A.txt': b'english',
                 'translated_texts - copy/B.txt': b'other'}
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'collection'
            self.assertEqual(archive.write_archive(target, files), len(archive.shard_names()))
            self.assertEqual(sorted(p.name for p in target.iterdir()), sorted(archive.shard_names()))
            self.assertEqual(archive.read_archive(target), files)
            before = {p.name: p.read_bytes() for p in target.iterdir()}
            self.assertEqual(archive.write_archive(target, files), 0)
            changed = dict(files); changed['translated_texts - copy/A.txt'] = b'corrected'
            self.assertEqual(archive.write_archive(target, changed), 1)
            after = {p.name: p.read_bytes() for p in target.iterdir()}
            self.assertEqual([n for n in before if before[n] != after[n]], [archive.shard_name('translated_texts - copy/A.txt')])
            (target / 'stray.tar').write_bytes(b'')
            with self.assertRaises(ValueError): archive.read_archive(target)

if __name__ == '__main__': unittest.main()
