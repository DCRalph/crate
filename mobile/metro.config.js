// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const serverSrc = path.resolve(projectRoot, "..", "src");

const config = getDefaultConfig(projectRoot);

// The app lives inside the server's repo, which has its own node_modules one
// folder up with a different React. Modules are only ever looked for here.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

// A few plain modules are shared with the server (the sealed audio layout, how
// a stream is asked for), so the two can't drift apart. `~/` reaches the
// server's `src`, as it does for TypeScript. Anything under `~/server` that
// imports `server-only` throws if it is ever bundled, which keeps this honest.
config.watchFolders = [projectRoot, serverSrc];
config.resolver.extraNodeModules = { ...config.resolver.extraNodeModules, "~": serverSrc };

module.exports = config;
