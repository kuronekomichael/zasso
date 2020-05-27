#!/usr/bin/env node
import { execSync } from 'child_process';
import { mkdirsSync, copyFileSync } from 'fs-extra';

export const NODE_LAMBDA_LAYER_DIR = `${process.cwd()}/bundle`;

// Create bundle directory
export const createBundle = () => {
  const lambdaLayerRuntimePath = `${NODE_LAMBDA_LAYER_DIR}/nodejs`;

  // Copy package.json and package-lock.json
  mkdirsSync(lambdaLayerRuntimePath);

  ['package.json', 'package-lock.json'].map((file) =>
    copyFileSync(
      `${process.cwd()}/${file}`,
      `${lambdaLayerRuntimePath}/${file}`
    )
  );

  // Install package.json (production)
  execSync(`npm --prefix ${lambdaLayerRuntimePath} install --production`, {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env },
    shell: 'bash',
  });
};
