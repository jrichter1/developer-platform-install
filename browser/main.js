'use strict';

import angular from 'angular';
import routes from './pages/route-config';
import controllers from './pages/controllers';
import directives from './directives/directives';
import services from './services/services';

let mainModule = angular.module('devPlatInstaller',
  [
    'App.Controllers',
    'App.Directives',
    'App.Services',
    'App.Routes'
  ]
);

export default mainModule;
