import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import vue from 'rollup-plugin-vue';
import json from '@rollup/plugin-json';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PATHS = {
  DEV: {
    HOME: path.join(__dirname, '../dev/home'),
    RESULT: path.join(__dirname, '../dev/result'),
    HOME_AI: path.join(__dirname, '../dev/homeAI'),
  },
  DIST: {
    HOME: path.join(__dirname, '../resource/js/dist/home'),
    RESULT: path.join(__dirname, '../resource/js/dist/result'),
    HOME_AI: path.join(__dirname, '../resource/js/dist/homeAI'),
  },
};

function generateModuleConfigs(devPath, distPath) {
  try {
    return readdirSync(devPath).map((m) => ({
      input: path.join(devPath, m, 'index.js'),
      output: path.join(distPath, `${m}.js`),
    }));
  } catch (err) {
    console.error(`读取目录失败: ${devPath}`, err);
    return [];
  }
}

export const BASE_PLUGINS = [
  vue({ preprocessStyles: true }),
  resolve({ preferBuiltins: true, browser: true }),
  commonjs(),
  json(),
];

const allConfigs = [
  ...generateModuleConfigs(PATHS.DEV.HOME, PATHS.DIST.HOME),
  ...generateModuleConfigs(PATHS.DEV.RESULT, PATHS.DIST.RESULT),
  {
    input: path.join(PATHS.DEV.HOME_AI, 'main.js'),
    output: path.join(PATHS.DIST.HOME_AI, 'homeAI.js'),
  },
];

export default allConfigs.map((config) => ({
  input: config.input,
  output: {
    file: config.output,
    format: 'iife',
    globals: { vue: 'Vue' },
  },
  context: 'window',
  external: ['vue'],
  plugins: [...BASE_PLUGINS],
}));
