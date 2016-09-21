'use strict';

let fs = require('fs-extra');
var filesystem = require("fs");
let request = require('request');
let path = require('path');
let ipcRenderer = require('electron').ipcRenderer;

import InstallableItem from './installable-item';
import Downloader from './helpers/downloader';
import Logger from '../services/logger';
import VagrantInstall from './vagrant';
import Installer from './helpers/installer';
import Util from './helpers/util.js';

class CDKInstall extends InstallableItem {
  constructor(installerDataSvc, downloads, targetFolderName) {
    super('cdk',
          downloads,
          targetFolderName,
          installerDataSvc);

    this.cdkFileName = 'cdk.zip';
    this.cdkDownloadedFile = path.join(this.installerDataSvc.tempDir(), this.cdkFileName);

    this.boxName = 'rhel-vagrant-virtualbox.box';
    this.cdkBoxDownloadedFile = path.join(this.installerDataSvc.tempDir(), this.boxName);

    this.ocFileName = 'oc.zip';
    this.ocDownloadedFile = path.join(this.installerDataSvc.tempDir(), this.ocFileName);

    this.cdkSha256 = this.files[this.cdkFileName].sha256sum;
    this.boxSha256 = this.files[this.boxName].sha256sum;
    this.ocSha256 = this.files[this.ocFileName].sha256sum;

    this.pscpPathScript = path.join(this.installerDataSvc.tempDir(), 'set-pscp-path.ps1');

    this.addOption('install','2.0.0','',true);
    this.selected = false;
  }

  static key() {
    return 'cdk';
  }

  detectExistingInstall(cb = new function(){}){
    cb();
  }

  downloadInstaller(progress, success, failure) {
    super.downloadInstaller(progress, success, failure);
    this.cdkDownloadedFile = this.files[this.cdkFileName].downloadedFile;
    this.cdkBoxDownloadedFile = this.files[this.boxName].downloadedFile;
    this.ocDownloadedFile = this.files[this.ocFileName].downloadedFile;
  }

  install(progress, success, failure) {
    if(!this.getInstallAfter() || this.getInstallAfter().isInstalled()) {
      this.postVagrantInstall(progress, success, failure);
    } else {
      let name = this.getInstallAfter().productName;
      progress.setStatus(`Waiting for ${name} to finish installation`);
      ipcRenderer.on('installComplete', (event, arg) => {
        if (!this.isInstalled() &&arg === this.getInstallAfter().keyName) {
          this.postVagrantInstall(progress, success, failure);
        }
      });
    }
  }

  postVagrantInstall(progress, success, failure) {
    progress.setStatus('Installing');
    let installer = new Installer(CDKInstall.key(), progress, success, failure);

    let opts = [
      '-ExecutionPolicy',
      'ByPass',
      '-File',
      this.pscpPathScript
    ];
    let data = [
      '$newPath = "' + this.installerDataSvc.ocDir() + '";',
      '$oldPath = [Environment]::GetEnvironmentVariable("path", "User");',
      '[Environment]::SetEnvironmentVariable("Path", "$newPath;$oldPath", "User");',
      '[Environment]::Exit(0)'
    ].join('\r\n');
    let markerContent = [
      'openshift.auth.scheme=Basic',
      'openshift.auth.username=openshift-dev',
      'openshift.auth.password=devel',
      'vagrant.binary.path=' + path.join(this.installerDataSvc.vagrantDir(), 'bin'),
      'oc.binary.path=' + this.installerDataSvc.ocDir(),
      'rhel.subscription.username=' + this.installerDataSvc.getUsername()
    ].join('\r\n');

    installer.unzip(this.cdkDownloadedFile, this.installerDataSvc.installDir())
    .then((result) => { return installer.unzip(this.ocDownloadedFile, this.installerDataSvc.ocDir(), result); })
    .then((result) => { return installer.copyFile(this.cdkBoxDownloadedFile, path.join(this.installerDataSvc.cdkBoxDir(), this.boxName), result); })
    .then((result) => { return installer.writeFile(this.pscpPathScript, data, result); })
    .then((result) => { return installer.writeFile(this.installerDataSvc.cdkMarker(), markerContent, result); })
    .then((result) => { return installer.execFile('powershell', opts, result); })
    .then((result) => { return this.setupVagrant(installer, result); })
    .then((result) => { return installer.succeed(result); })
    .catch((error) => { return installer.fail(error); });
  }

  createEnvironment() {
    let env = Object.assign({},process.env);
    let vagrantInstall = this.installerDataSvc.getInstallable('vagrant');
    let vboxInstall = this.installerDataSvc.getInstallable('virtualbox');
    let cygwinInstall = this.installerDataSvc.getInstallable('cygwin');
    let vgrPath = vagrantInstall.getLocation();
    let vboxPath = vboxInstall.getLocation();
    let cygwinPath = cygwinInstall.getLocation();
    env['Path'] = env['Path']
      + path.delimiter + path.join(vgrPath,'bin')
      + path.delimiter + path.join(cygwinPath,'bin')
      + path.delimiter + vboxPath;
    return env;
  }

  setupVagrant(installer, result) {
    return new Promise((resolve, reject) => {
      let vagrantInstall = this.installerDataSvc.getInstallable(VagrantInstall.key());
      if (vagrantInstall !== undefined && vagrantInstall.isInstalled()) {
        return this.postVagrantSetup(installer, result)
        .then((res) => { return resolve(res); })
        .catch((err) => { return reject(err); });
      } else {
        Logger.info(CDKInstall.key() + ' - Vagrant has not finished installing, listener created to be called when it has.');
        ipcRenderer.on('installComplete', (event, arg) => {
          if (arg == 'vagrant') {
            return this.postVagrantSetup(installer, result)
            .then((res) => { return resolve(res); })
            .catch((err) => { return reject(err); });
          }
        });
      }
    });
  }

  postVagrantSetup(installer, promise) {
    Logger.info(CDKInstall.key() + ' - postVagrantSetup called');
    let vagrantInstall = this.installerDataSvc.getInstallable(VagrantInstall.key());
    if (vagrantInstall.isInstalled()) {
      // Vagrant is installed, add CDK bits
      let opts = {
        env: this.createEnvironment(),
        cwd: this.installerDataSvc.cdkBoxDir()
      };
      let cdkPluginsDir = path.join(this.installerDataSvc.cdkDir(), 'plugins');
      // fill gem installation chain
      let execs = this.createGemInstalls(installer,cdkPluginsDir, opts);
      // add command to remove existing box and to add it back again
      execs.push((result)=>{
        return new Promise((resolve,reject) => {
          installer.exec('vagrant box remove cdkv2 -f',opts, promise).then((result)=> {
            resolve(result);
          }).catch((result) => {
            resolve(result);
          });
        });
      },(result)=>{
        return installer.exec('vagrant box add --name cdkv2 ' + this.boxName , opts, result);
      });
      return Util.runPromiseSequence(execs);
    }
  }

  createGemInstalls(installer,dir,opts) {
    var results = [];
    filesystem.readdirSync(dir).forEach((file)=>{
        file = path.join(dir,file);
        var stat = filesystem.statSync(file);
        if (stat && !stat.isDirectory() && path.extname(file)=='.gem') {
          results.push((result)=>{
            return installer.exec('vagrant plugin install "' + file + '"', opts, result);
          });
        }
    });
    return results;
  }
}

export default CDKInstall;
