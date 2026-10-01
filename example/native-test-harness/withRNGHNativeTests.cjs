'use strict';

// Isolated test-copy plugin. It does not add test code to the application target.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  withDangerousMod,
  withPodfile,
  withXcodeProject,
} = require('expo/config-plugins');

const TARGET = 'FluidTabsNativeTests';
const SOURCE = 'RNGHExternalScrollTests.mm';
const SOURCE_SHA256 =
  'e92a872c50b87458d9f66b13b7ec1fb4cc33c7b09039f85287ddf562d8b7333b';
const SOURCES = Object.freeze([
  Object.freeze({ name: SOURCE, sha256: SOURCE_SHA256 }),
  Object.freeze({
    name: 'FTNSScrollCoordinatorTests.mm',
    sha256: 'dbfd5423b7bb1ebcee39ec425014873e48c3c8848cee4c39f1f11d36667704d4',
  }),
  Object.freeze({
    name: 'RCTScrollStopCompletionTests.mm',
    sha256: 'd77bb3efb351f6e08e49c873733bfeb59cb8e3e0db8e2ed6f7b6583f81030c0c',
  }),
]);
const TEST_HEADER_PATHS = Object.freeze([
  '$(inherited)',
  '$(SRCROOT)/../modules/fluid-tabs-native-scroll/ios',
]);
const BEGIN = '# @generated begin fluid-tabs-native-xctest';
const END = '# @generated end fluid-tabs-native-xctest';
const unquote = (value) => String(value ?? '').replace(/^"|"$/g, '');
const quote = (value) => JSON.stringify(String(value));
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char]
  );

function entries(section) {
  return Object.entries(section || {}).filter(
    ([key, value]) =>
      !key.endsWith('_comment') && value && typeof value === 'object'
  );
}

function swiftLanguageVersion(hostSettings, projectSettings) {
  for (const setting of [
    hostSettings.SWIFT_VERSION,
    projectSettings?.SWIFT_VERSION,
  ]) {
    const value = unquote(setting).trim();
    if (!value || value === '$(inherited)' || value === '${inherited}')
      continue;
    if (!/^\d+(?:\.\d+)?$/.test(value))
      throw new Error(
        `Resolve custom host SWIFT_VERSION before using this harness: ${value}`
      );
    return value;
  }
  // The audited BasicExample host uses Swift 5.0; keep that explicit language
  // mode if neither matching host nor project configuration supplies one.
  return '5.0';
}

function isExpoGeneratedProvider(objects, fileId) {
  const file = objects.PBXFileReference[fileId];
  if (
    !file ||
    path.posix.basename(unquote(file.path).replace(/\\/g, '/')) !==
      'ExpoModulesProvider.swift'
  )
    return false;
  // CocoaPods/Expo owns this extra Sources entry. Preserve only the provider
  // under ExpoModulesProviders/<test target>, not arbitrary additional sources.
  return entries(objects.PBXGroup).some(([, group]) => {
    if (unquote(group.name || group.path) !== 'ExpoModulesProviders')
      return false;
    return (group.children || []).some(({ value }) => {
      const targetGroup = objects.PBXGroup[value];
      return (
        targetGroup &&
        unquote(targetGroup.name || targetGroup.path) === TARGET &&
        targetGroup.children.some((child) => child.value === fileId)
      );
    });
  });
}

