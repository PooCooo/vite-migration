import baseConfig, { BASE_PLUGINS } from './rollup.config.mjs';
import replace from '@rollup/plugin-replace';
import postcss from 'rollup-plugin-postcss';
import simplevars from 'postcss-simple-vars';
import nested from 'postcss-nested';
import cssnano from 'cssnano';
import terser from '@rollup/plugin-terser';
import filesize from 'rollup-plugin-filesize';

const PROD_PLUGINS = [
  replace({
    preventAssignment: true,
    'process.env.NODE_ENV': JSON.stringify('production'),
  }),
  postcss({
    plugins: [simplevars(), nested(), cssnano()],
  }),
  terser({
    output: { ascii_only: true },
    mangle: false,
    compress: { pure_funcs: ['console.log'] },
  }),
  filesize(),
];

export default baseConfig.map((config) => ({
  ...config,
  plugins: [...config.plugins, ...PROD_PLUGINS],
}));
