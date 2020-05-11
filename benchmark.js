const { createProjectMatrix, presets } = require('./factory');
const { processRunner } = require('./runner');
const { printTimingSummary } = require('./stats');

processRunner({
  matrix: createProjectMatrix({
    baseConfig: presets.baseConfig({
      packages: Array(10).fill(presets.packages.balanced(9)),
    }),
    dimensions: [
      {
        // buildTsc: {
        //   buildMode: 'tsc',
        // },
        // buildRollupTs: {
        //   buildMode: 'rollup-typescript',
        // },
        buildRollupSucrase: {
          buildMode: 'rollup-sucrase',
        },
        buildNone: {
          buildMode: 'none',
        },
      },
      {
        bundleTsTranspile: {
          bundleMode: 'ts-transpile',
        },
        bundleTsFork: {
          bundleMode: 'ts-fork',
        },
        bundleSucrase: {
          bundleMode: 'sucrase-transpile',
        },
        bundleSucraseFork: {
          bundleMode: 'sucrase-fork',
        },
      },
      {
        withMap: {
          bundleSourcemaps: true,
        },
        noMap: {
          bundleSourcemaps: false,
        },
      },
    ],
  }),
  prepare: async (runner) => {
    const buildTimings = await runner.timeCmd({ cmd: ['yarn', 'build'] });
    console.log('*** BUILD TIMES ***');
    printTimingSummary(buildTimings);
  },
  benchmark: async (runner, count) => {
    // const buildTimings = await runner.timeCmd({
    //   cmd: ['yarn', 'main:build:tsc'],
    //   count,
    // });
    // console.log('*** BUILD TIMES ***');
    // printTimingSummary(buildTimings);

    const bundleTimings = await runner.timeCmd({
      // path: 'packages/main',
      cmd: ['yarn', 'bundle'],
      count,
    });
    console.log('*** BUNDLE TIMES ***');
    printTimingSummary(bundleTimings);
  },
});
