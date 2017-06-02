'use strict';

import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Util from 'browser/model/helpers/util';
import Platform from 'browser/services/platform';
import Downloader from 'browser/model/helpers/downloader';
import Installer from 'browser/model/helpers/installer';
import InstallableItem from 'browser/model/installable-item';
import child_process from 'child_process';
import loadMetadata from 'browser/services/metadata';
import {testBase, downloadTest, installerDataSvc, sandbox, installer, infoStub, errorStub, sha256Stub, downloadUrl, fakeProgress, fakeInstallable, success, failure} from './common';

let reqs = loadMetadata(require('../../../requirements.json'), 'win32');

describe('Cygwin installer', function() {
  testBase('cygwin');
  downloadTest('cygwin');

  describe('installation', function() {
    beforeEach(function() {
      installerDataSvc.getRequirementByName.returns(reqs.virtualbox);
    });

    afterEach(function() {
      installerDataSvc.getRequirementByName.returns(reqs.cygwin);
    });

    it('should not start until virtualbox has finished installing', function() {
      let installSpy = sandbox.spy(installer, 'installAfterRequirements');
      let item2 = new InstallableItem('virtualbox', 'url', 'installFile', 'targetFolderName', installerDataSvc);
      item2.thenInstall(installer);

      installer.install(fakeProgress, success, failure);

      expect(installSpy).not.called;
      expect(fakeProgress.setStatus).to.have.been.calledOnce;
      expect(fakeProgress.setStatus).to.have.been.calledWith('Waiting for Oracle VirtualBox to finish installation');
    });

    it('should install once virtualbox has finished', function() {
      let stub = sandbox.stub(installer, 'installAfterRequirements').returns();
      sandbox.stub(fakeInstallable, 'isInstalled').returns(true);
      let item2 = new InstallableItem('virtualbox', 'url', 'installFile', 'targetFolderName', installerDataSvc);
      item2.setInstallComplete();
      item2.thenInstall(installer);
      installer.install(fakeProgress, success, failure);

      expect(stub).calledOnce;
    });

    it('should set progress to "Installing"', function() {
      sandbox.stub(Installer.prototype, 'exec').resolves(true);
      sandbox.stub(Installer.prototype, 'copyFile').resolves(true);
      sandbox.stub(Platform, 'addToUserPath').resolves(true);

      return installer.installAfterRequirements(fakeProgress, success, failure).then(() => {
        expect(fakeProgress.setStatus).to.have.been.calledOnce;
        expect(fakeProgress.setStatus).to.have.been.calledWith('Installing');
      });
    });

    it('should run the cygwin.exe installer with correct parameters', function() {
      sandbox.stub(Installer.prototype, 'exec').resolves(true);
      sandbox.stub(Installer.prototype, 'copyFile').resolves(true);
      sandbox.stub(Platform, 'addToUserPath').resolves(true);

      return installer.installAfterRequirements(fakeProgress, success, failure).then(()=>{
        expect(Installer.prototype.exec).to.have.been.calledWithMatch('powershell');
      });
    });

    it('should catch errors thrown during the installation', function() {
      let err = new Error('critical error');
      sandbox.stub(child_process, 'execFile').yields(err);
      let failure = sandbox.stub();
      return installer.installAfterRequirements(fakeProgress, success, failure).catch(()=>{
        expect(failure).to.be.calledOnce;
      });
    });

    it('should copy cygwin.exe installer in target directory', function(done) {
      sandbox.stub(Installer.prototype, 'exec').resolves(true);
      sandbox.stub(Installer.prototype, 'execFile').resolves(true);
      sandbox.stub(Installer.prototype, 'copyFile').resolves(true);
      sandbox.stub(Platform, 'addToUserPath').resolves(true);
      installer.installAfterRequirements(fakeProgress, function() {
        expect(Installer.prototype.copyFile).to.be.calledWith(
          installer.downloadedFile,
          path.join(installer.installerDataSvc.cygwinDir(), 'setup-x86_64.exe'));
        done();
      }, failure);
    });
  });

  describe('detectExistingInstall', function() {
    describe('on macOS', function() {
      it('should mark cygwin as detected', function() {
        sandbox.stub(Platform, 'getOS').returns('darwin');
        installer.detectExistingInstall();
        expect(installer.selectedOption).to.be.equal('detected');
        expect(installer.hasOption('detected')).to.be.equal(true);
      });
    });

    describe('on Linux', function() {
      it('should mark cygwin as detected', function() {
        sandbox.stub(Platform, 'getOS').returns('linux');
        installer.detectExistingInstall();
        expect(installer.selectedOption).to.be.equal('detected');
        expect(installer.hasOption('detected')).to.be.equal(true);
      });
    });

    describe('on Windows', function() {
      it('should mark cygwin for installation cygwin is not installed', function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
        sandbox.stub(Util, 'executeCommand').onFirstCall().returns(Promise.reject('cygcheck is not available'));
        installer.ipcRenderer = { on: function() {} };
        installer.detectExistingInstall().then(()=> {
          expect(installer.selectedOption).to.be.equal('install');
          expect(installer.hasOption('install')).to.be.equal(true);
        });
      });

      it('should mark cygwin as detected when cygwin, openssh and rsync packages are installed', function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
        sandbox.stub(Util, 'executeCommand').onFirstCall().returns(Promise.resolve(
          ['Cygwin Package Information',
            'Package              Version        Status',
            'cygwin               2.6.0-1        OK',
            'openssh              7.3p1-2        OK',
            'rsync                3.1.2-1        OK'
          ].join('\n')));
        Util.executeCommand.onSecondCall().returns('/path/to/cygwin');
        installer.detectExistingInstall().then(()=> {
          expect(installer.selectedOption).to.be.equal('detected');
          expect(installer.hasOption('detected')).to.be.equal(true);
        });
      });

      it('should mark cygwin for installation when any of cygwin, openssh, rsync packages is missing', function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
        sandbox.stub(Util, 'executeCommand').onFirstCall().returns(Promise.resolve(
          ['Cygwin Package Information',
            'Package              Version        Status',
            'cygwin               2.6.0-1        OK',
            'openssh              7.3p1-2        OK'
          ].join('\n')));
        Util.executeCommand.onSecondCall().returns('/path/to/cygwin');
        installer.detectExistingInstall().then(()=> {
          expect(installer.selectedOption).to.be.equal('install');
          expect(installer.hasOption('install')).to.be.equal(true);
        });
      });

      it('should remove detected option and mark for installation in case detection ran agian an nothing detected', function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
        sandbox.stub(Util, 'executeCommand').onFirstCall().returns(Promise.resolve(
          ['Cygwin Package Information',
            'Package              Version        Status',
            'cygwin               2.6.0-1        OK',
            'openssh              7.3p1-2        OK',
            'rsync                3.1.2-1        OK'
          ].join('\n')));
        Util.executeCommand.onSecondCall().returns('/path/to/cygwin');
        installer.detectExistingInstall().then(()=> {
          expect(installer.selectedOption).to.be.equal('detected');
          expect(installer.hasOption('detected')).to.be.equal(true);
          Util.executeCommand.rejects('no cygwin detected');
          return installer.detectExistingInstall();
        }).then(()=>{
          expect(installer.option['install']).to.not.equal(undefined);
          expect(installer.option['detected']).to.equal(undefined);
        });
      });
    });
  });
});
