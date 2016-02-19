'use strict';

let request = require('request');
let path = require('path');
let fs = require('fs');
let ipcRenderer = require('electron').ipcRenderer;
let Glob = require("glob").Glob;

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

  checkVersion(location, regex) {
    return new Promise(function (resolve) {
      fs.readFile(path.join(location, 'readme.txt'), (err, data) => {
        if (err) {
          resolve(false);
        } else {
          if(regex.exec(data.toString())[1] >= 9) {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      });
    });
  }

  checkForExistingInstall(selection, data) {
    let pattern, directory;
    let versionRegex = /version\s(\d+)\.\d+\.\d+/;
    let matched = false;

    if(selection) {
      this.existingInstallLocation = selection[0] || this.existingInstallLocation;
    }

    if (process.platform === 'win32') {
      directory = selection ? selection[0] : 'c:';
      pattern = selection ? 'studio/jbdevstudio.exe' : '**/studio/jbdevstudio.exe';
    } else {
      directory = selection ? selection[0] : process.env.HOME;
      pattern = selection ? 'studio/jbdevstudio' : '**/studio/jbdevstudio';
    }

    let globster = new Glob(pattern, { cwd: directory });
    globster.on('match', (match) => {
      let jbdsRoot = path.join(directory, path.dirname(path.dirname(match)));
      this.checkVersion(jbdsRoot, versionRegex)
      .then((result) => {
        if (result) {
          globster.abort();
          matched = true;
          this.existingInstall = true;
          if (selection && data) {
            data[JbdsInstall.key()][1] = true;
          } else {
            this.existingInstallLocation = selection ? this.existingInstallLocation : jbdsRoot;
          }
          ipcRenderer.send('checkComplete', JbdsInstall.key());
        } else {
          if (selection && data) {
            data[JbdsInstall.key()][1] = false;
          }
          this.existingInstall = false;
          ipcRenderer.send('checkComplete', JbdsInstall.key());
        }
      });
    }).on('error', (err) => {
      console.log(err);
    }).on('end', () => {
      if (!matched) {
        if (data && selection) {
          data[JbdsInstall.key()][1] = false;
        }
        this.existingInstall = false;
        ipcRenderer.send('checkComplete', JbdsInstall.key());
      }
    });
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
