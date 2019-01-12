'use strict';

import $p from './metadata';
import builder from './builder';
import fetch from 'node-fetch';

const debug = require('debug')('wb:post');
debug('required');

const requester = require('./requester');
const mailer = require('./mailer');


// маркер поля обработки данных
const owner = 'wb-exchange';

/**
 * Смещение по вложенности объектов
 * 
 * @param names массив наименований полей, в соответствии со вложенностью объектов
 * @param src источник данных
 * @return {void}
 */
function shift_field(names, src) {
  for (let item of names) {
    if (typeof src !== 'object' || src[item] === undefined) {
      break;
    }
    src = src[item];
  }
  return src;
}

/**
 * Разбирает данные
 * 
 * Выборка данных осуществляется из объекта источника в соответствии с объектом описания данных,
 * собранные данные помещаются в объект назначения.
 * 
 * Пример объекта описания данных. Поля содержащие объект с "_owner" равным "wb-exchange",
 * заполняются значениями из объекта источника. Поле "name" указывает на наименование поля из источника,
 * поле "fields" содержит описание данных для объекта внутри текущего поля, если это массив, поле
 * "fields" применяется для каждого элемента массива. Все поля опциональны, необработанные значения
 * передаются в объект назначения как есть.
 * 
 * {
 *   "field1": "value",
 *   "field2": {
 *     "_owner": "wb-exchange"
 *   },
 *   "field3": {
 *     "_owner": "wb-exchange",
 *     "name": "name in source"
 *   },
 *   "field4": {
 *     "_owner": "wb-exchange",
 *     "name": ["name in source", "name in source"]
 *   },
 *   "field5": {
 *     "_owner": "wb-exchange",
 *     "name": "name in source",
 *     "fields": {
 *       "field1": "value"
 *       ...
 *     }
 *   }
 * }
 * 
 * пример выборки данных по заказу
 * 
 * {
 *   "document_id": {
 *     "_owner": "wb-exchange",
 *     "name": "ref"
 *   },
 *   "products": {
 *     "_owner": "wb-exchange",
 *     "name": "Продукция",
 *     "fields": {
 *       "name": {
 *         "_owner": "wb-exchange",
 *         "name": "Номенклатура"
 *       },
 *       "characteristic": {
 *         "_owner": "wb-exchange",
 *         "name": "Характеристика"
 *       }
 *     }
 *   },
 *   "production": {
 *     "_owner": "wb-exchange",
 *     "name": "production",
 *     "fields": {
 *       "nom": {
 *         "_owner": "wb-exchange",
 *         "name": [
 *           "nom",
 *           "name"
 *         ]
 *       }
 *     }
 *   },
 *   "КонтрагентАдрес": {
 *     "_owner": "wb-exchange",
 *     "name": "КонтрагентАдрес"
 *   }
 * }
 * 
 * @param data объект описания данных
 * @param src источник данных
 * @param dst объект назначения
 * @return {Object} 
 */
function parseData(data, src, dst) {
  if (typeof data !== 'object') return dst;

  for (const field in data) {
    //if (payload[field] || payload[field] === 0) continue;

    switch (typeof data[field]) {
      //case 'string':
      //  payload[field] = (source[data[field]] || source[data[field]] === 0) ? source[data[field]] : data[field];
      //  break;
      case 'object':
        if (data[field]._owner !== owner) {
          dst[field] = data[field];
          break;
        }

        let src_value = (data[field].name instanceof Array)
          ? shift_field(data[field].name, src)
          : src[data[field].name || field];
        const { fields } = data[field];

        if (src_value !== undefined) {
          if (typeof src_value === 'object') {

            // преобразуем табличную часть в массив
            if ($p.utils.is_tabular(src_value)) {
              const tmp = [];
              src_value.forEach(row => tmp.push(row));
              src_value = tmp;
            }

            if (src_value instanceof Array) {
              dst[field] = [];
              for (const item of src_value) {
                dst[field].push(typeof item === 'object' ? parseData(fields, item, {}) : item);
              }
            } else {
              dst[field] = parseData(fields, src_value, {});
            }
          } else {
            dst[field] = src_value;
          }
        }
        break;
      default:
        dst[field] = data[field];
        break;
    }
  }

  return dst;
}

/**
 * Отправляет данные заказа получателю
 * @param ctx
 * @param next
 * @return {Promise.<void>}
 */
