import * as fs from 'fs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { RollupOptions } from 'rollup';

/**
 * @see https://github.com/js-cookie/js-cookie/blob/main/rollup.config.mjs
 */
const loadJSON = (path: string) =>
  JSON.parse(fs.readFileSync(new URL(path, import.meta.url)).toString());

const pkg = loadJSON('./package.json');
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

const config: RollupOptions[] = [
  {
    input: 'src/index.ts',
    preserveModules: false,
    output: {
      dir: 'dist',
      format: 'es',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      typescript({
        declaration: false,
      }),
      terser(),
    ],
    external,
  },
];
export default config;
