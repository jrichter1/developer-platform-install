'use strict';

let fs = require('fs');
let path = require('path');
let child_process = require('child_process');
let ipcRenderer = require('electron').ipcRenderer;

import InstallableItem from './installable-item';
import Downloader from './helpers/downloader';
import Logger from '../services/logger';
import Installer from './helpers/installer';

class JdkInstall extends InstallableItem {
  constructor(installerDataSvc, downloadUrl, installFile) {
    super('JDK 8', 260, downloadUrl, installFile);

    this.installerDataSvc = installerDataSvc;

    this.downloadedFile = path.join(this.installerDataSvc.tempDir(), 'jdk8.zip');
  }

  executeCommand(command, outputCode) {
    return new Promise((resolve, reject) => {
      child_process.exec(command, (error, stdout, stderr) => {
        if (error) {
          reject('it failed');
        } else {
          if (outputCode === 2) {
            resolve(stderr.toString());
          } else {
            resolve(stdout.toString());
          }
        }
      })
    });
  }

  checkForExistingInstall(selection, data) {
    let versionRegex = /version\s\"\d+\.(\d+)\.\d+_\d+\"/;
    let selectedFolder = '';

    let extension = '';
    let command;
    let opts = ['java'];
    if (process.platform === 'win32') {
      command = 'where java';
      if (selection) {
        extension = '.exe';
      }
    } else {
      command = 'which java';
    }
    if (selection) {
      command = '';
    }

    if(selection) {
      this.existingInstallLocation = selection[0] || this.existingInstallLocation;
      selectedFolder = path.join(this.existingInstallLocation, 'bin') + path.sep;
    }

    this.executeCommand(selectedFolder + 'java' + extension + ' -version', 2)
    .then((output) => {
      return new Promise((resolve, reject) => {
        let version = versionRegex.exec(output)[1];
        if (!version || version < 8) {
          reject('wrong version');
        } else {
          resolve(true);
        }
      });
    }).then((result) => this.executeCommand(selectedFolder + 'javac' + extension + ' -version'), 2)
    .then((output) => this.executeCommand(command, opts, 1))
    .then((output) => {
      this.existingInstall = true;
      if (selection && data) {
        data[JdkInstall.key()][1] = true;
      } else {
        this.existingInstallLocation = path.dirname(path.dirname(output));
      }
      ipcRenderer.send('checkComplete', JdkInstall.key());
    }).catch((error) => {
      data[JdkInstall.key()][1] = false;
      this.existingInstall = false;
      ipcRenderer.send('checkComplete', JdkInstall.key());
    });
  }

  static key() {
    return 'jdk';
  }

  downloadInstaller(progress, success, failure) {
    progress.setStatus('Downloading');

    // Need to download the file
    let writeStream = fs.createWriteStream(this.downloadedFile);

    let options = {
      url: this.downloadUrl,
      headers: {
        'Referer': 'http://www.azulsystems.com/products/zulu/downloads'
      }
    };

    let downloader = new Downloader(progress, success, failure);
    downloader.setWriteStream(writeStream);
    downloader.download(options);
  }

  install(progress, success, failure) {
    progress.setStatus('Installing');
    let installer = new Installer(JdkInstall.key(), progress, success, failure);

    installer.unzip(this.downloadedFile, this.installerDataSvc.installDir())
    .then((result) => { return this.getFolderContents(this.installerDataSvc.installDir(), result); })
    .then((files) => { return this.getFileByName('zulu', files) })
    .then((fileName) => { return this.renameFile(this.installerDataSvc.installDir(), fileName, this.installerDataSvc.jdkDir()); })
    .then((result) => { return installer.succeed(result); })
    .catch((error) => { return installer.fail(error); });
  }

  getFolderContents(parentFolder, result) {
    return new Promise(function (resolve, reject) {
      fs.readdir(parentFolder, function(err, fileList) {
        if (err) {
          Logger.error(JdkInstall.key() + ' - ' + err);
          reject(err);
        } else {
          resolve(fileList);
        }
      });
    });
  }

  getFileByName(name, files) {
    return new Promise(function (resolve) {
      for (let fileName of files) {
        if (fileName.startsWith(name)) {
          resolve(fileName);
          break;
        }
      }
    });
  }

  renameFile(folder, oldName, newName) {
    let filePath = path.join(folder, oldName)
    Logger.info(JdkInstall.key() + ' - Rename ' + filePath + 'to ' + newName)
    return new Promise(function (resolve, reject) {
      fs.rename(filePath, newName, function(err) {
        if (err) {
          Logger.error(JdkInstall.key() + ' - ' + err);
          reject(err);
        } else {
          Logger.info(JdkInstall.key() + ' - Rename ' + filePath + 'to ' + newName + ' SUCCESS')
          resolve(true);
        }
      });
    });
  }
}

export default JdkInstall;