async function calc_order(ctx, next) {

  const { _auth, _query, params } = ctx;
  const { transport, data } = _query;
  const { ref } = params;
  const { utils, job_prm } = $p;
  const { couch_local, zone, user_node: { username, password } } = job_prm;

  const suffix = (_auth && _auth.suffix) || '0000';

  try {
    if (!utils.is_guid(ref)) {
      ctx.status = 404;
      ctx.body = `Параметр запроса ref=${ref} не соответствует маске уникального идентификатора`;
      return;
    }

    // проверяем входные данные
    if (!data || typeof data !== 'object') {
      ctx.body = {
        error: true,
        message: `Ошибка входных параметров при запросе doc.calc_order|${ref}`,
      };
      debug(`error in query of doc.calc_order|${ref}: input parameters not specified`);
    }

    // забираем документ из целевой базы
    return fetch(`${couch_local}${zone}_doc${suffix === '0000' ? '' : '_' + suffix}/doc.calc_order|${ref}`, {
      method: "GET",
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(username + ":" + password).toString('base64')
      }
    })
      .then(res => {
        return res.json();
      })
      .then(doc => {
        // заменяем имя пользователя на объект
        doc.timestamp.user = $p.cat.users.by_name(doc.timestamp.user);

        // получаем документ расчет объект из главной базы
        return $p.doc.calc_order.get(ref, 'promise')
          .then(order => {
            return order.print_data()
              .then(async print_data => {
                // разбираем данные из объектов заказа, документа и данных для печати
                const payload = parseData(data, Object.assign(order, doc, print_data), {});

                // отправляем данные через заданный транспорт
                switch (transport) {
                  case 'request':
                    await requester(Object.assign(_query, {
                      body: JSON.stringify(payload)
                    }))
                      .then(res => {
                        ctx.body = res;
                      })
                      .catch(err => {
                        ctx.body = {
                          error: true,
                          message: `Ошибка при запросе doc.calc_order|${ref}: ${err && err.message}`,
                        };
                        debug(`error in query of doc.calc_order|${ref}: ${err && err.message}`);
                      });
                    break;
                  case 'mail':
                    await mailer(Object.assign(_query, {
                      text: JSON.stringify(payload)
                    }))
                      .then(res => {
                        ctx.body = res;
                      })
                      .catch(err => {
                        ctx.body = {
                          error: true,
                          message: `Ошибка при запросе doc.calc_order|${ref}: ${err && err.message}`,
                        };
                        debug(`error in query of doc.calc_order|${ref}: ${err && err.message}`);
                      });
                    break;
                  default:
                    ctx.body = {
                      error: true,
                      message: `Ошибка при запросе doc.calc_order|${ref}: поддерживаемый транспорт не задан`,
                    };
                    debug(`error in query of doc.calc_order|${ref}: supported transport not specified`);
                    break;
                }

                // выгружаем данные из памяти
                order.production.forEach(row => {
                  if (!row.characteristic.empty()) {
                    row.characteristic.unload();
                  }
                })
                order.unload();
              });
          })
          .catch(err => {
            ctx.body = {
              error: true,
              message: `Ошибка при получении doc.calc_order|${ref}: ${err && err.message}`,
            };
            debug(`get doc.calc_order|${ref} error ${err}`);
          });
      })
      .catch(err => {
        ctx.body = {
          error: true,
          message: `Ошибка при получении doc.calc_order|${ref}: ${err && err.message}`,
        };
        debug(`get doc.calc_order|${ref} error ${err}`);
      });
  }
  catch (err) {
    ctx.status = 500;
    ctx.body = err ? (err.stack || err.message) : `Ошибка при обработке заказа ${ref}`;
    debug(err);
  }

}

/**
 * Корневой обработчик post-запросов
 * @param ctx
 * @param next
 * @return {Promise.<*>}
 */
export default async (ctx, next) => {

  try {
    switch (ctx.params.class) {
      case 'doc.calc_order':
        return await calc_order(ctx, next);
      default:
        ctx.status = 404;
        ctx.body = {
          error: true,
          message: `Неизвестный класс ${ctx.params.class}`,
        };
    }
  }
  catch (err) {
    ctx.status = 500;
    ctx.body = {
      error: true,
      message: err.stack || err.message,
    };
    debug(err);
  }

};
