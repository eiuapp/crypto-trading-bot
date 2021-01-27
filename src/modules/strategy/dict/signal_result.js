const _ = require('lodash');

module.exports = class SignalResult {
  constructor() {
    this._debug = {};
    this._signal = undefined;
  }

  mergeDebug(debug) {
    this._debug = _.merge(this._debug, debug);
  }

  setSignal(signal) {
    if (!['long', 'short', 'close'].includes(signal)) {
      throw `Invalid signal:${signal}`;
    }

    this._signal = signal;
  }

  addDebug(key, value) {
    if (typeof key !== 'string') {
      throw 'Invalid key';
    }

    this._debug[key] = value;
  }

  getDebug() {
    return this._debug;
  }

  getSignal() {
    return this._signal;
  }

  static createSignal(signal, debug = {}) {
    console.log(" signal_result.js createSignal => start ")
    const result = new SignalResult();

    result.setSignal(signal);
    result.mergeDebug(debug);

    console.log(" signal_result.js createSignal => end ")
    return result;
  }

  static createEmptySignal(debug = {}) {
    const result = new SignalResult();

    result.mergeDebug(debug);

    return result;
  }
};
