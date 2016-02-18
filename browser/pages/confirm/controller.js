'use strict';

let remote = require('remote');
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

  selectFolder() {
    let dialog = remote.require('dialog');
    let selection = dialog.showOpenDialog({ properties: [ 'openDirectory' ]});

    if (selection) {
      this.folder = selection[0] || this.folder;
    }

    this.checkFolder();
  }

  selectJava() {
    let dialog = remote.require('dialog');
    let selection = dialog.showOpenDialog({ properties: [ 'openDirectory' ]});
    let item = this.installerDataSvc.getInstallable('jdk');

    if (selection) {
      item.existingInstallLocation = selection[0] || item.existingInstallLocation;
      try {
        let proc = require('child_process').spawnSync(path.join(item.existingInstallLocation, 'bin', 'java'), ['-version']);
        require('child_process').spawnSync(path.join(item.existingInstallLocation, 'bin', 'javac'), ['-version']);

        let versionRegex = /version\s\"\d\.(\d)\.\d_\d+\"/;
        let version = versionRegex.exec(proc.stderr.toString())[1];
        if (!version || version < 8) {
          this.installables['jdk'][1] = false;
          item.existingInstall = false;
          return;
        }

        this.installables['jdk'][1] = true;
        item.existingInstall = true;
      } catch (err) {
        this.installables['jdk'][1] = false;
        item.existingInstall = false;
      }
    }
  }

  folderChanged() {
    this.folder = folder.value;
    this.checkFolder()
  }

  checkItem(key) {
    let item = this.installerDataSvc.getInstallable(key);
    let location = item.checkForExistingInstall();

    if (location && location.length > 0) {
      item.existingInstall = true;
      item.existingInstallLocation = location;
    }
  }

  checkFolder() {
    try {
      fs.accessSync(this.folder, fs.F_OK);
      this.folderExists = true;
    } catch (err) {
      this.folderExists = false;
    }
  }
}

ConfirmController.$inject = ['$state', 'installerDataSvc'];

export default ConfirmController;
