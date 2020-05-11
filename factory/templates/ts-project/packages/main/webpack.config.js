const HtmlWebpackPlugin = require('html-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const MODE = 'ts-fork';

const plugins = [new HtmlWebpackPlugin()];
const rules = [];

if (MODE.startsWith('ts-fork')) {
  rules.push({
    test: /\.tsx?$/,
    exclude: /node_modules/,
    loader: 'ts-loader',
    options: {
      // disable type checker - handled by ForkTsCheckerWebpackPlugin
      transpileOnly: true,
      compilerOptions: {
        module: 'CommonJS',
      },
    },
  });
  plugins.push(new ForkTsCheckerWebpackPlugin());
} else if (MODE.startsWith('ts-transpile')) {
  rules.push({
    test: /\.tsx?$/,
    exclude: /node_modules/,
    loader: 'ts-loader',
    options: {
      // disable type checker - handled by ForkTsCheckerWebpackPlugin
      transpileOnly: true,
      compilerOptions: {
        module: 'CommonJS',
      },
    },
  });
} else if (MODE.startsWith('sucrase-transpile')) {
  rules.push({
    test: /\.tsx?$/,
    exclude: /node_modules/,
    loader: '@sucrase/webpack-loader',
    options: {
      transforms: ['typescript', 'jsx', 'imports'],
    },
  });
} else if (MODE.startsWith('sucrase-fork')) {
  rules.push({
    test: /\.tsx?$/,
    exclude: /node_modules/,
    loader: '@sucrase/webpack-loader',
    options: {
      transforms: ['typescript', 'jsx', 'imports'],
    },
  });
  plugins.push(new ForkTsCheckerWebpackPlugin());
} else if (MODE.endsWith('-sourcemap')) {
  throw new Error('Invalid Webpack Mode');
}

module.exports = {
  mode: 'development',
  profile: false,
  bail: false,
  devtool: MODE.endsWith('-sourcemap') ? 'cheap-module-eval-source-map' : false,
  entry: './src/index.ts',
  context: __dirname,
  resolve: {
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx'],
    modules: ['node_modules'],
  },
  module: {
    rules,
  },
  output: {
    publicPath: '/',
    filename: 'bundle.js',
  },
  plugins,
  node: {
    module: 'empty',
    dgram: 'empty',
    dns: 'mock',
    fs: 'empty',
    http2: 'empty',
    net: 'empty',
    tls: 'empty',
    child_process: 'empty',
  },
};
