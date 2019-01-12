/**
 * Отправляет почту
 *
 * @module mailer
 *
 * Created by Evgeniy Malyarov on 20.08.2018,
 * modified by Rostislav Poddorogin on 06.01.2019.
 */

const nodemailer = require('nodemailer');

const {MAILUSER, MAILPWD} = process.env;

// create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: MAILUSER || 'support@oknosoft.ru',
    pass: MAILPWD || 'xxx'
  }
});

// setup email data with unicode symbols
const mailOptions = {
  from: MAILUSER || 'support@oknosoft.ru',  // sender address
  to: 'info@oknosoft.ru',                   // list of receivers
  cc: '',                                   // list of receivers
  subject: 'wb-exchange',                   // Subject line
  text: 'Hello world?',                     // plain text body
  html: '<b>Hello world?</b>'               // html body
};

module.exports = function sendMail({from, to, cc, subject, text, html}) {
  const options = Object.assign({}, mailOptions, {from, to, cc, subject, text, html});
  return transporter.sendMail(options);
};

