import baseConfig from './rollup.config.mjs';
import replace from '@rollup/plugin-replace';
import postcss from 'rollup-plugin-postcss';
import simplevars from 'postcss-simple-vars';
import nested from 'postcss-nested';

const DEV_PLUGINS = [
  replace({
    preventAssignment: true,
    'process.env.NODE_ENV': JSON.stringify('development'),
  }),
  postcss({ plugins: [simplevars(), nested()] }),
];

export default baseConfig.map((config) => ({
  ...config,
  plugins: [...config.plugins, ...DEV_PLUGINS],
}));
