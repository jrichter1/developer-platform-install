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

  checkForExistingInstall(cb) {
    let child_process = require('child_process');
    let versionRegex = /version\s\"\d\.(\d)\.\d_\d+\"/;

    try {
      let proc = child_process.spawnSync('java', ['-version']);
      let version = versionRegex.exec(proc.stderr.toString())[1];
      if (!version || version < 8) {
        return '';
      }

      child_process.spawnSync('javac', ['-version']);
      let command;
      if (process.platform === 'win32') {
        command = 'where';
      } else {
        command = 'which';
      }
      let location = child_process.spawnSync(command, ['java']).stdout.toString();
      return path.dirname(path.dirname(location));
    } catch (error) {
      return '';
    }

    // child_process.exec('java -version', (error, stdout, stderr) => {
    //   if (error) {
    //     return null;
    //   } else {
    //     //java -version outputs to stderr instead of stdout
    //     version = versionRegex.exec(stderr)[1];
    //
    //     child_process.exec('javac -version', (err, stdo, stde) => {
    //       if (err) {
    //         installation = 'jre';
    //       } else {
    //         installation = 'jdk';
    //       }
    //
    //       let command;
    //       if (process.platform === 'win32') {
    //         command = 'where';
    //       } else {
    //         command = 'which';
    //       }
    //       child_process.exec(command + ' java', (er, sto, ste) => {
    //         if (er) {
    //           return null;
    //         } else {
    //           result = sto;
    //           cb(result);
    //         }
    //       });
    //     });
    //   }
    // });
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
