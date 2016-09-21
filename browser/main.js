'use strict';

import angular from 'angular';
import uiRouter from 'angular-ui-router';
import base64 from 'angular-base64';
import messages from 'angular-messages';
import acctCtrl from './pages/account/controller';
import locCtrl from './pages/location/controller';
import confCtrl from './pages/confirm/controller';
import instCtrl from './pages/install/controller';
import startCtrl from './pages/start/controller';
import pathValidator from './directives/pathValidator';
import progressBar from './directives/progressBar';
import breadcrumb from './directives/breadcrumb';
import InstallerDataService from './services/data';
import Request from './services/request';
import VirtualBoxInstall from './model/virtualbox';
import JdkInstall from './model/jdk-install';
import JbdsInstall from './model/jbds';
import VagrantInstall from './model/vagrant';
import CygwinInstall from './model/cygwin';
import CDKInstall from './model/cdk';

let mainModule =
      angular.module('devPlatInstaller', ['ui.router', 'base64', 'ngMessages'])
          .controller(acctCtrl.name, acctCtrl)
          .controller(locCtrl.name, locCtrl)
          .controller(confCtrl.name, confCtrl)
          .controller(instCtrl.name, instCtrl)
          .controller(startCtrl.name, startCtrl)
          .factory('installerDataSvc', InstallerDataService.factory)
          .factory('request', Request.factory)
          .directive(progressBar.name, progressBar)
          .directive(breadcrumb.name, ['$state', breadcrumb])
          .directive(pathValidator.name, pathValidator)
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
          }])
          .run( ['$rootScope', '$location', '$timeout', 'installerDataSvc', 'request', ($rootScope, $location, $timeout, installerDataSvc, request) => {
            let virtualbox = new VirtualBoxInstall(
                  installerDataSvc,
                  ['virtualbox.exe'],
                  'virtualbox'),

                cygwin = new CygwinInstall(
                  installerDataSvc,
                  ['cygwin.exe'],
                  'cygwin'),

                vagrant = new VagrantInstall(
                  installerDataSvc,
                  ['vagrant.msi'],
                  'vagrant'),

                cdk = new CDKInstall(
                  installerDataSvc,
                  ['cdk.zip', 'rhel-vagrant-virtualbox.box', 'oc.zip'],
                  'cdk'),

                jdk = new JdkInstall(
                  installerDataSvc,
                  ['jdk.msi'],
                  'jdk8'),

                jbds = new JbdsInstall(
                  installerDataSvc,
                  ['jbds.jar'],
                  'developer-studio');

              installerDataSvc.addItemsToInstall(virtualbox, cygwin, vagrant, cdk, jdk, jbds);

              jdk.thenInstall(jbds);
              jdk.thenInstall(virtualbox).thenInstall(cygwin).thenInstall(vagrant).thenInstall(cdk);

          }]);

export default mainModule;
