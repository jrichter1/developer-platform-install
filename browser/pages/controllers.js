'use strict';

import angular from 'angular';
import base64 from 'angular-base64';
import acctCtrl from './account/controller';
import locCtrl from './location/controller';
import confCtrl from './confirm/controller';
import instCtrl from './install/controller';
import startCtrl from './start/controller';

let controllers = angular.module('App.Controllers', ['base64'])
  .controller(acctCtrl.name, acctCtrl)
  .controller(locCtrl.name, locCtrl)
  .controller(confCtrl.name, confCtrl)
  .controller(instCtrl.name, instCtrl)
  .controller(startCtrl.name, startCtrl);

export default controllers;
