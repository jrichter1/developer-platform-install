'use strict';

let dialog = require('remote').require('dialog');
let fs = require('fs');
let path = require('path');

class ConfirmController {
  constructor($state, installerDataSvc) {
    this.router = $state;
    this.installerDataSvc = installerDataSvc;

    this.folder = installerDataSvc.installDir();
    this.folderExists = false;
    this.installables = new Object();

    for (var [key, value] of this.installerDataSvc.allInstallables().entries()) {
      this.checkItem(key);
      this.installables[key] = [value, value.existingInstall];
    }
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
    let item = this.installerDataSvc.getInstallable(key);

    if (selection) {
      item.checkForExistingInstall(selection, this.installables);
    }
  }

  checkItem(key) {
    let item = this.installerDataSvc.getInstallable(key);
    let location = item.checkForExistingInstall();

    if (location && location.length > 0) {
      item.existingInstall = true;
      item.existingInstallLocation = location;
    }
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

ConfirmController.$inject = ['$state', 'installerDataSvc'];

export default ConfirmController;
