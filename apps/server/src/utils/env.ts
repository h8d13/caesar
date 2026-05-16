// these values are injected at build time
const SHARKORD_ENV = process.env.SHARKORD_ENV;
const SHARKORD_BUILD_VERSION = process.env.SHARKORD_BUILD_VERSION;
const SHARKORD_MEDIASOUP_BIN_NAME = process.env.SHARKORD_MEDIASOUP_BIN_NAME;

const SERVER_VERSION =
  typeof SHARKORD_BUILD_VERSION !== 'undefined'
    ? SHARKORD_BUILD_VERSION
    : '0.0.0-dev';

const env = typeof SHARKORD_ENV !== 'undefined' ? SHARKORD_ENV : 'development';
const IS_PRODUCTION = env === 'production';
const IS_DEVELOPMENT = !IS_PRODUCTION;
const IS_TEST = process.env.NODE_ENV === 'test';

if (IS_PRODUCTION) {
  if (!SHARKORD_MEDIASOUP_BIN_NAME) {
    throw new Error('SHARKORD_MEDIASOUP_BIN is not defined');
  }
}

export {
  IS_DEVELOPMENT,
  IS_PRODUCTION,
  IS_TEST,
  SERVER_VERSION,
  SHARKORD_MEDIASOUP_BIN_NAME
};
