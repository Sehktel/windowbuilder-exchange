/**
 * Отправляет запрос
 *
 * @module requester
 *
 * Created by Rostislav Poddorogin on 06.01.2019.
 */

const fetch = require('node-fetch');

module.exports = function sendRequest({url, headers, body}) {
  // проверяем входные данные
  if (!url || typeof url !== 'string'
    || !headers || typeof headers !== 'object') {
      return Promise.reject({
        error: true,
        message: 'bad input request parameters'
      });
  }
  
  return fetch(url, {
    method: "POST",
    headers,
    body
  })
    .then(async res => {
      const { status, statusText } = res;
      return {
        status,
        statusText,
        body: await res.text()
      };
    });
};

