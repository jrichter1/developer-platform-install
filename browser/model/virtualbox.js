'use strict';

let fs = require('fs');
let path = require('path');
let ipcRenderer = require('electron').ipcRenderer;

import InstallableItem from './installable-item';
import Downloader from './helpers/downloader';
import Logger from '../services/logger';
import Installer from './helpers/installer';
import Util from './helpers/util';

class VirtualBoxInstall extends InstallableItem {
  constructor(version, revision, installerDataSvc, downloadUrl, installFile) {
    super('VirtualBox', 700, downloadUrl, installFile);

    this.installerDataSvc = installerDataSvc;

    this.version = version;
    this.revision = revision;
    this.downloadedFile = path.join(this.installerDataSvc.tempDir(), 'virtualBox-' + this.version + '.exe');

    this.downloadUrl = this.downloadUrl.split('${version}').join(this.version);
    this.downloadUrl = this.downloadUrl.split('${revision}').join(this.revision);

    this.msiFile = path.join(this.installerDataSvc.tempDir(), '/VirtualBox-' + this.version + '-r' + this.revision + '-MultiArch_amd64.msi');
  }

  static key() {
    return 'virtualbox';
  }

  checkForExistingInstall(selection, data) {
    let versionRegex = /(\d+)\.\d+\.\d+r\d+/;
    let command;
    let extension = '';
    let directory;

    if (process.platform === 'win32') {
      command = 'echo %VBOX_INSTALL_PATH%';
      extension = '.exe';
    } else {
      command = 'which virtualbox';
    }
    if (selection) {
      this.existingInstallLocation = selection[0] || this.existingInstallLocation;
    }

    Util.executeCommand(command, 1)
    .then((output) => {
      return new Promise((resolve, reject) => {
        if (process.platform === 'win32') {
          if (output.length < 1) {
            return Util.executeCommand('echo %VBOX_MSI_INSTALL_PATH%', 1)
            .catch((err) => { return reject(err) });
          } else {
            return resolve(output);
          }
        } else {
          return Util.findText(output, 'INSTALL_DIR=')
          .then((result) => {
            directory = result.split('=')[1];
            if (selection && directory !== selection[0]) {
              return reject('selection is not on path');
            } else {
              return resolve(directory);
            }
          });
        }
      });
    }).then((output) => { return Util.folderContains(output, ['VirtualBox' + extension, 'VBoxManage' + extension]) })
    .then((output) => { return Util.executeCommand(path.join(output, 'VBoxManage' + extension) + ' -v', 1) })
    .then((output) => {
      this.existingVersion = parseInt(versionRegex.exec(output)[1]);
      this.existingInstall = this.existingVersion + 2 >= this.version.charAt(0);
      if (selection && data) {
        data[VirtualBoxInstall.key()][1] = true;
      } else {
        this.existingInstallLocation = directory;
      }
      ipcRenderer.send('checkComplete', VirtualBoxInstall.key());
    }).catch((error) => {
      if (data) {
        data[VirtualBoxInstall.key()][1] = false;
      }
      this.existingInstall = false;
      ipcRenderer.send('checkComplete', VirtualBoxInstall.key());
    });
  }

  downloadInstaller(progress, success, failure) {
    progress.setStatus('Downloading');

    // Need to download the file
    let writeStream = fs.createWriteStream(this.downloadedFile);

    let downloader = new Downloader(progress, success, failure);
    downloader.setWriteStream(writeStream);
    downloader.download(this.downloadUrl);
  }

  install(progress, success, failure) {
    let installer = new Installer(VirtualBoxInstall.key(), progress, success, failure);

    installer.execFile(this.downloadedFile,
      ['--extract',
        '-path',
        this.installerDataSvc.tempDir(),
        '--silent'])
    .then((result) => { return this.configure(installer, result) })
    .then((result) => { return installer.succeed(result); })
    .catch((error) => { return installer.fail(error); });
  }

  setup(progress, success, failure) {
    //no need to setup anything for vbox
    progress.setStatus('Setting up');
    progress.setComplete();
    success();
  }

  configure(installer, result) {
    return new Promise((resolve, reject) => {
      // If downloading is not finished wait for event
      if (this.installerDataSvc.downloading) {
        Logger.info(VirtualBoxInstall.key() + ' - Waiting for all downloads to complete');
        installer.progress.setStatus('Waiting for all downloads to finish');
        ipcRenderer.on('downloadingComplete', (event, arg) => {
          // time to start virtualbox installer
          return this.installMsi(installer,resolve,reject);
        });
      } else { // it is safe to call virtualbox installer
        //downloading is already over vbox install is safe to start
        return this.installMsi(installer,resolve,reject);
      }
    });
  }

  installMsi(installer,resolve,reject) {
    installer.progress.setStatus('Installing');
    return installer.execFile('msiexec',
    [
      '/i',
      this.msiFile,
      'INSTALLDIR=' + this.installerDataSvc.virtualBoxDir(),
      '/qb!',
      '/norestart',
      '/Liwe',
      path.join(this.installerDataSvc.installDir(), 'vbox.log')
    ]).then((res) => { return resolve(res); })
    .catch((err) => { return reject(err); });
  }
}

export default VirtualBoxInstall;
