const fs = require('fs-extra');
const { resolve: resolvePath } = require('path');
const Templater = require('./Templater');

async function applyProjectReferences(type, tr, { packages }) {
  if (type === 'none') {
    return;
  } else if (type === 'incremental') {
    await tr.modJson('tsconfig.base.json', (config) => {
      config.compilerOptions.incremental = true;
    });
    return;
  }

  const spreadComposite = type === 'spread-composite';

  await tr.modJson('tsconfig.base.json', (config) => {
    if (!spreadComposite) {
      config.compilerOptions.composite = true;
    }
  });

  await tr.modJson('tsconfig.json', (config) => {
    config.compilerOptions.composite = true;
    config.references = packages
      .map((pkg) => ({
        path: `./packages/${pkg.name}/tsconfig.json`,
      }))
      .concat({
        path: './packages/main/tsconfig.json',
      });
  });
  await tr.modJson('packages/main/tsconfig.json', (config) => {
    if (spreadComposite) {
      config.compilerOptions.composite = true;
    }
    config.references = packages.map((pkg) => ({
      path: `../${pkg.name}/tsconfig.json`,
    }));
  });
  await tr.modJson('packages/main/tsconfig.build.json', (config) => {
    if (spreadComposite) {
      config.compilerOptions.composite = true;
    }
    config.references = packages.map((pkg) => ({
      path: `../${pkg.name}/tsconfig.build.json`,
    }));
  });

  for (const { name } of packages) {
    await tr.modJson(`packages/${name}/package.json`, (pkg) => {
      pkg.main = 'dist/src/index.js';
      if (pkg.types && pkg.types.startsWith('dist/')) {
        pkg.types = 'dist/src/index.d.ts';
      }
    });
    await tr.modJson(`packages/${name}/tsconfig.json`, (config) => {
      if (spreadComposite) {
        config.compilerOptions.composite = true;
      }
    });
  }
}

async function applyLintStrategy(lintStrategy, tr, { packages }) {
  if (lintStrategy === 'all') {
    return;
  } else if (lintStrategy === 'top') {
    await tr.modJson(`package.json`, (pkg) => {
      pkg.scripts.lint = 'tsc -p tsconfig.lint.json';
    });
  } else if (lintStrategy === 'top-references') {
    await tr.modJson(`package.json`, (pkg) => {
      pkg.scripts.lint = 'tsc -b tsconfig.json';
    });
  }
}

async function switchToSinglePackage(tr, { packages }) {
  for (const { name } of packages) {
    await tr.move(`packages/${name}/src`, `packages/main/src/${name}`);
    await tr.remove(`packages/${name}`);
  }

  await tr.modJson('packages/main/package.json', (pkg) => {
    for (const key of Object.keys(pkg.dependencies)) {
      if (key.startsWith('@internal/')) {
        delete pkg.dependencies[key];
      }
    }
  });

  await tr.modText(`packages/main/src/deps.ts`, (text) => {
    return text.replace(/@internal/g, '.');
  });
}

async function createCommonDependency(
  { libs, components },
  tr,
  { packages, projectReferences, singlePackage, buildMode, componentExports }
) {
  if (buildMode !== 'none') {
    throw new Error(
      `common dep is not compatible with build mode ${buildMode}`
    );
  }
  if (singlePackage) {
    throw new Error('common dep is not compatible with single package mode');
  }
  if (
    projectReferences === 'enabled' ||
    projectReferences === 'spread-composite'
  ) {
    for (const { name } of packages) {
      await tr.modJson(`packages/${name}/tsconfig.json`, (config) => {
        if (projectReferences === 'spread-composite') {
          config.compilerOptions.references = [{ path: '../packages/common' }];
        }
      });
    }

    await tr.modJson('tsconfig.json', (config) => {
      config.references.push({
        path: './packages/common/tsconfig.json',
      });
    });
  }

  // Add as dep to all packages
  for (const { name } of packages) {
    await tr.modJson(`packages/${name}/package.json`, (pkg) => {
      pkg.dependencies['@internal/common'] = '0.0.0';
    });

    const importAndUseDep =
      "import {lib1} from '@internal/common'\nlib1.export1func()";
    await tr.addLine(`packages/${name}/src/index.ts`, importAndUseDep);
  }

  await tr.hydrate({
    name: 'ts-package',
    path: `packages/common`,
    data: {
      name: `@internal/common`,
      main: 'src/index.ts',
      types: 'src/index.ts',
    },
  });

  for (const [index, lib] of libs.entries()) {
    const n = index + 1;
    await tr.hydrate({
      name: `ts-lib-${lib}`,
      path: `packages/common/src/lib/lib-${n}`,
    });

    await tr.addLine(
      `packages/common/src/lib/index.ts`,
      `import * as lib${n} from './lib-${n}';\nexport { lib${n} };`
    );
  }

  for (const [index, component] of components.entries()) {
    const n = index + 1;
    await tr.hydrate({
      name: `ts-component-${component}`,
      path: `packages/common/src/components/component-${n}`,
      data: {
        export: componentExports === 'default' ? 'default' : `Component${n}`,
      },
    });

    const exportLine =
      componentExports === 'default'
        ? `export { default as Component${n} } from './component-${n}';`
        : `export * from './component-${n}';`;
    await tr.addLine(`packages/common/src/components/index.ts`, exportLine);
  }
}

