'use strict';

import Util from './helpers/util';
import path from 'path';
import Downloader from './helpers/downloader';
import fs from 'fs-extra';

let reqs = Util.resolveFile('.', 'requirements.json');

class InstallableItem {
  constructor(keyName, downloads, targetFolderName, installerDataSvc) {
    this.keyName = keyName;
    this.files = {};

    let requirement;
    for (let key in reqs) {
      let regex = new RegExp('^' + keyName + '\\.\\w+');
      if (regex.test(key)) {
        requirement = reqs[key];
      }
      if (downloads.indexOf(key) > -1) {
        this.files[key] = reqs[key];
      }
    }

    this.productName = requirement.name;
    this.productVersion = requirement.version;
    this.productDesc = requirement.description;
    this.targetFolderName = targetFolderName;
    this.installerDataSvc = installerDataSvc;
    this.existingInstall = false;
    this.existingInstallLocation = '';
    this.existingVersion = '';
    this.downloaded = false;
    this.installed = false;

    this.selected = true;
    this.version = requirement.version;

    this.detected = false;
    this.detectedVersion = 'unknown';
    this.detectedInstallLocation = '';

    this.isCollapsed = true;
    this.option = new Set();
    this.selectedOption = "install";

    this.downloader = null;
    this.downloadFolder = path.normalize(path.join(__dirname, "../../../.."));

    this.installAfter = undefined;

    if (downloads.length === 1) {
      let key = downloads[0];
      this.checksum = this.files[key].sha256sum;
      this.downloadedFile = path.join(this.installerDataSvc.tempDir(), key);
      this.bundledFile = path.join(this.downloadFolder, key);
    }
  }

  getProductName() {
    return this.productName;
  }

  getProductVersion() {
    if(this.hasOption(this.selectedOption) && this.selectedOption==='detected') {
      return this.option[this.selectedOption].version;
    }
    return this.productVersion;
  }

  getProductDesc() {
    return this.productDesc;
  }

  getDownloadUrl() {
    return this.downloadUrl;
  }

  isDownloaded() {
    return this.downloaded;
  }

  isInstalled() {
    return this.installed;
  }

  hasExistingInstall() {
    return this.existingInstall;
  }

  existingInstallLocation() {
    return this.existingInstallLocation;
  }

  isDownloadRequired() {
    // To be overridden
  }

  setDownloadComplete() {
    this.downloaded = true;
  }

  setInstallComplete() {
    this.installed = true;
  }

  checkForExistingInstall() {
    // To be overridden
  }

  downloadInstaller(progress, success, failure) {
    progress.setStatus('Downloading');

    let downloader = new Downloader(progress, success, failure, Object.keys(this.files).length);
    let username = this.installerDataSvc.getUsername(),
        password = this.installerDataSvc.getPassword();

    for (let key in this.files) {
      let downloadedFile = path.join(this.installerDataSvc.tempDir(), key);
      let url, auth;

      if (this.files[key].dmUrl) {
        url = this.files[key].dmUrl;
        auth = true;
      } else {
        url = this.files[key].url;
        auth = false;
      }

      if(!fs.existsSync(path.join(downloadedFile))) {
        if (auth) {
          downloader.downloadAuth(url, username, password, downloadedFile, this.files[key].sha256sum);
        } else {
          downloader.download(url, downloadedFile, this.files[key].sha256sum);
        }
      } else {
        this.downloadedFile = path.join(this.downloadFolder, key);
        downloader.closeHandler();
      }
      this.files[key].downloadedFile = downloadedFile;
    }
  }

  install(progress, success, failure) {
    // To be overridden
    success();
  }

  setup(progress, success, failure) {
    // To be overridden
    success();
  }

  changeIsCollapsed() {
      this.isCollapsed = !this.isCollapsed;
  }

  hasOption(name) {
    return this.option[name]!=undefined;
  }

  addOption(name, version, location, valid) {
    this.option[name] = {
      'version'  : version,
      'location' : location,
      'valid'    : valid,
      'error'    : '',
      'warning'  : ''
    };
  }

  setOptionLocation(name,location) {
    if(this.option[name]) {
      this.option[name].location = location;
    }
  }

  // Override parent "true" and check if we have something setup
  isConfigured() {
    let t =
      this.selectedOption == 'install'
        ||
      this.selectedOption == 'detected' && this.hasOption('detected') && this.option['detected'].valid
        ||
      this.selectedOption == 'detected' && !this.hasOption('detected');
    return t;
  }

  isSkipped() {
    let t = this.selectedOption == 'detected' && !this.hasOption('detected');
    return t;
  }


  getLocation() {
    return this.isSkipped() ? "" : this.option[this.selectedOption].location;
  }

  validateVersion() {

  }

  restartDownload() {
    this.downloader.restartDownload();
  }

  getInstallAfter() {
    let installable = this.installAfter;
    while ( installable !== undefined && installable.isSkipped()) {
      installable = installable.installAfter;
    }
    return installable;
  }

  thenInstall(installer) {
    installer.installAfter = this;
    return installer;
  }

}

export default InstallableItem;
