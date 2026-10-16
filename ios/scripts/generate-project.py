"""Deterministic Xcode project; no CocoaPods, XcodeGen, or external packages."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / 'PartialInventory.xcodeproj'
objects = {}

def oid(name): return hashlib.sha1(name.encode()).hexdigest()[:24].upper()
def q(value): return json.dumps(str(value))
def add(key, isa, **fields):
    objects[oid(key)] = 'isa = '+isa+'; ' + ' '.join(k+' = '+v+';' for k,v in fields.items())
    return oid(key)
def arr(values): return '(' + ', '.join(values) + (',' if values else '') + ')'
def dictionary(values): return '{'+' '.join(k+' = '+q(v)+';' for k,v in values.items())+'}'

app_sources = sorted(p.name for p in (ROOT/'PartialInventory').glob('*.swift'))
for folder,names in [('PartialInventory',app_sources),('PartialInventoryTests',['OfflineReaderTests.swift']),('PartialInventoryUITests',['ReaderUITests.swift'])]:
    refs=[]; builds=[]
    for name in names:
        key=folder+'/'+name
        refs.append(add(key,'PBXFileReference',lastKnownFileType='sourcecode.swift',path=q(name),sourceTree=q('<group>')))
        builds.append(add('build/'+key,'PBXBuildFile',fileRef=oid(key)))
    if folder=='PartialInventory':
        for name,kind in [('Info.plist','text.plist.xml'),('PrivacyInfo.xcprivacy','text.xml'),('Assets.xcassets','folder.assetcatalog'),('Website','folder')]:
            key=folder+'/'+name
            refs.append(add(key,'PBXFileReference',lastKnownFileType=kind,path=q(name),sourceTree=q('<group>')))
            if name!='Info.plist': add('build/'+key,'PBXBuildFile',fileRef=oid(key))
    add('group/'+folder,'PBXGroup',children=arr(refs),path=q(folder),sourceTree=q('<group>'))
    add('sources/'+folder,'PBXSourcesBuildPhase',buildActionMask='2147483647',files=arr(builds),runOnlyForDeploymentPostprocessing='0')
    add('frameworks/'+folder,'PBXFrameworksBuildPhase',buildActionMask='2147483647',files='()',runOnlyForDeploymentPostprocessing='0')
    resources=[oid('build/PartialInventory/'+n) for n in ['PrivacyInfo.xcprivacy','Assets.xcassets','Website']] if folder=='PartialInventory' else []
    add('resources/'+folder,'PBXResourcesBuildPhase',buildActionMask='2147483647',files=arr(resources),runOnlyForDeploymentPostprocessing='0')
    product=folder+('.app' if folder=='PartialInventory' else '.xctest')
    add('product/'+folder,'PBXFileReference',explicitFileType='wrapper.application' if folder=='PartialInventory' else 'wrapper.cfbundle',includeInIndex='0',path=q(product),sourceTree='BUILT_PRODUCTS_DIR')
    dependencies=[]
    if folder!='PartialInventory':
        proxy=add('proxy/'+folder,'PBXContainerItemProxy',containerPortal=oid('project'),proxyType='1',remoteGlobalIDString=oid('target/PartialInventory'),remoteInfo='PartialInventory')
        dependencies=[add('dependency/'+folder,'PBXTargetDependency',target=oid('target/PartialInventory'),targetProxy=proxy)]
    for config in ['Debug','Release']:
        settings={'PRODUCT_NAME':'$(TARGET_NAME)','SWIFT_VERSION':'5.0','IPHONEOS_DEPLOYMENT_TARGET':'17.0','TARGETED_DEVICE_FAMILY':'1,2','CODE_SIGN_STYLE':'Automatic','GENERATE_INFOPLIST_FILE':'YES','PRODUCT_BUNDLE_IDENTIFIER':'org.partialinventory.reader'+('' if folder=='PartialInventory' else '.'+folder),'SWIFT_EMIT_LOC_STRINGS':'YES'}
        if folder=='PartialInventory': settings.update({'GENERATE_INFOPLIST_FILE':'NO','INFOPLIST_FILE':'PartialInventory/Info.plist','ASSETCATALOG_COMPILER_APPICON_NAME':'AppIcon','MARKETING_VERSION':'1.0','CURRENT_PROJECT_VERSION':'1','LD_RUNPATH_SEARCH_PATHS':'$(inherited) @executable_path/Frameworks','SUPPORTS_MACCATALYST':'NO','SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD':'NO'})
        elif folder=='PartialInventoryTests': settings.update({'TEST_HOST':'$(BUILT_PRODUCTS_DIR)/PartialInventory.app/PartialInventory','BUNDLE_LOADER':'$(TEST_HOST)'})
        else: settings.update({'TEST_TARGET_NAME':'PartialInventory'})
        add('config/'+folder+'/'+config,'XCBuildConfiguration',buildSettings=dictionary(settings),name=config)
    configs=add('configs/'+folder,'XCConfigurationList',buildConfigurations=arr([oid('config/'+folder+'/'+x) for x in ['Debug','Release']]),defaultConfigurationIsVisible='0',defaultConfigurationName='Release')
    add('target/'+folder,'PBXNativeTarget',buildConfigurationList=configs,buildPhases=arr([oid(x+'/'+folder) for x in ['sources','frameworks','resources']]),buildRules='()',dependencies=arr(dependencies),name=q(folder),productName=q(folder),productReference=oid('product/'+folder),productType=q('com.apple.product-type.application' if folder=='PartialInventory' else ('com.apple.product-type.bundle.unit-test' if folder=='PartialInventoryTests' else 'com.apple.product-type.bundle.ui-testing')))

targets=['PartialInventory','PartialInventoryTests','PartialInventoryUITests']
add('products','PBXGroup',children=arr([oid('product/'+x) for x in targets]),name='Products',sourceTree=q('<group>'))
add('main','PBXGroup',children=arr([oid('group/'+x) for x in targets]+[oid('products')]),sourceTree=q('<group>'))
for config in ['Debug','Release']:
    settings={'SDKROOT':'iphoneos','CLANG_ENABLE_MODULES':'YES','CLANG_ENABLE_OBJC_ARC':'YES','SWIFT_OPTIMIZATION_LEVEL':'-Onone' if config=='Debug' else '-O','DEBUG_INFORMATION_FORMAT':'dwarf' if config=='Debug' else 'dwarf-with-dsym','ENABLE_TESTABILITY':'YES' if config=='Debug' else 'NO','ONLY_ACTIVE_ARCH':'YES' if config=='Debug' else 'NO','SWIFT_ACTIVE_COMPILATION_CONDITIONS':'DEBUG' if config=='Debug' else ''}
    add('projectconfig/'+config,'XCBuildConfiguration',buildSettings=dictionary(settings),name=config)
add('projectconfigs','XCConfigurationList',buildConfigurations=arr([oid('projectconfig/'+x) for x in ['Debug','Release']]),defaultConfigurationIsVisible='0',defaultConfigurationName='Release')
add('project','PBXProject',attributes='{BuildIndependentTargetsInParallel = YES; LastUpgradeCheck = 1600;}',buildConfigurationList=oid('projectconfigs'),compatibilityVersion=q('Xcode 14.0'),developmentRegion='en',hasScannedForEncodings='0',knownRegions='(en, Base)',mainGroup=oid('main'),productRefGroup=oid('products'),projectDirPath=q(''),projectRoot=q(''),targets=arr([oid('target/'+x) for x in targets]))
PROJECT.mkdir(exist_ok=True)
(PROJECT/'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(k+' = {'+v+'};' for k,v in objects.items())+'\n}; rootObject = '+oid('project')+'; }\n',encoding='utf-8')
def reference(target): return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{oid("target/"+target)}" BuildableName="{target}{".app" if target=="PartialInventory" else ".xctest"}" BlueprintName="{target}" ReferencedContainer="container:PartialInventory.xcodeproj"/>'
scheme=PROJECT/'xcshareddata/xcschemes'; scheme.mkdir(parents=True,exist_ok=True)
(scheme/'PartialInventory.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
 <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference('PartialInventory')}</BuildActionEntry></BuildActionEntries></BuildAction>
 <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables>{''.join('<TestableReference skipped="NO">'+reference(t)+'</TestableReference>' for t in targets[1:])}</Testables></TestAction>
 <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference('PartialInventory')}</BuildableProductRunnable></LaunchAction>
 <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference('PartialInventory')}</BuildableProductRunnable></ProfileAction>
 <AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''',encoding='utf-8')
print(PROJECT)
