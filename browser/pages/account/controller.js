'use strict';

const shell = require('electron').shell;
let path = require('path');
var pjson = require(path.resolve('./package.json'));

class AccountController {
  constructor($state, $http, $base64, installerDataSvc) {
    this.router = $state;
    this.http = $http;
    this.base64 = $base64;
    this.installerDataSvc = installerDataSvc;

    this.username = "";
    this.password = "";
    this.authFailed = false;
    this.tandcNotSigned = false;
    this.pdkVersion = pjson.version;
  }

  login() {
    this.authFailed = false;
    this.tandcNotSigned = false;

    var req = {
      method: 'GET',
      url: 'https://developers.redhat.com/download-manager/rest/tc-accepted?downloadURL=/file/cdk-2.0.0-beta3.zip',
      headers: {
        'Authorization': 'Basic ' + this.base64.encode(this.username + ':' + this.password)
      }
    };

    this.http(req)
      .then(this.handleHttpSuccess.bind(this))
      .catch(this.handleHttpFailure.bind(this));
  }

  forgotPassword() {
    shell.openExternal('https://developers.redhat.com/auth/realms/rhd/account');
  }

  createAccount() {
    shell.openExternal('https://developers.redhat.com/auth/realms/rhd/account');
  }

  handleHttpSuccess(result) {
    if (result.status == 200) {
      if (result.data == true) {
        this.installerDataSvc.setCredentials(this.username, this.password);
        this.router.go('confirm');
        return;
      } else if (result.data == false) {
        this.tandcNotSigned = true;
        return;
      }
    }
    this.authFailed = true;
  }

  handleHttpFailure() {
    this.authFailed = true;
  }
}

AccountController.$inject = ['$state', '$http', '$base64', 'installerDataSvc'];

export default AccountController;