function inspectExistingSources(objects, root, testId, test, hostId) {
  const fail = () => {
    throw new Error(`Existing ${TARGET} does not match this isolated harness.`);
  };
  const dependencies = (test.dependencies || []).map(
    ({ value }) => objects.PBXTargetDependency?.[value]?.target
  );
  const sourcePhases = (test.buildPhases || [])
    .map(({ value }) => objects.PBXSourcesBuildPhase?.[value])
    .filter(Boolean);
  const groups = entries(objects.PBXGroup).filter(
    ([, group]) => unquote(group.path) === TARGET
  );
  if (
    unquote(test.productType) !== 'com.apple.product-type.bundle.unit-test' ||
    dependencies.length !== 1 ||
    dependencies[0] !== hostId ||
    root.attributes?.TargetAttributes?.[testId]?.TestTargetID !== hostId ||
    sourcePhases.length !== 1 ||
    groups.length !== 1
  )
    fail();
  const [groupId, group] = groups[0];
  if (
    unquote(group.sourceTree) !== '<group>' ||
    (objects.PBXGroup[root.mainGroup]?.children || []).filter(
      ({ value }) => value === groupId
    ).length !== 1
  )
    fail();
  const sourcePhase = sourcePhases[0];
  const fileRefs = (sourcePhase.files || []).map(
    ({ value }) => objects.PBXBuildFile?.[value]?.fileRef
  );
  if (new Set(fileRefs).size !== fileRefs.length || fileRefs.some((id) => !id))
    fail();
  const ownRefs = fileRefs.filter((id) =>
    SOURCES.some(
      (item) => unquote(objects.PBXFileReference?.[id]?.path) === item.name
    )
  );
  const providers = fileRefs.filter((id) =>
    isExpoGeneratedProvider(objects, id)
  );
  const sourceNames = new Set(
    ownRefs.map((id) => unquote(objects.PBXFileReference[id].path))
  );
  if (
    !sourceNames.has(SOURCE) ||
    ![1, SOURCES.length].includes(ownRefs.length) ||
    sourceNames.size !== ownRefs.length ||
    providers.length > 1 ||
    fileRefs.length !== ownRefs.length + providers.length ||
    (group.children || []).length !== ownRefs.length ||
    new Set((group.children || []).map(({ value }) => value)).size !==
      ownRefs.length ||
    (group.children || []).some(({ value }) => !ownRefs.includes(value))
  )
    fail();
  for (const id of ownRefs) {
    const file = objects.PBXFileReference[id];
    if (
      unquote(file.sourceTree) !== '<group>' ||
      file.lastKnownFileType !== 'sourcecode.cpp.objcpp'
    )
      fail();
    const owners = entries(objects.PBXSourcesBuildPhase).filter(([, phase]) =>
      (phase.files || []).some(
        ({ value }) => objects.PBXBuildFile?.[value]?.fileRef === id
      )
    );
    if (owners.length !== 1) fail();
  }
  if (
    entries(objects.PBXFileReference).some(
      ([id, file]) =>
        SOURCES.some((item) => unquote(file.path) === item.name) &&
        !ownRefs.includes(id)
    )
  )
    fail();
  const configs =
    objects.XCConfigurationList[test.buildConfigurationList]
      ?.buildConfigurations || [];
  const host = objects.PBXNativeTarget[hostId];
  const hostConfigs =
    objects.XCConfigurationList[host.buildConfigurationList]
      .buildConfigurations;
  const configNames = configs.map(({ value }) =>
    unquote(objects.XCBuildConfiguration?.[value]?.name)
  );
  const hostNames = hostConfigs.map(({ value }) =>
    unquote(objects.XCBuildConfiguration[value].name)
  );
  if (
    configNames.length !== hostNames.length ||
    new Set(configNames).size !== configNames.length ||
    configNames.some((name) => !hostNames.includes(name))
  )
    fail();
  for (const { value } of configs) {
    const paths =
      objects.XCBuildConfiguration[value].buildSettings.HEADER_SEARCH_PATHS;
    if (paths === undefined) continue;
    const existing = (Array.isArray(paths) ? paths : [paths]).map(unquote);
    if (
      new Set(existing).size !== existing.length ||
      existing.some((item) => !TEST_HEADER_PATHS.includes(item))
    )
      fail();
  }
  return { group, sourcePhase, sourceNames };
}

