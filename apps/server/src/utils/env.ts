// these values are injected at build time
const CAESAR_ENV = process.env.CAESAR_ENV;
const CAESAR_BUILD_VERSION = process.env.CAESAR_BUILD_VERSION;
const CAESAR_MEDIASOUP_BIN_NAME = process.env.CAESAR_MEDIASOUP_BIN_NAME;

const SERVER_VERSION =
  typeof CAESAR_BUILD_VERSION !== 'undefined'
    ? CAESAR_BUILD_VERSION
    : '0.0.0-dev';

const env = typeof CAESAR_ENV !== 'undefined' ? CAESAR_ENV : 'development';
const IS_PRODUCTION = env === 'production';
const IS_DEVELOPMENT = !IS_PRODUCTION;
const IS_TEST = process.env.NODE_ENV === 'test';

if (IS_PRODUCTION) {
  if (!CAESAR_MEDIASOUP_BIN_NAME) {
    throw new Error('CAESAR_MEDIASOUP_BIN is not defined');
  }
}

export {
  CAESAR_MEDIASOUP_BIN_NAME,
  IS_DEVELOPMENT,
  IS_PRODUCTION,
  IS_TEST,
  SERVER_VERSION
};
