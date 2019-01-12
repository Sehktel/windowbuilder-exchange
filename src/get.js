'use strict';

import $p from './metadata';

const debug = require('debug')('wb:get');
debug('required');

/**
 * Возвращает в body лог отдела за нужный день
 * @param ctx
 * @param next
 * @return {Promise.<void>}
 */
async function log(ctx, next) {
  // данные авторизации получаем из контекста
  const {_auth, params} = ctx;
  const _id = `_local/log.exchange.${_auth.suffix}.${params.ref}`;
  ctx.body = await $p.adapters.pouch.remote.doc.get(_id)
    .catch((err) => ({error: true, message: `Объект ${_id} не найден\n${err.message}`}));
}

/**
 * Корневой обработчик get-запросов
 * @param ctx
 * @param next
 * @return {Promise.<*>}
 */
export default async (ctx, next) => {

  try {
    switch (ctx.params.class) {
    case 'log':
      return await log(ctx, next);
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
