'use strict';

let dialog = require('remote').require('dialog');
let fs = require('fs');
let path = require('path');
let ipcRenderer = require('electron').ipcRenderer;

class ConfirmController {
  constructor($scope, $state, installerDataSvc) {
    this.router = $state;
    this.installerDataSvc = installerDataSvc;
    this.sc = $scope;

    this.folder = installerDataSvc.installDir();
    this.folderExists = false;
    this.installables = new Object();
  }

  install() {
    //TODO This needs to handle changes to install location, etc

    if (!this.folderExists) {
      fs.mkdirSync(this.folder);
    }
    this.installerDataSvc.setup(this.folder);
    this.router.go('install');
  }

  selectItem(key) {
    let selection = dialog.showOpenDialog({ properties: [ 'openDirectory' ], defaultPath: this.installables[key][0].existingInstallLocation });
    let item = this.installerDataSvc.allInstallables().get(key);

    if (selection) {
      item.checkForExistingInstall(selection, this.installables);
    }
  }

  checkItem(key) {
    let item = this.installerDataSvc.allInstallables().get(key);
    item.checkForExistingInstall();

    ipcRenderer.on('checkComplete', (event, arg) => {
      if (arg === key) {
        this.installables[key] = [item, item.existingInstall];
        this.sc.$digest();
      }
    });
  }

  selectFolder() {
    let selection = dialog.showOpenDialog({ properties: [ 'openDirectory' ], defaultPath: this.folder });

    if (selection) {
      this.folder = selection[0] || this.folder;
    }

    this.checkFolder();
  }

  checkFolder() {
    try {
      fs.accessSync(this.folder, fs.F_OK);
      this.folderExists = true;
    } catch (err) {
      this.folderExists = false;
    }
  }

  folderChanged() {
    this.folder = folder.value;
    this.checkFolder()
  }
}

ConfirmController.$inject = ['$scope', '$state', 'installerDataSvc'];

export default ConfirmController;
