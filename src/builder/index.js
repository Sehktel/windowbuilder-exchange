'use strict';

import paper from 'paper/dist/paper-core';
import $p from '../metadata';

global.paper = paper;
const builder = require('./drawer');

const debug = require('debug')('wb:paper');
debug('required, inited & modified');

$p.Editor = builder;

export default builder;
