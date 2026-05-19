// these values are injected at build time
const CAESAR_ENV = process.env.CAESAR_ENV;
const CAESAR_BUILD_VERSION = process.env.CAESAR_BUILD_VERSION;

const SERVER_VERSION =
  typeof CAESAR_BUILD_VERSION !== 'undefined'
    ? CAESAR_BUILD_VERSION
    : '0.0.0-dev';

const env = typeof CAESAR_ENV !== 'undefined' ? CAESAR_ENV : 'development';
const IS_PRODUCTION = env === 'production';
const IS_DEVELOPMENT = !IS_PRODUCTION;
const IS_TEST = process.env.NODE_ENV === 'test';

// Master (Bun) required CAESAR_MEDIASOUP_BIN_NAME because the embedded
// binary was renamed per build target. On Node the binary always lives at
// MEDIASOUP_PATH/mediasoup-worker, so the env var is no longer required.

export { IS_DEVELOPMENT, IS_PRODUCTION, IS_TEST, SERVER_VERSION };
