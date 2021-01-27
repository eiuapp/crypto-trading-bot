module.exports = class Notify {
  constructor(notifier) {
    this.notifier = notifier;
  }

  send(message) {
    const moment = require('moment');
    // const now = moment().format('YYYY-MM-DD HH:mm:ss')
    // const now = moment().utcOffset('+0800').format('YYYY-MM-DD HH:mm:ss')
    const now = moment().utcOffset('+0800').format('MM-DD HH:mm:ss')
    message = `[${now}] => ${message}`
    console.log(` notify => send message : ${JSON.stringify(message)}`)
    this.notifier.forEach(notify => notify.send(message));
  }
};

