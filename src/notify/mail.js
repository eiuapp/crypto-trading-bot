module.exports = class Mail {
  constructor(mailer, systemUtil, logger) {
    this.mailer = mailer;
    this.systemUtil = systemUtil;
    this.logger = logger;
  }

  send(message) {
    // console.log(` class Mail send message: ${JSON.stringify(message)}`)
    const to = this.systemUtil.getConfig('notify.mail.to');
    if (!to) {
      this.logger.error('No mail "to" address given');

      return;
    }
    console.log(` class Mail send sendMail: ${JSON.stringify({
      to: to,
      subject: message,
      text: message,
      requireTLS:true
    })}`)

    this.mailer.sendMail(
      {
        to: to,
        subject: message,
        text: message
      },
      err => {
        if (err) {
          this.logger.error(`Mailer: ${JSON.stringify(err)}`);
        }
      }
    );
  }
};
