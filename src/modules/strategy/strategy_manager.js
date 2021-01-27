const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const IndicatorBuilder = require('./dict/indicator_builder');
const IndicatorPeriod = require('./dict/indicator_period');
const ta = require('../../utils/technical_analysis');
const StrategyContext = require('../../dict/strategy_context');
const Ticker = require('../../dict/ticker');
const SignalResult = require('./dict/signal_result');

module.exports = class StrategyManager {
  constructor(technicalAnalysisValidator, exchangeCandleCombine, logger, projectDir) {
    this.technicalAnalysisValidator = technicalAnalysisValidator;
    this.exchangeCandleCombine = exchangeCandleCombine;
    this.projectDir = projectDir;

    this.logger = logger;
    this.strategies = undefined;
  }

  getStrategies() {
    if (typeof this.strategies !== 'undefined') {
      return this.strategies;
    }

    const strategies = [];

    const dirs = [`${__dirname}/strategies`, `${this.projectDir}/var/strategies`];

    const recursiveReadDirSyncWithDirectoryOnly = (p, a = []) => {
      if (fs.statSync(p).isDirectory()) {
        fs.readdirSync(p)
          .filter(f => !f.startsWith('.') && fs.statSync(path.join(p, f)).isDirectory())
          .map(f => recursiveReadDirSyncWithDirectoryOnly(a[a.push(path.join(p, f)) - 1], a));
      }

      return a;
    };

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        return;
      }

      fs.readdirSync(dir).forEach(file => {
        if (file.endsWith('.js')) {
          strategies.push(new (require(`${dir}/${file.substr(0, file.length - 3)}`))());
        }
      });

      // Allow strategies to be wrapped by any folder depth:
      // "foo/bar" => "foo/bar/bar.js"
      recursiveReadDirSyncWithDirectoryOnly(dir).forEach(folder => {
        const filename = `${folder}/${path.basename(folder)}.js`;

        if (fs.existsSync(filename)) {
          strategies.push(new (require(filename))());
        }
      });
    });

    return (this.strategies = strategies);
  }

  findStrategy(strategyName) {
    return this.getStrategies().find(strategy => strategy.getName() === strategyName);
  }

  async executeStrategy(strategyName, context, exchange, symbol, options) {
    const results = await this.getTaResult(strategyName, exchange, symbol, options, true);
    if (!results || Object.keys(results).length === 0) {
      return;
    }

    // remove candle pipe
    delete results._candle;

    const indicatorPeriod = new IndicatorPeriod(context, results);

    const strategy = this.findStrategy(strategyName);

    const strategyResult = await strategy.period(indicatorPeriod, options);
    if (typeof strategyResult !== 'undefined' && !(strategyResult instanceof SignalResult)) {
      throw `Invalid strategy return:${strategyName}`;
    }

    return strategyResult;
  }

  /**
   * @param strategyName
   * @param exchange
   * @param symbol
   * @param options
   * @param lastSignal
   * @returns {Promise<array>}
   */
  async executeStrategyBacktest(strategyName, exchange, symbol, options, lastSignal) {
    const results = await this.getTaResult(strategyName, exchange, symbol, options);
    if (!results || Object.keys(results).length === 0) {
      return {};
    }

    const price = results._candle ? results._candle.close : undefined;
    const context = StrategyContext.create(new Ticker(exchange, symbol, undefined, price, price));
    context.lastSignal = lastSignal;

    const indicatorPeriod = new IndicatorPeriod(context, results);

    const strategy = this.getStrategies().find(strategy => strategy.getName() === strategyName);
    const strategyResult = await strategy.period(indicatorPeriod, options);

    if (typeof strategyResult !== 'undefined' && !(strategyResult instanceof SignalResult)) {
      throw `Invalid strategy return:${strategyName}`;
    }

    const result = {
      price: price,
      columns: this.getCustomTableColumnsForRow(strategyName, strategyResult ? strategyResult.getDebug() : {})
    };

    if (strategyResult) {
      result.result = strategyResult;
    }

    return result;
  }

  async getTaResult(strategyName, exchange, symbol, options, validateLookbacks = false) {
    options = options || {};

    const strategy = this.getStrategies().find(strategy => {
      return strategy.getName() === strategyName;
    });

    if (!strategy) {
      throw `invalid strategy: ${strategy}`;
    }

    const indicatorBuilder = new IndicatorBuilder();
    strategy.buildIndicator(indicatorBuilder, options);

    const periodGroups = {};

    indicatorBuilder.all().forEach(indicator => {
      if (!periodGroups[indicator.period]) {
        periodGroups[indicator.period] = [];
      }

      periodGroups[indicator.period].push(indicator);
    });

    const results = {};

    for (const period in periodGroups) {
      const periodGroup = periodGroups[period];

      const foreignExchanges = [
        ...new Set(
          periodGroup
            .filter(group => group.options.exchange && group.options.symbol)
            .map(group => {
              return `${group.options.exchange}#${group.options.symbol}`;
            })
        )
      ].map(exchange => {
        const e = exchange.split('#');

        return {
          name: e[0],
          symbol: e[1]
        };
      });

      const lookbacks = await this.exchangeCandleCombine.fetchCombinedCandles(
        exchange,
        symbol,
        period,
        foreignExchanges
      );
      if (lookbacks[exchange].length > 0) {
        // check if candle to close time is outside our allow time window
        if (
          validateLookbacks &&
          !this.technicalAnalysisValidator.isValidCandleStickLookback(lookbacks[exchange].slice(), period)
        ) {
          // too noisy for now; @TODO provide a logging throttle
          // this.logger.error('Outdated candle stick period detected: ' + JSON.stringify([period, strategyName, exchange, symbol]))

          // stop current run
          return {};
        }

        const indicators = periodGroup.filter(group => !group.options.exchange && !group.options.symbol);
        // console.log(` getTaResult => lookbacks[exchange].slice().reverse(): ${JSON.stringify(lookbacks[exchange].slice().reverse())}` )
        // console.log(` getTaResult => indicators : ${JSON.stringify(indicators)}` )
        console.log( new Date() )
        console.log(` createIndicatorsLookback => indicators : ${JSON.stringify(indicators)}` )
        const lookbacksArg = lookbacks[exchange].slice().reverse()
        console.log(` createIndicatorsLookback => lookbacks 1 : ${JSON.stringify(lookbacksArg[1])}` )
        console.log(` createIndicatorsLookback => lookbacks 2 : ${JSON.stringify(lookbacksArg[2])}` )
        console.log(` createIndicatorsLookback => lookbacks -3 : ${JSON.stringify(lookbacksArg.slice(-3)[0])}` )
        console.log(` createIndicatorsLookback => lookbacks -2 : ${JSON.stringify(lookbacksArg.slice(-2)[0])}` )
        console.log(` createIndicatorsLookback => lookbacks -1 : ${JSON.stringify(lookbacksArg.slice(-1)[0])}` )

        // 修复一下。有的时候，会取不出数据，导致最的一根bar的数据是已收盘数据，而不是最新的不使用数据bar
        const before = lookbacksArg.slice(-2)[0]
        const last = lookbacksArg.slice(-1)[0]
        const lastTime = last.time
        const beforeTime = before.time
        let lookbacksCandleSticks = lookbacksArg;
        if (this._isLossPeriod(lastTime, beforeTime)) {
          console.log(` getTaResult => _isLossPeriod indicators : ${JSON.stringify(indicators)}` )
          lookbacksCandleSticks.push(last)
        }
        // const result = await ta.createIndicatorsLookback(lookbacks[exchange].slice().reverse(), indicators);
        const result = await ta.createIndicatorsLookback(lookbacksCandleSticks, indicators);
        
        // console.log(new Date())
        // console.log(` getTaResult => result cci : ${JSON.stringify(result)}` )
        
        let { keys, values, entries } = Object;
        for(let [k , v] of entries(result)){
          console.log(k);
          console.log(` getTaResult => result indicator key : ${JSON.stringify(k)}` )
          console.log(` getTaResult => result indicator 1 : ${JSON.stringify(v[1])}` )
          console.log(` getTaResult => result indicator 2 : ${JSON.stringify(v[2])}` )
          console.log(` getTaResult => result indicator -3 : ${JSON.stringify(v.slice(-3)[0])})}` )
          console.log(` getTaResult => result indicator -2 : ${JSON.stringify(v.slice(-2)[0])})}` )
          console.log(` getTaResult => result indicator -1 : ${JSON.stringify(v.slice(-1)[0])})}` )
        }

        // console.log(` getTaResult => result cci 1 : ${JSON.stringify(result['cci'][1])}` )
        // console.log(` getTaResult => result cci 2 : ${JSON.stringify(result['cci'][2])}` )
        // console.log(` getTaResult => result cci -3 : ${JSON.stringify(result['cci'].slice(-3)[0])}` )
        // console.log(` getTaResult => result cci -2 : ${JSON.stringify(result['cci'].slice(-2)[0])}` )
        // console.log(` getTaResult => result cci -1 : ${JSON.stringify(result['cci'].slice(-1)[0])}` )

        // array merge
        for (const x in result) {
          results[x] = result[x];
        }

        results._candle = lookbacks[exchange][0];
      }

      for (const foreignExchange of foreignExchanges) {
        if (
          !lookbacks[foreignExchange.name + foreignExchange.symbol] ||
          lookbacks[foreignExchange.name + foreignExchange.symbol].length === 0
        ) {
          continue;
        }

        const indicators = periodGroup.filter(group => group.options.exchange === foreignExchange.name);
        if (indicators.length === 0) {
          continue;
        }

        const result = await ta.createIndicatorsLookback(
          lookbacks[foreignExchange.name + foreignExchange.symbol].slice().reverse(),
          indicators
        );

        // array merge
        for (const x in result) {
          results[x] = result[x];
        }
      }
    }

    return results;
  }

  getCustomTableColumnsForRow(strategyName, row) {
    return this.getBacktestColumns(strategyName).map(cfg => {
      // direct value of array or callback
      const value = typeof cfg.value === 'function' ? cfg.value(row) : _.get(row, cfg.value);

      let valueOutput = value;

      if (typeof value !== 'undefined') {
        switch (typeof value) {
          case 'object':
            valueOutput = Object.keys(value).length === 0 ? '' : JSON.stringify(value);

            break;
          case 'string':
            valueOutput = value;

            break;
          default:
            valueOutput = new Intl.NumberFormat('en-US', {
              minimumSignificantDigits: 3,
              maximumSignificantDigits: 4
            }).format(value);
            break;
        }
      }

      const result = {
        value: valueOutput,
        type: cfg.type || 'default'
      };

      switch (cfg.type || 'default') {
        case 'cross':
          result.state = value > _.get(row, cfg.cross) ? 'over' : 'below';
          break;
        case 'histogram':
          result.state = value > 0 ? 'over' : 'below';
          break;
        case 'oscillator':
          if (value > (cfg.range && cfg.range.length > 0 ? cfg.range[0] : 80)) {
            result.state = 'over';
          } else if (value < (cfg.range && cfg.range.length > 1 ? cfg.range[1] : 20)) {
            result.state = 'below';
          }
          break;
      }

      return result;
    });
  }

  getStrategyNames() {
    return this.getStrategies().map(strategy => strategy.getName());
  }

  getBacktestColumns(strategyName) {
    const strategy = this.getStrategies().find(strategy => {
      return strategy.getName() === strategyName;
    });

    if (!strategy) {
      return [];
    }

    return typeof strategy.getBacktestColumns !== 'undefined' ? strategy.getBacktestColumns() : [];
  }
  
  _isLossPeriod(lastTime, beforeTime){
    const moment = require('moment');
    if ((''+lastTime).length < 13) { // 如果说不是毫秒，转成毫秒
      lastTime = lastTime * 1000
      beforeTime = beforeTime * 1000
    }
    const last= moment(moment(lastTime).format());
    const before = moment(moment(beforeTime).format());
    const now = moment();
    const periodDiff = last.diff(before, 'minutes');
    const nowDiff = now.diff(last, 'minutes');
    if ( Math.abs(nowDiff) > Math.abs(periodDiff)){
      // console.log(typeof(nowDiff));
      console.log(` _isLossPeriod => lastTime: ${JSON.stringify(moment(lastTime).utcOffset('+0800').format())}`)
      console.log(` _isLossPeriod => beforeTime: ${JSON.stringify(moment(beforeTime).utcOffset('+0800').format())}`)
      console.log(` _isLossPeriod => now: ${JSON.stringify(moment(now).utcOffset('+0800').format())}`)
      console.log(` _isLossPeriod => periodDiff: ${JSON.stringify(periodDiff)}`)
      console.log(` _isLossPeriod => nowDiff: ${JSON.stringify(nowDiff)}`)
      return true
    } else {
      return false
    }
  }
};
