'use strict';

import angular from 'angular';
import pathValidator from './pathValidator';
import progressBar from './progressBar';
import breadcrumb from './breadcrumb';

let directives = angular.module('App.Directives', [])
  .directive(progressBar.name, progressBar)
  .directive(breadcrumb.name, ['$state', breadcrumb])
  .directive(pathValidator.name, pathValidator);

export default directives;
