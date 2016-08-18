'use strict';

import angular from 'angular';
import uiRouter from 'angular-ui-router';

let routes = angular.module('App.Routes', ['ui.router'])
  .config( ["$stateProvider", "$urlRouterProvider", ($stateProvider, $urlRouterProvider) => {
    $urlRouterProvider.otherwise('/account');

    $stateProvider
      .state('account', {
        url: '/account',
        controller: 'AccountController as acctCtrl',
        templateUrl: 'pages/account/account.html'
      })
      .state('location', {
        url: '/location',
        controller: 'LocationController as locCtrl',
        templateUrl: 'pages/location/location.html',
        data: {
          displayName: 'Target Folder'
        }
      })
      .state('confirm', {
        url: '/confirm',
        controller: 'ConfirmController as confCtrl',
        templateUrl: 'pages/confirm/confirm.html',
        data: {
          displayName: 'Confirmation'
        }
      })
      .state('install', {
        url: '/install',
        controller: 'InstallController as instCtrl',
        templateUrl: 'pages/install/install.html',
        data: {
          displayName: 'Download & Install'
        }
      })
      .state('start', {
        url: '/start',
        controller: 'StartController as startCtrl',
        templateUrl: 'pages/start/start.html',
        data: {
          displayName: 'Get Started'
        }
    });
  }]);

export default routes;
