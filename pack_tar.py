import tarfile
from pathlib import Path

out_dir = Path('out')
archive = Path('meet2-pc-frontend.tar.gz')

if archive.exists():
    archive.unlink()

with tarfile.open(archive, 'w:gz') as tar:
    for item in out_dir.rglob('*'):
        tar.add(item, arcname=item.relative_to(out_dir))
