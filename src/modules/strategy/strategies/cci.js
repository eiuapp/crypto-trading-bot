const SignalResult = require('../dict/signal_result');

module.exports = class CCI {
  getName() {
    return 'cci';
  }

  buildIndicator(indicatorBuilder, options) {
    if (!options.period) {
      throw 'Invalid period';
    }

    indicatorBuilder.add('cci', 'cci', options.period);

    indicatorBuilder.add('sma200', 'sma', options.period, {
      length: 200
    });

    indicatorBuilder.add('ema200', 'ema', options.period, {
      length: 200
    });
  }

  period(indicatorPeriod) {
    return this.cci(
      indicatorPeriod.getPrice(),
      indicatorPeriod.getIndicator('sma200'),
      indicatorPeriod.getIndicator('ema200'),
      indicatorPeriod.getIndicator('cci'),
      indicatorPeriod.getLastSignal()
    );
  }

  async cci(price, sma200Full, ema200Full, cciFull, lastSignal) {
    console.log(` strategies async cci start`)
    if (
      !cciFull ||
      !sma200Full ||
      !ema200Full ||
      cciFull.length <= 0 ||
      sma200Full.length < 2 ||
      ema200Full.length < 2
    ) {
      return;
    }

    console.log(` strategies async cci remove incomplete candle start`)
    // remove incomplete candle
    const sma200 = sma200Full.slice(0, -1);
    const ema200 = ema200Full.slice(0, -1);
    const cci = cciFull.slice(0, -1);

    const debug = {
      sma200: sma200.slice(-1)[0],
      ema200: ema200.slice(-1)[0],
      cci: cci.slice(-1)[0]
    };

    const before = cci.slice(-2)[0];
    const last = cci.slice(-1)[0];

    console.log(` price: ${JSON.stringify(price)}`)
    console.log(` sma200: ${JSON.stringify(sma200.slice(-1)[0])}`)
    console.log(` ema200: ${JSON.stringify(ema200.slice(-1)[0])}`)
    console.log(` before: ${JSON.stringify(before)}`)
    console.log(` last: ${JSON.stringify(last)}`)
    console.log(` lastSignal: ${JSON.stringify(lastSignal)}`)

    // trend change
    if (
      (lastSignal === 'long' && before > 100 && last < 100) ||
      (lastSignal === 'short' && before < -100 && last > -100)
    ) {
      return SignalResult.createSignal('close', debug);
    }

    let long = price >= sma200.slice(-1)[0];

    // ema long
    if (!long) {
      long = price >= ema200.slice(-1)[0];
    }

    const count = cci.length - 1;
    console.log(` cci count: ${JSON.stringify(count)}`)
    console.log(` cci long: ${JSON.stringify(long)}`)
    if (long) {
      // long

      // if (before <= -30 && last >= -30) {
      if (before <= -100 && last >= -100) {
        let rangeValues = [];

        for (let i = count - 1; i >= 0; i--) {
          if (cci[i] >= -100) {
            rangeValues = cci.slice(i, count);
            break;
          }
        }
        console.log(` cci rangeValues: ${JSON.stringify(rangeValues)}`)

        const min = Math.min(...rangeValues);
        if (min <= -200) {
          debug._trigger = min;
          console.log(` SignalResult.createSignal('long', debug) start`)
          return SignalResult.createSignal('long', debug);
        }
      }
    // } else if (before >= 30 && last <= 30) {
    } else if (before >= 100 && last <= 100) {
      const count = cci.length - 1;
      let rangeValues = [];

      for (let i = count - 1; i >= 0; i--) {
        if (cci[i] <= 100) {
          rangeValues = cci.slice(i, count);
          break;
        }
      }

      console.log(` cci 2 count: ${JSON.stringify(count)}`)
      console.log(` cci 2 rangeValues: ${JSON.stringify(rangeValues)}`)
      const max = Math.max(...rangeValues);
      if (max >= 200) {
        debug._trigger = max;
        console.log(` SignalResult.createSignal('short', debug) start`)
        return SignalResult.createSignal('short', debug);
      }
    }

    console.log(` strategies async cci SignalResult.createEmptySignal start`)
    return SignalResult.createEmptySignal(debug);
  }

  getBacktestColumns() {
    return [
      {
        label: 'cci',
        value: 'cci',
        type: 'oscillator',
        range: [100, -100]
      }
    ];
  }

  getOptions() {
    return {
      period: '15m'
    };
  }
};
