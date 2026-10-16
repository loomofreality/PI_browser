"""macOS CI only. Secrets are read from environment and never printed."""
import base64
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys

root = Path(os.environ['RUNNER_TEMP']) / 'pi-ios-signing'
keychain = root / 'build.keychain-db'

def value(name, pattern=None):
    result = os.environ.get(name, '')
    if not result or (pattern and not re.fullmatch(pattern, result)):
        raise SystemExit('Missing or invalid configuration: ' + name)
    return result

def run(*args):
    # CalledProcessError includes the command arguments, which may contain passwords.
    try:
        subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError as error:
        raise SystemExit(f'{args[0]} {args[1]} failed (exit {error.returncode}); check the signing configuration.') from None

mode = sys.argv[1]
if mode == 'prepare':
    root.mkdir(parents=True, exist_ok=True)
    certificate = root / 'distribution.p12'
    certificate.write_bytes(base64.b64decode(value('CERTIFICATE_BASE64'), validate=True))
    profile = root / 'profile.mobileprovision'
    profile.write_bytes(base64.b64decode(value('PROFILE_BASE64'), validate=True))
    (root/'AuthKey.p8').write_text(value('ASC_PRIVATE_KEY'))
    profile_data = plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(profile)]))
    profile_id = profile_data['UUID']
    if not re.fullmatch(r'[A-Fa-f0-9-]+',profile_id): raise SystemExit('Invalid profile UUID')
    profiles = Path.home()/'Library/MobileDevice/Provisioning Profiles'
    profiles.mkdir(parents=True,exist_ok=True)
    installed = profiles/(profile_id+'.mobileprovision')
    installed.write_bytes(profile.read_bytes())
    (root/'installed-profile.txt').write_text(str(installed))
    password=value('KEYCHAIN_PASSWORD')
    run('security','create-keychain','-p',password,str(keychain))
    run('security','set-keychain-settings','-lut','21600',str(keychain))
    run('security','unlock-keychain','-p',password,str(keychain))
    run('security','import',str(certificate),'-P',value('CERTIFICATE_PASSWORD'),'-A','-t','cert','-f','pkcs12','-k',str(keychain))
    run('security','set-key-partition-list','-S','apple-tool:,apple:','-k',password,str(keychain))
    run('security','list-keychains','-d','user','-s',str(keychain))
elif mode == 'upload':
    team=value('TEAM_ID',r'[A-Z0-9]{10}'); bundle=value('BUNDLE_ID',r'[A-Za-z0-9.-]+')
    version=value('APP_VERSION',r'\d+\.\d+(?:\.\d+)?'); build=value('BUILD_NUMBER',r'\d+(?:\.\d+){0,2}')
    profile=value('PROFILE_NAME'); key=value('ASC_KEY_ID',r'[A-Za-z0-9]+'); issuer=value('ASC_ISSUER_ID',r'[A-Fa-f0-9-]+')
    archive=str(root/'PartialInventory.xcarchive')
    subprocess.run(['xcodebuild','-project','ios/PartialInventory.xcodeproj','-scheme','PartialInventory','-configuration','Release','-destination','generic/platform=iOS','-archivePath',archive,'archive','CODE_SIGN_STYLE=Manual','CODE_SIGN_IDENTITY=Apple Distribution','DEVELOPMENT_TEAM='+team,'PRODUCT_BUNDLE_IDENTIFIER='+bundle,'PROVISIONING_PROFILE_SPECIFIER='+profile,'MARKETING_VERSION='+version,'CURRENT_PROJECT_VERSION='+build],check=True)
    options={'method':'app-store-connect','destination':'upload','teamID':team,'signingStyle':'manual','signingCertificate':'Apple Distribution','provisioningProfiles':{bundle:profile},'manageAppVersionAndBuildNumber':False,'uploadSymbols':True}
    plist=root/'ExportOptions.plist'; plist.write_bytes(plistlib.dumps(options))
    subprocess.run(['xcodebuild','-exportArchive','-archivePath',archive,'-exportOptionsPlist',str(plist),'-exportPath',str(root/'export'),'-authenticationKeyPath',str(root/'AuthKey.p8'),'-authenticationKeyID',key,'-authenticationKeyIssuerID',issuer],check=True)
elif mode == 'cleanup':
    if keychain.exists(): subprocess.run(['security','delete-keychain',str(keychain)],check=False,stdout=subprocess.DEVNULL)
    pointer=root/'installed-profile.txt'
    if pointer.exists():
        installed=Path(pointer.read_text()).resolve()
        expected=(Path.home()/'Library/MobileDevice/Provisioning Profiles').resolve()
        if installed.parent==expected: installed.unlink(missing_ok=True)
    for name in ['distribution.p12','profile.mobileprovision','AuthKey.p8','installed-profile.txt']:
        (root/name).unlink(missing_ok=True)
else: raise SystemExit('Expected prepare, upload or cleanup')
