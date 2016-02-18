'use strict';

let fs = require('fs');
let path = require('path');

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

  checkForExistingInstall(selection, data) {
    let child_process = require('child_process');
    let versionRegex = /version\s\"\d\.(\d)\.\d_\d+\"/;
    let selectedFolder = '';

    let extension = '';
    let command;
    if (process.platform === 'win32') {
      command = 'where';
      if (selection) {
        extension = '.exe';
      }
    } else {
      command = 'which';
    }

    if(selection) {
      this.existingInstallLocation = selection[0] || this.existingInstallLocation;
      selectedFolder = path.join(this.existingInstallLocation, 'bin') + path.sep;
    }

    try {
      //try calling java -version to see if java 8 is installed on path/in folder
      let proc = child_process.spawnSync(selectedFolder + 'java' + extension, ['-version']);
      let version = versionRegex.exec(proc.stderr.toString())[1];
      if (!version || version < 8) {
        if (selection && data) {
          data[JdkInstall.key()][1] = false;
          this.existingInstall = false;
        } else {
          return '';
        }
      }

      //find if given java is jdk - see if javac is present on path/in folder
      let jdk = child_process.spawnSync(selectedFolder + 'javac' + extension, ['-version']);
      if (jdk.error) {
        throw 'it is not a jdk';
      }

      //get the java location
      if (selection && data) {
        data[JdkInstall.key()][1] = true;
        this.existingInstall = true;
      } else {
        let location = child_process.spawnSync(command, ['java']).stdout.toString();
        return path.dirname(path.dirname(location));
      }

    } catch (error) {
      //there is no jdk 8 or newer on path/in folder
      if (selection && data) {
        data[JdkInstall.key()][1] = false;
        this.existingInstall = false;
      } else {
        return '';
      }
    }
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
