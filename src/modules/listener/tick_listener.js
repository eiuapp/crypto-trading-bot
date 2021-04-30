const moment = require('moment');
const _ = require('lodash');
const { default: PQueue } = require('p-queue');
const StrategyContext = require('../../dict/strategy_context');

module.exports = class TickListener {
  constructor(
    tickers,
    instances,
    notifier,
    signalLogger,
    strategyManager,
    exchangeManager,
    pairStateManager,
    logger,
    systemUtil
  ) {
    this.tickers = tickers;
    this.instances = instances;
    this.notifier = notifier;
    this.signalLogger = signalLogger;
    this.strategyManager = strategyManager;
    this.exchangeManager = exchangeManager;
    this.pairStateManager = pairStateManager;
    this.logger = logger;
    this.systemUtil = systemUtil;

    this.notified = {};
  }

  async visitStrategy(strategy, symbol) {
    console.log(` visitStrategy => start .............................. `);
    const ticker = this.tickers.get(symbol.exchange, symbol.symbol);

    if (!ticker) {
      console.error(`Ticker no found for + ${symbol.exchange}${symbol.symbol}`);
      return;
    }

    if (strategy.hasOwnProperty('symbols') && !strategy.symbols.includes(symbol.symbol)){
      console.error(`The config strategy.symbols(${JSON.stringify(strategy.symbols)}) no found for + ${symbol.exchange}${symbol.symbol}`);
      console.log(` visitStrategy => !strategy.symbols.includes(symbol.symbol): ${!strategy.symbols.includes(symbol.symbol)} `);
      return;
    }

    const strategyKey = strategy.strategy;

    let context = StrategyContext.create(ticker);
    const position = await this.exchangeManager.getPosition(symbol.exchange, symbol.symbol);
    if (position) {
      context = StrategyContext.createFromPosition(ticker, position);
    }

    const result = await this.strategyManager.executeStrategy(
      strategyKey,
      context,
      symbol.exchange,
      symbol.symbol,
      strategy.options || {}
    );
    if (!result) {
      return;
    }

    const signal = result.getSignal();
    if (!signal || typeof signal === 'undefined') {
      return;
    }

    if (!['close', 'short', 'long'].includes(signal)) {
      throw Error(`Invalid signal: ${JSON.stringify(signal, strategy)}`);
    }

    const signalWindow = moment()
      .subtract(30, 'minutes')
      .toDate();

    if (
      this.notified[symbol.exchange + symbol.symbol + strategyKey] &&
      signalWindow <= this.notified[symbol.exchange + symbol.symbol + strategyKey]
    ) {
      console.log('notifierSendContent: blocked')
      this.notified[symbol.exchange + symbol.symbol + strategyKey] = new Date();
      // this.notifier.send(`[${signal} (${strategyKey})` + `] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`);
      let notifierSendContent = `will blocked => [${signal} (${strategyKey})] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`;
      if (strategy.options && strategy.options.period) {
	      const period = strategy.options.period;
        notifierSendContent = `[${period}] => ${notifierSendContent}`;
      }
      console.log(`notifierSendContent: ${notifierSendContent}`);
      /*
      this.notifier.send(notifierSendContent);

      // log signal
      this.signalLogger.signal(
        symbol.exchange,
        symbol.symbol,
        {
          price: ticker.ask,
          strategy: strategyKey,
          raw: JSON.stringify(result)
        },
        signal,
        strategyKey
      );
      */
    } else {
      this.notified[symbol.exchange + symbol.symbol + strategyKey] = new Date();
      // this.notifier.send(`[${signal} (${strategyKey})` + `] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`);
      let notifierSendContent = `[${signal} (${strategyKey})] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`;
      if (strategy.options && strategy.options.period) {
	      const period = strategy.options.period;
        notifierSendContent = `[${period}] => ${notifierSendContent}`;
      }
      console.log(`notifierSendContent: ${notifierSendContent}`);
      this.notifier.send(notifierSendContent);

      // log signal
      this.signalLogger.signal(
        symbol.exchange,
        symbol.symbol,
        {
          price: ticker.ask,
          strategy: strategyKey,
          raw: JSON.stringify(result)
        },
        signal,
        strategyKey
      );
    }
  }

  async visitTradeStrategy(strategy, symbol) {
    console.log(` visitTradeStrategy => start .............................. `);
    const ticker = this.tickers.get(symbol.exchange, symbol.symbol);

    if (!ticker) {
      console.error(`Ticker no found for + ${symbol.exchange}${symbol.symbol}`);
      return;
    }

    if (strategy.hasOwnProperty('symbols') && !strategy.symbols.includes(symbol.symbol)){
      console.error(`The config strategy.symbols(${JSON.stringify(strategy.symbols)}) no found for + ${symbol.exchange}${symbol.symbol}`);
      return;
    }

    const strategyKey = strategy.strategy;

    let context = StrategyContext.create(ticker);
    const position = await this.exchangeManager.getPosition(symbol.exchange, symbol.symbol);
    if (position) {
      context = StrategyContext.createFromPosition(ticker, position);
    }

    const result = await this.strategyManager.executeStrategy(
      strategyKey,
      context,
      symbol.exchange,
      symbol.symbol,
      strategy.options || {}
    );
    if (!result) {
      return;
    }

    const signal = result.getSignal();
    console.log(` visitTradeStrategy signal: ${JSON.stringify(signal)}`)

    console.log(` visitTradeStrategy => [${signal} (${strategyKey})] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`);
    // this.notifier.send(`[${signal} (${strategyKey})] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`);
    let notifierSendContent = `[${signal} (${strategyKey})] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`;
    if (strategy.options && strategy.options.period) {
      notifierSendContent = `Trade => [${period}] => ${notifierSendContent}`;
    }
    this.notifier.send(notifierSendContent);

    if (!signal || typeof signal === 'undefined') {
      return;
    }

    if (!['close', 'short', 'long'].includes(signal)) {
      throw Error(`Invalid signal: ${JSON.stringify(signal, strategy)}`);
    }

    const signalWindow = moment()
      .subtract(_.get(symbol, 'trade.signal_slowdown_minutes', 15), 'minutes')
      .toDate();
    console.log(` visitTradeStrategy signalWindow: ${JSON.stringify(signalWindow)}`)

    const noteKey = symbol.exchange + symbol.symbol;
    console.log(` visitTradeStrategy noteKey: ${JSON.stringify(noteKey)}`)
    if (noteKey in this.notified && this.notified[noteKey] >= signalWindow) {
      console.log(` visitTradeStrategy noteKey in this.notified && this.notified[noteKey] >= signalWindow: ${JSON.stringify(noteKey in this.notified )}`)
      console.log(` visitTradeStrategy noteKey in this.notified && this.notified[noteKey] >= signalWindow: ${JSON.stringify(this.notified[noteKey] >= signalWindow)}`)
      return;
    }

    // log signal
    this.logger.info(
      [new Date().toISOString(), signal, strategyKey, symbol.exchange, symbol.symbol, ticker.ask].join(' ')
    );
    console.log(` visitTradeStrategy notifier.send: [${signal} (${strategyKey})] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`)
    this.notifier.send(`[${signal} (${strategyKey})] ${symbol.exchange}:${symbol.symbol} - ${ticker.ask}`);
    this.signalLogger.signal(
      symbol.exchange,
      symbol.symbol,
      {
        price: ticker.ask,
        strategy: strategyKey,
        raw: JSON.stringify(result)
      },
      signal,
      strategyKey
    );
    this.notified[noteKey] = new Date();

    await this.pairStateManager.update(symbol.exchange, symbol.symbol, signal);
  }

  async startStrategyIntervals() {
    this.logger.info(`Starting strategy intervals`);

    const queue = new PQueue({ concurrency: this.systemUtil.getConfig('tick.pair_signal_concurrency', 10) });

    const me = this;

    const types = [
      {
        name: 'watch',
        items: this.instances.symbols.filter(sym => sym.strategies && sym.strategies.length > 0)
      },
      {
        name: 'trade',
        items: this.instances.symbols.filter(
          sym => sym.trade && sym.trade.strategies && sym.trade.strategies.length > 0
        )
      }
    ];

    types.forEach(type => {
      me.logger.info(`Strategy: "${type.name}" found "${type.items.length}" valid symbols`);

      type.items.forEach(symbol => {
        let myStrategies = symbol.strategies;
        if (type.name === 'trade'){
          myStrategies = symbol.trade.strategies;
        } else {
          myStrategies = symbol.strategies;
        }
        myStrategies.forEach(strategy => {
          let myInterval = '1m';

          if (strategy.interval) {
            console.log(` startStrategyIntervals => strategy: ${JSON.stringify(strategy)} `)
            console.log(` startStrategyIntervals => strategy.interval: ${JSON.stringify(strategy.interval)} `)
            myInterval = strategy.interval;
          } else {
            const strategyInstance = me.strategyManager.findStrategy(strategy.strategy);
            if (typeof strategyInstance.getTickPeriod === 'function') {
              myInterval = strategyInstance.getTickPeriod();
            }
          }

          const [timeout, interval] = me.getFirstTimeoutAndInterval(myInterval);

          // random add 5-15 sec to init start for each to not run all at same time
          const timeoutWindow = timeout + (Math.floor(Math.random() * 9000 * 2) + 25000);

          me.logger.info(
            `"${symbol.exchange}" - "${symbol.symbol}" - "${type.name}" init strategy "${strategy.strategy}" in ${(
              timeoutWindow /
              60 /
              1000
            ).toFixed(3)} minutes`
          );
          const moment = require('moment'); 
          const now = moment().utcOffset('+0800').format('MM-DD HH:mm:ss')
          console.log(
            `[${now}] => "${symbol.exchange}" - "${symbol.symbol}" - "${type.name}" init strategy "${strategy.strategy}" in ${(
              timeoutWindow /
              60 /
              1000
            ).toFixed(3)} minutes`
          );

          setTimeout(() => {
            me.logger.info(
              `"${symbol.exchange}" - "${symbol.symbol}" - "${type.name}" first strategy run "${
                strategy.strategy
              }" now every ${(interval / 60 / 1000).toFixed(2)} minutes`
            );
            
            const moment = require('moment'); 
            const now = moment().utcOffset('+0800').format('MM-DD HH:mm:ss')
            console.log(
              `[${now}] => "${symbol.exchange}" - "${symbol.symbol}" - "${type.name}" first strategy run "${
                strategy.strategy
              }" now every ${(interval / 60 / 1000).toFixed(2)} minutes`
            );

            setInterval(() => {
              queue.add(async () => {
                /*
                // logging can be high traffic on alot of pairs
                me.logger.debug(
                  `"${symbol.exchange}" - "${symbol.symbol}" - "${type.name}" strategy running "${strategy.strategy}"`
                );
                */
                // const moment = require('moment'); 
                const now = moment().utcOffset('+0800').format('MM-DD HH:mm:ss')
                console.log(
                  `[${now}] => "${symbol.exchange}" - "${symbol.symbol}" - "${type.name}" strategy running "${strategy.strategy}"`
                );

                if (type.name === 'watch') {
                  await me.visitStrategy(strategy, symbol);
                } else if (type.name === 'trade') {
                  await me.visitTradeStrategy(strategy, symbol);
                } else {
                  throw new Error(`Invalid strategy type${type.name}`);
                }
              });
            }, interval);
          }, timeoutWindow);
        });
      });
    });
  }

  getFirstTimeoutAndInterval(period) {
    const unit = period.slice(-1).toLowerCase();
    let myUnit = 0;
    switch (unit) {
      case 's':
        myUnit = 1;
        break;
      case 'm':
        myUnit = 60;
        break;
      case 'h':
        myUnit = 3600;
        break;
      default:
        throw Error(`Unsupported period unit: ${period}`);
    }

    const number = parseInt(period.substring(0, period.length - 1), 10);
    const firstRun = this.getFirstRun(number, myUnit);
    console.log(` getFirstTimeoutAndInterval => period: ${JSON.stringify(period)}`)
    console.log(` getFirstTimeoutAndInterval => myUnit: ${JSON.stringify(myUnit)}`)
    console.log(` getFirstTimeoutAndInterval => number: ${JSON.stringify(number)}`)
    console.log(` getFirstTimeoutAndInterval => firstRun: ${JSON.stringify(firstRun)}`)
    console.log(` getFirstTimeoutAndInterval => number * myUnit * 1000: ${JSON.stringify(number * myUnit * 1000)}`)
    return [firstRun, number * myUnit * 1000];
  }

  getFirstRun(minutes, unit) {
    const interval = minutes * unit * 1000;
    const number = Math.ceil(new Date().getTime() / interval) * interval;
    console.log(` getFirstRun => interval: ${JSON.stringify(interval)}`)
    console.log(` getFirstRun => number: ${JSON.stringify(number)}`)
    return new Date(number).getTime() - new Date().getTime();
  }
};
