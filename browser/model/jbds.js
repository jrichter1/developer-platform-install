'use strict';

let request = require('request');
let path = require('path');
let fs = require('fs');
let ipcRenderer = require('electron').ipcRenderer;
let child_process = require('child_process');

import JbdsAutoInstallGenerator from './jbds-autoinstall';
import InstallableItem from './installable-item';
import Downloader from './helpers/downloader';
import Installer from './helpers/installer';
import Logger from '../services/logger';
import JdkInstall from './jdk-install';

class JbdsInstall extends InstallableItem {
  constructor(installerDataSvc, downloadUrl, installFile) {
    super('JBDS', 1600, downloadUrl, installFile);

    this.installerDataSvc = installerDataSvc;

    this.downloadedFile = path.join(this.installerDataSvc.tempDir(), 'jbds.jar');
    this.installConfigFile = path.join(this.installerDataSvc.tempDir(), 'jbds-autoinstall.xml');
  }

  static key() {
    return 'jbds';
  }

  checkForExistingInstall(selection, data) {
    let command, fileName, options, selectedFolder;
    if (process.platform === 'win32') {
      fileName = 'jbdevstudio.exe';
      command = 'cd c:\ && dir ' + fileName + ' /b/s';
    } else {
      fileName = 'jbdevstudio';
      command = 'find';
      selectedFolder = process.env.HOME;
      options = [selectedFolder, '-name', fileName]
    }

    if(selection) {
      this.existingInstallLocation = selection[0] || this.existingInstallLocation;
      options[0] = path.join(this.existingInstallLocation);
    }

    try {
      let proc = child_process.spawnSync(command, options);
      var lines = proc.stdout.toString().split('\n');
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].length > 0 && path.dirname(lines[i]).endsWith('studio')) {
          if (selection && path.dirname(path.dirname(lines[i])) !== options[0]) {
            console.log(options[0]);
            console.log(path.dirname(path.dirname(lines[i])));
            continue;
          }

          if (selection && data) {
            data[JbdsInstall.key()][1] = true;
            this.existingInstall = true;
            return;
          }
          return path.dirname(path.dirname(lines[i]));
        }
      }

      if (selection && data) {
        data[JbdsInstall.key()][1] = false;
        this.existingInstall = false;
      } else {
        return '';
      }
    } catch (err) {
      if (selection && data) {
        data[JbdsInstall.key()][1] = false;
        this.existingInstall = false;
      } else {
        return '';
      }
    }

    // child_process.exec(command, (error, stdout, stderr) => {
    //   if (error) {
    //     return callback('');
    //   } else {
    //     var lines = stdout.toString().split('\n');
    //     var results = new Array();
    //     lines.forEach(function(line) {
    //       if (line.length > 0 && path.dirname(line).endsWith('studio')) {
    //         return callback(path.dirname(path.dirname(line)));
    //       } else {
    //         continue;
    //       }
    //     });
    //
    //     return callback('');
    //   }
    // });
  }

  downloadInstaller(progress, success, failure) {
    progress.setStatus('Downloading');

    // Need to download the file
    let writeStream = fs.createWriteStream(this.downloadedFile);

    let options = {
      url: this.downloadUrl,
      headers: {
        'Referer': 'https://devstudio.redhat.com/9.0/snapshots/builds/devstudio.product_9.0.mars/latest/all/'
      }
    };

    let downloader = new Downloader(progress, success, failure);
    downloader.setWriteStream(writeStream);
    downloader.download(options);
  }

  install(progress, success, failure) {
    progress.setStatus('Installing');
    this.installGenerator = new JbdsAutoInstallGenerator(this.installerDataSvc.jbdsDir(), this.installerDataSvc.jdkDir());
    let installer = new Installer(JbdsInstall.key(), progress, success, failure);

    Logger.info(JbdsInstall.key() + ' - Generate JBDS auto install file content');
    let data = this.installGenerator.fileContent();
    Logger.info(JbdsInstall.key() + ' - Generate JBDS auto install file content SUCCESS');

    installer.writeFile(this.installConfigFile, data)
    .then((result) => { return this.postJDKInstall(installer, result);})
    .then((result) => { return installer.succeed(result); })
    .catch((error) => { return installer.fail(error); });
  }

  postJDKInstall(installer, result) {
    return new Promise((resolve, reject) => {
      let jdkInstall = this.installerDataSvc.getInstallable(JdkInstall.key());

      if (jdkInstall !== undefined && jdkInstall.isInstalled()) {
        return this.headlessInstall(installer, result)
        .then((res) => { return resolve(res); })
        .catch((err) => { return reject(err); });
      } else {
        Logger.info(JbdsInstall.key() + ' - JDK has not finished installing, listener created to be called when it has.');
        ipcRenderer.on('installComplete', (event, arg) => {
          if (arg == JdkInstall.key()) {
            return this.headlessInstall(installer, result)
            .then((res) => { return resolve(res); })
            .catch((err) => { return reject(err); });
          }
        });
      }
    });
  }

  headlessInstall(installer, promise) {
    Logger.info(JbdsInstall.key() + ' - headlessInstall() called');
    let javaOpts = [
      '-jar',
      this.downloadedFile,
      this.installConfigFile
    ];
    let res = installer.execFile(path.join(this.installerDataSvc.jdkDir(), 'bin', 'java.exe'), javaOpts)
    .then((result) => { return this.setupCdk(result); });

    return res;
  }

  setupCdk(result) {
    let escapedPath = this.installerDataSvc.cdkVagrantfileDir().replace(/\\/g, "\\\\").replace(/:/g, "\\:");
    Logger.info(JbdsInstall.key() + ' - Append CDKServer runtime information to JBDS runtime location');
    return new Promise((resolve, reject) => {
      fs.appendFile(
        path.join(this.installerDataSvc.jbdsDir(), 'studio', 'runtime_locations.properties'),
        'CDKServer=' + escapedPath + ',true',
        (err) => {
          if (err) {
            Logger.error(JbdsInstall.key() + ' - ' + err);
            reject(err);
          } else {
            Logger.info(JbdsInstall.key() + ' - Append CDKServer runtime information to JBDS runtime location SUCCESS');
            resolve(true);
          }
        });
    });
  }
}

export default JbdsInstall;
