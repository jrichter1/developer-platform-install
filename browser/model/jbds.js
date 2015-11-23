'use strict';

let request = require('request');
let path = require('path');
let fs = require('fs');
let execFile = require('remote').require('../main/util');

import InstallableItem from './installable-item';

class JbdsInstall extends InstallableItem {
  constructor(installerDataSvc, downloadUrl, installFile) {
    super(downloadUrl, installFile);

    this.installerDataSvc = installerDataSvc;

    this.downloadedFile = path.join(this.installerDataSvc.tempDir(), 'jbds.jar');
    this.installConfigFile = path.join(this.installerDataSvc.tempDir(), 'jbds-autoinstall.xml');
  }

  checkForExistingInstall() {
  }

  downloadInstaller(progress, success, failure) {
    progress.setDesc('Downloading JBDS');

    // Need to download the file
    let writeStream = fs.createWriteStream(this.downloadedFile);
    let downloadSize = 0;
    let currentSize = 0;

    let options = {
      url: this.downloadUrl,
      headers: {
        'Referer': 'https://devstudio.redhat.com/9.0/snapshots/builds/devstudio.product_9.0.mars/latest/all/'
      }
    };

    request(options)
      .on('error', (err) => {
        writeStream.close();
        failure(err);
      })
      .on('response', (response) => {
        downloadSize = response.headers['content-length'];
      })
      .on('data', (data) => {
        currentSize += data.length;
        progress.setCurrent(Math.round((currentSize / downloadSize) * 100));
        progress.setLabel(progress.current + "%");
      })
      .on('end', () => {
        writeStream.end();
      })
      .pipe(writeStream)
      .on('close', () => {
        return success();
      });
  }

  install(progress, success, failure) {
    progress.setDesc('Installing JBDS');

    let data = fs.readFileSync('./browser/model/jbds-autoinstall.xml', 'utf-8');

    data = data.split('${jbdsInstallDir}').join(this.installerDataSvc.jbdsDir());
    data = data.split('${jdkInstallDir}').join(this.installerDataSvc.jdkDir());

    fs.writeFileSync(this.installConfigFile, data);

    execFile(
      path.join(this.installerDataSvc.jdkDir(), 'bin', 'java.exe'),
      [
        '-jar',
        this.downloadedFile,
        this.installConfigFile
      ],
      () => {
        progress.setComplete("Complete");
        success();
      },
      (err) => {
        failure(err);
      }
    );
  }
}

export default JbdsInstall;
