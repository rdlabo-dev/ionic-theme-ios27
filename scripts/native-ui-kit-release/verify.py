"""Exercise Central bundle signing locally; never contact a publishing service."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[2]
version = json.loads((root / 'packages/capacitor-native-ui-kit/package.json').read_text())['version']
release = root / 'packages/capacitor-native-ui-kit/android'
gradle = [str(release / 'gradlew'), '-p', str(release), '--console=plain']
archive = release / f'build/distributions/native-ui-kit-{version}-central.zip'

with tempfile.TemporaryDirectory(prefix='kit-central-test-') as home:
    gpg = ['gpg', '--homedir', home, '--batch', '--pinentry-mode', 'loopback', '--passphrase', '']
    subprocess.run(gpg + ['--quick-generate-key', 'Local verification <test@example.invalid>',
                         'rsa2048', 'sign', '1d'], check=True, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL)
    key = subprocess.check_output(gpg + ['--armor', '--export-secret-keys'],
                                  stderr=subprocess.DEVNULL).decode()
    env = dict(os.environ, MAVEN_SIGNING_KEY=key, MAVEN_SIGNING_PASSWORD='')
    try:
        subprocess.run(gradle + ['-PsignRelease', 'centralBundle'], cwd=root, env=env, check=True)
        base = f'io/github/rdlabo/native-ui-kit/{version}/native-ui-kit-{version}'
        required = [base + suffix for suffix in
                    ['.aar', '.pom', '.module', '-sources.jar', '-javadoc.jar']]
        with zipfile.ZipFile(archive) as bundle:
            names = bundle.namelist()
            for name in required:
                assert name in names and name + '.asc' in names, name
                for algorithm in ['sha1', 'md5']:
                    expected = hashlib.new(algorithm, bundle.read(name)).hexdigest()
                    assert bundle.read(name + '.' + algorithm).decode().strip() == expected, name
                # Verify the exact archived bytes, not a different staging file.
                artifact = Path(home) / Path(name).name
                artifact.write_bytes(bundle.read(name))
                signature = Path(str(artifact) + '.asc')
                signature.write_bytes(bundle.read(name + '.asc'))
                subprocess.run(['gpg', '--homedir', home, '--verify', str(signature), str(artifact)],
                               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print('Verified all five published artifact signatures and checksums.')
    finally:
        # The test-key bundle must never be mistaken for a real release candidate.
        archive.unlink(missing_ok=True)