async function applyBuildMode(buildMode, tr, { packages }) {
  if (buildMode.startsWith('rollup-')) {
    await tr.modJson('package.json', (pkg) => {
      pkg.scripts.build = 'lerna run build:rollup';
    });
    await tr.modJson('tsconfig.base.json', (pkg) => {
      pkg.compilerOptions.module = 'ES2015';
    });

    const rollupMode = buildMode.replace(/^rollup-/, '');
    for (const { name } of packages) {
      await tr.setMode(`packages/${name}/rollup.config.js`, rollupMode);
    }
  }

  if (buildMode === 'none') {
    for (const { name } of packages) {
      await tr.modJson(`packages/${name}/package.json`, (pkg) => {
        delete pkg.scripts['build:tsc'];
        pkg.main = 'src/index.ts';
      });
    }
  }
}

async function applyBundleMode(bundleMode, bundleSourcemaps, tr, { packages }) {
  await tr.setMode(
    `packages/main/webpack.config.js`,
    bundleSourcemaps ? `${bundleMode}-sourcemap` : bundleMode
  );
}

module.exports = function createProject({
  path: projectPath,
  main,
  types,
  componentExports,
  packages,
  singlePackage = false,
  projectReferences = 'none', // incremental | enabled | spread-composite
  lintStrategy = 'all', // top | top-references
  buildMode = 'none', // tsc | rollup-sucrase | rollup-typescript | rollup-esbuild | none
  bundleMode = 'ts-fork', // ts-fork | ts-transpile | sucrase-transpile | babel-transpile | esbuild-transpile | sucrase-fork
  bundleSourcemaps = true,
  commonDep = null,
}) {
  const dir = resolvePath(projectPath);
  packages = packages.map((pkg, index) => ({
    name: `pkg${index + 1}`,
    ...pkg,
  }));

  const inflate = async () => {
    await fs.remove(dir);
    await fs.ensureDir(dir);

    const tr = new Templater({
      dir: resolvePath(__dirname, 'templates'),
      target: dir,
    });

    await tr.hydrate({ name: 'ts-project', path: '.', data: {} });

    for (const package of packages) {
      const { name, libs, components } = package;

      await tr.hydrate({
        name: 'ts-package',
        path: `packages/${name}`,
        data: { name: `@internal/${name}`, main, types },
      });

      for (const [index, lib] of libs.entries()) {
        const n = index + 1;
        await tr.hydrate({
          name: `ts-lib-${lib}`,
          path: `packages/${name}/src/lib/lib-${n}`,
        });

        await tr.addLine(
          `packages/${name}/src/lib/index.ts`,
          `import * as lib${n} from './lib-${n}';\nexport { lib${n} };`
        );

        // Add to main package
        await tr.addLine(
          `packages/main/src/index.ts`,
          Array(8)
            .fill()
            .map(
              (_, callIndex) =>
                `deps.${name}.lib${n}.export${
                  callIndex + 1
                }bigClass.forLocalStorage('bucket').getItem('key')`
            )
            .join('\n')
        );
      }

      for (const [index, component] of components.entries()) {
        const n = index + 1;
        await tr.hydrate({
          name: `ts-component-${component}`,
          path: `packages/${name}/src/components/component-${n}`,
          data: {
            export:
              componentExports === 'default' ? 'default' : `Component${n}`,
          },
        });

        const exportLine =
          componentExports === 'default'
            ? `export { default as Component${n} } from './component-${n}';`
            : `export * from './component-${n}';`;
        await tr.addLine(
          `packages/${name}/src/components/index.ts`,
          exportLine
        );

        // Add to main package
        await tr.addLine(
          `packages/main/src/index.ts`,
          `deps.${name}.Component${n}({})`
        );
      }

      // Add to main package
      await tr.addLine(
        `packages/main/src/deps.ts`,
        `import * as ${name} from '@internal/${name}';\nexport { ${name} };`
      );
      await tr.modJson('packages/main/package.json', (pkg) => {
        pkg.dependencies[`@internal/${name}`] = '0.0.0';
      });
    }

    await applyProjectReferences(projectReferences, tr, { packages });
    await applyLintStrategy(lintStrategy, tr, { packages });
    await applyBuildMode(buildMode, tr, { packages });
    await applyBundleMode(bundleMode, bundleSourcemaps, tr, { packages });

    if (singlePackage) {
      await switchToSinglePackage(tr, { dir, packages });
    }
    if (commonDep) {
      await createCommonDependency(commonDep, tr, {
        packages,
        projectReferences,
        singlePackage,
        lintStrategy,
        buildMode,
        componentExports,
      });
    }
  };

  return { dir, inflate };
};
