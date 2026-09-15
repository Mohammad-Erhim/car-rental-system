const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

// Monorepo Metro setup (Expo's documented pattern): the app needs to resolve
// `@carrental/*` workspace packages that live outside `apps/mobile`, and must not pick up
// two copies of react/react-dom from a package's own nested node_modules.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// pnpm's strict node_modules layout needs this off, or Metro can't hoist-resolve workspace deps.
config.resolver.disableHierarchicalLookup = false;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