function addPodfileTarget(contents, hostTargetName) {
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.split(/\r?\n/);
  const hostLines = lines.flatMap((line, index) => {
    const match = line.match(
      /^(\s*)target\s+(['"])([^'"]+)\2\s+do\s*(?:#.*)?$/
    );
    return match && match[3] === hostTargetName
      ? [{ index, indent: match[1] }]
      : [];
  });
  if (hostLines.length !== 1)
    throw new Error(
      `Expected one Podfile host target ${hostTargetName}; found ${hostLines.length}.`
    );
  const { index, indent } = hostLines[0];
  const block = [
    `${indent}  ${BEGIN}`,
    `${indent}  target '${TARGET}' do`,
    `${indent}    inherit! :search_paths`,
    `${indent}  end`,
    `${indent}  ${END}`,
  ];
  if (contents.includes(BEGIN) || contents.includes(END)) {
    if (
      lines.slice(index + 1, index + 1 + block.length).join(newline) !==
        block.join(newline) ||
      contents.split(BEGIN).length !== 2 ||
      contents.split(END).length !== 2
    ) {
      throw new Error(
        'Existing native-test Podfile marker differs from this harness. Inspect instead of overwriting it.'
      );
    }
    return contents;
  }
  if (
    new RegExp(`^\\s*target\\s+['"]${TARGET}['"]\\s+do`, 'm').test(contents)
  ) {
    throw new Error(
      `${TARGET} already exists in Podfile without this harness marker.`
    );
  }
  lines.splice(index + 1, 0, ...block);
  return lines.join(newline);
}

function configureProject(
  project,
  { hostTargetName, bundleIdentifier, deploymentTarget = '16.4' }
) {
  const objects = project.hash.project.objects;
  const root = objects.PBXProject[project.hash.project.rootObject];
  const allTargets = entries(objects.PBXNativeTarget);
  const hosts = allTargets.filter(
    ([, item]) =>
      unquote(item.name) === hostTargetName &&
      unquote(item.productType) === 'com.apple.product-type.application'
  );
  if (hosts.length !== 1)
    throw new Error(
      `Expected one iOS application target ${hostTargetName}; found ${hosts.length}.`
    );
  if (!/^\d+(?:\.\d+){0,2}$/.test(deploymentTarget))
    throw new Error('deploymentTarget must be an explicit version.');
  if (!bundleIdentifier || !/^[A-Za-z0-9.-]+$/.test(bundleIdentifier))
    throw new Error('A concrete test bundle identifier is required.');
  const [hostId, host] = hosts[0];
  const hostProduct = unquote(
    objects.PBXFileReference[host.productReference].path
  );
  if (!hostProduct.endsWith('.app') || hostProduct.includes('$'))
    throw new Error('Expected a concrete host .app product path.');
  const hostConfigs = objects.XCConfigurationList[
    host.buildConfigurationList
  ].buildConfigurations.map(({ value }) => objects.XCBuildConfiguration[value]);
  const projectConfigs = objects.XCConfigurationList[
    root.buildConfigurationList
  ].buildConfigurations.map(({ value }) => objects.XCBuildConfiguration[value]);
  if (!hostConfigs.some((item) => unquote(item.name) === 'Debug'))
    throw new Error('Host has no Debug build configuration.');
  // Resolve host settings before adding any target/source objects.
  for (const item of hostConfigs) {
    const projectConfig = projectConfigs.find(
      (candidate) => unquote(candidate.name) === unquote(item.name)
    );
    swiftLanguageVersion(item.buildSettings, projectConfig?.buildSettings);
    const productName = unquote(
      item.buildSettings.PRODUCT_NAME || host.productName || hostTargetName
    ).replace(/\$\(TARGET_NAME\)/g, hostTargetName);
    const executableName = unquote(
      item.buildSettings.EXECUTABLE_NAME || productName
    );
    if (executableName.includes('$') || executableName.includes('/'))
      throw new Error(
        'Resolve custom host EXECUTABLE_NAME before using this harness.'
      );
  }

  function insert(sectionName, object, comment) {
    const id = project.generateUuid();
    const section = objects[sectionName] || (objects[sectionName] = {});
    section[id] = object;
    section[`${id}_comment`] = comment;
    return id;
  }

  const existing = allTargets.filter(
    ([, item]) => unquote(item.name) === TARGET
  );
  if (existing.length > 1) throw new Error(`Duplicate ${TARGET} targets.`);
  if (
    existing.length &&
    (host.dependencies || []).some(
      ({ value }) =>
        objects.PBXTargetDependency?.[value]?.target === existing[0][0]
    )
  ) {
    throw new Error(
      'Host depends on unit tests: this creates a hosted-test dependency cycle.'
    );
  }
  let testId;
  let test;
  if (existing.length) {
    [testId, test] = existing[0];
    const owned = inspectExistingSources(objects, root, testId, test, hostId);
    for (const item of SOURCES) {
      if (owned.sourceNames.has(item.name)) continue;
      const sourceId = insert(
        'PBXFileReference',
        {
          isa: 'PBXFileReference',
          lastKnownFileType: 'sourcecode.cpp.objcpp',
          path: item.name,
          sourceTree: quote('<group>'),
        },
        item.name
      );
      owned.group.children.push({ value: sourceId, comment: item.name });
      const sourceBuildId = insert(
        'PBXBuildFile',
        {
          isa: 'PBXBuildFile',
          fileRef: sourceId,
          fileRef_comment: item.name,
        },
        `${item.name} in Sources`
      );
      owned.sourcePhase.files.push({
        value: sourceBuildId,
        comment: `${item.name} in Sources`,
      });
    }
  } else {
    if (
      entries(objects.PBXGroup).some(
        ([, item]) => unquote(item.path) === TARGET
      )
    ) {
      throw new Error(`Unowned ${TARGET} source group already exists.`);
    }
    if (
      entries(objects.PBXFileReference).some(([, item]) =>
        SOURCES.some((source) => unquote(item.path) === source.name)
      )
    ) {
      throw new Error('Unowned native-test source reference already exists.');
    }
    const sourceIds = SOURCES.map((item) => ({
      item,
      id: insert(
        'PBXFileReference',
        {
          isa: 'PBXFileReference',
          lastKnownFileType: 'sourcecode.cpp.objcpp',
          path: item.name,
          sourceTree: quote('<group>'),
        },
        item.name
      ),
    }));
    const groupId = insert(
      'PBXGroup',
      {
        isa: 'PBXGroup',
        children: sourceIds.map(({ item, id }) => ({
          value: id,
          comment: item.name,
        })),
        path: TARGET,
        sourceTree: quote('<group>'),
      },
      TARGET
    );
    objects.PBXGroup[root.mainGroup].children.push({
      value: groupId,
      comment: TARGET,
    });
    const productId = insert(
      'PBXFileReference',
      {
        isa: 'PBXFileReference',
        explicitFileType: 'wrapper.cfbundle',
        includeInIndex: 0,
        path: `${TARGET}.xctest`,
        sourceTree: 'BUILT_PRODUCTS_DIR',
      },
      `${TARGET}.xctest`
    );
    const productsGroup = objects.PBXGroup[root.productRefGroup];
    if (!productsGroup) throw new Error('Expected Xcode Products group.');
    productsGroup.children.push({
      value: productId,
      comment: `${TARGET}.xctest`,
    });
    const sourceBuilds = sourceIds.map(({ item, id }) => ({
      value: insert(
        'PBXBuildFile',
        {
          isa: 'PBXBuildFile',
          fileRef: id,
          fileRef_comment: item.name,
        },
        `${item.name} in Sources`
      ),
      comment: `${item.name} in Sources`,
    }));
    const phases = ['Sources', 'Frameworks', 'Resources'].map((name) => {
      const id = insert(
        `PBX${name}BuildPhase`,
        {
          isa: `PBX${name}BuildPhase`,
          buildActionMask: 2147483647,
          files: name === 'Sources' ? sourceBuilds : [],
          runOnlyForDeploymentPostprocessing: 0,
        },
        name
      );
      return { value: id, comment: name };
    });
    const configIds = hostConfigs.map((item) => {
      const name = unquote(item.name);
      return {
        value: insert(
          'XCBuildConfiguration',
          { isa: 'XCBuildConfiguration', buildSettings: {}, name },
          name
        ),
        comment: name,
      };
    });
    const configListId = insert(
      'XCConfigurationList',
      {
        isa: 'XCConfigurationList',
        buildConfigurations: configIds,
        defaultConfigurationIsVisible: 0,
        defaultConfigurationName: 'Release',
      },
      `Build configuration list for PBXNativeTarget "${TARGET}"`
    );
    const proxyId = insert(
      'PBXContainerItemProxy',
      {
        isa: 'PBXContainerItemProxy',
        containerPortal: project.hash.project.rootObject,
        containerPortal_comment: 'Project object',
        proxyType: 1,
        remoteGlobalIDString: hostId,
        remoteInfo: host.name,
      },
      'PBXContainerItemProxy'
    );
    const dependencyId = insert(
      'PBXTargetDependency',
      {
        isa: 'PBXTargetDependency',
        target: hostId,
        target_comment: hostTargetName,
        targetProxy: proxyId,
        targetProxy_comment: 'PBXContainerItemProxy',
      },
      'PBXTargetDependency'
    );
    test = {
      isa: 'PBXNativeTarget',
      buildConfigurationList: configListId,
      buildConfigurationList_comment: `Build configuration list for PBXNativeTarget "${TARGET}"`,
      buildPhases: phases,
      buildRules: [],
      dependencies: [{ value: dependencyId, comment: 'PBXTargetDependency' }],
      name: TARGET,
      productName: TARGET,
      productReference: productId,
      productReference_comment: `${TARGET}.xctest`,
      productType: quote('com.apple.product-type.bundle.unit-test'),
    };
    testId = insert('PBXNativeTarget', test, TARGET);
    root.targets.push({ value: testId, comment: TARGET });
    root.attributes ||= {};
    root.attributes.TargetAttributes ||= {};
    root.attributes.TargetAttributes[testId] = { TestTargetID: hostId };
  }

  for (const { value } of objects.XCConfigurationList[
    test.buildConfigurationList
  ].buildConfigurations) {
    const config = objects.XCBuildConfiguration[value];
    const hostConfig = hostConfigs.find(
      (item) => unquote(item.name) === unquote(config.name)
    );
    if (!hostConfig)
      throw new Error(`No matching host configuration ${config.name}.`);
    const projectConfig = projectConfigs.find(
      (item) => unquote(item.name) === unquote(config.name)
    );
    const settings = hostConfig.buildSettings;
    const productName = unquote(
      settings.PRODUCT_NAME || host.productName || hostTargetName
    ).replace(/\$\(TARGET_NAME\)/g, hostTargetName);
    const executableName = unquote(settings.EXECUTABLE_NAME || productName);
    if (executableName.includes('$') || executableName.includes('/'))
      throw new Error(
        'Resolve custom host EXECUTABLE_NAME before using this harness.'
      );
    Object.assign(config.buildSettings, {
      BUNDLE_LOADER: quote('$(TEST_HOST)'),
      CLANG_ENABLE_MODULES: 'YES',
      CLANG_ENABLE_OBJC_ARC: 'YES',
      CLANG_CXX_LANGUAGE_STANDARD: quote('c++20'),
      ENABLE_TESTING_SEARCH_PATHS: 'YES',
      GENERATE_INFOPLIST_FILE: 'YES',
      IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
      HEADER_SEARCH_PATHS: TEST_HEADER_PATHS.map(quote),
      LD_RUNPATH_SEARCH_PATHS: [
        quote('$(inherited)'),
        quote('@executable_path/Frameworks'),
        quote('@loader_path/Frameworks'),
      ],
      OTHER_LDFLAGS: [
        quote('$(inherited)'),
        quote('-framework'),
        quote('XCTest'),
      ],
      PRODUCT_BUNDLE_IDENTIFIER: bundleIdentifier,
      PRODUCT_NAME: quote('$(TARGET_NAME)'),
      SDKROOT: 'iphoneos',
      SKIP_INSTALL: 'YES',
      SUPPORTED_PLATFORMS: quote('iphoneos iphonesimulator'),
      SWIFT_VERSION: swiftLanguageVersion(
        settings,
        projectConfig?.buildSettings
      ),
      TARGETED_DEVICE_FAMILY: settings.TARGETED_DEVICE_FAMILY || quote('1,2'),
      TEST_HOST: quote(
        `$(BUILT_PRODUCTS_DIR)/${hostProduct}/${executableName}`
      ),
    });
    delete config.buildSettings.INFOPLIST_FILE;
  }
  if (
    (host.dependencies || []).some(
      ({ value }) => objects.PBXTargetDependency?.[value]?.target === testId
    )
  ) {
    throw new Error(
      'Host depends on unit tests: this creates a hosted-test dependency cycle.'
    );
  }
  return { testId, hostId, hostProduct, hostTargetName };
}

function makeScheme(info, projectName) {
  const ref = (id, product, name) =>
    `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${xml(id)}" BuildableName="${xml(product)}" BlueprintName="${xml(name)}" ReferencedContainer="container:${xml(projectName)}.xcodeproj"/>`;
  const hostRef = ref(info.hostId, info.hostProduct, info.hostTargetName);
  const testRef = ref(info.testId, `${TARGET}.xctest`, TARGET);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme version="1.3">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
    <BuildActionEntries>
      <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${hostRef}</BuildActionEntry>
      <BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${testRef}</BuildActionEntry>
    </BuildActionEntries>
  </BuildAction>
  <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES">
    <MacroExpansion>${hostRef}</MacroExpansion>
    <Testables><TestableReference skipped="NO" parallelizable="NO">${testRef}</TestableReference></Testables>
  </TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO">
    <BuildableProductRunnable runnableDebuggingMode="0">${hostRef}</BuildableProductRunnable>
  </LaunchAction>
  <AnalyzeAction buildConfiguration="Debug"/>
</Scheme>
`;
}

function copyTestSources(iosRoot, sourceRoot = __dirname) {
  const sha256 = (bytes) =>
    crypto.createHash('sha256').update(bytes).digest('hex');
  const outputDir = path.join(iosRoot, TARGET);
  if (
    fs.existsSync(outputDir) &&
    (!fs.lstatSync(outputDir).isDirectory() ||
      fs.lstatSync(outputDir).isSymbolicLink())
  ) {
    throw new Error('Native-test output directory has wrong ownership/type.');
  }
  if (
    fs.existsSync(outputDir) &&
    fs
      .readdirSync(outputDir)
      .some((name) => !SOURCES.some((item) => item.name === name))
  ) {
    throw new Error('Native-test output directory contains unowned files.');
  }
  // Validate every input and existing output before creating/writing any output.
  const plan = SOURCES.map((item) => {
    const input = path.join(sourceRoot, item.name);
    if (!fs.lstatSync(input).isFile() || fs.lstatSync(input).isSymbolicLink())
      throw new Error(`Invalid XCTest input: ${item.name}`);
    const bytes = fs.readFileSync(input);
    if (sha256(bytes) !== item.sha256)
      throw new Error(`XCTest input differs from audited source: ${item.name}`);
    const output = path.join(outputDir, item.name);
    const present =
      fs.existsSync(outputDir) && fs.readdirSync(outputDir).includes(item.name);
    if (
      present &&
      (!fs.lstatSync(output).isFile() ||
        fs.lstatSync(output).isSymbolicLink() ||
        sha256(fs.readFileSync(output)) !== item.sha256)
    )
      throw new Error(`Unowned XCTest output: ${item.name}`);
    return { output, bytes, exists: present };
  });
  fs.mkdirSync(outputDir, { recursive: true });
  for (const item of plan) {
    if (item.exists) continue;
    const temporary = `${item.output}.fluid-tests-v2-${process.pid}.tmp`;
    if (fs.existsSync(temporary))
      throw new Error(
        'Stale native-test temporary output; inspect before retry.'
      );
    fs.writeFileSync(temporary, item.bytes, { flag: 'wx' });
    fs.renameSync(temporary, item.output);
  }
}

function withRNGHNativeTests(config, options = {}) {
  const hostTargetName =
    options.hostTargetName || 'CollapsibleFluidTabsExample';
  const bundleIdentifier =
    options.bundleIdentifier || `${config.ios?.bundleIdentifier}.native-tests`;
  if (!config.ios?.bundleIdentifier && !options.bundleIdentifier)
    throw new Error('An iOS bundleIdentifier is required.');
  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      copyTestSources(mod.modRequest.platformProjectRoot);
      return mod;
    },
  ]);
  config = withPodfile(config, (mod) => {
    mod.modResults.contents = addPodfileTarget(
      mod.modResults.contents,
      hostTargetName
    );
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    const info = configureProject(mod.modResults, {
      ...options,
      hostTargetName,
      bundleIdentifier,
    });
    const projectName = mod.modRequest.projectName;
    if (!projectName || /[/\\]/.test(projectName))
      throw new Error('Expected Expo projectName path component.');
    const schemeDir = path.join(
      mod.modRequest.platformProjectRoot,
      `${projectName}.xcodeproj`,
      'xcshareddata',
      'xcschemes'
    );
    fs.mkdirSync(schemeDir, { recursive: true });
    fs.writeFileSync(
      path.join(schemeDir, `${TARGET}.xcscheme`),
      makeScheme(info, projectName)
    );
    return mod;
  });
}

module.exports = withRNGHNativeTests;
module.exports._test = {
  addPodfileTarget,
  configureProject,
  makeScheme,
  copyTestSources,
  inspectExistingSources,
  SOURCE_SHA256,
  TARGET,
  SOURCE,
  SOURCES,
  TEST_HEADER_PATHS,
};
