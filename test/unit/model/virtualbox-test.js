'use strict';

import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import {VirtualBoxInstall, VirtualBoxInstallWindows, VirtualBoxInstallDarwin} from 'browser/model/virtualbox';
import Platform from 'browser/services/platform';
import Installer from 'browser/model/helpers/installer';
import InstallableItem from 'browser/model/installable-item';
import Util from 'browser/model/helpers/util';
import child_process from 'child_process';
import loadMetadata from 'browser/services/metadata';
import {testBase, downloadTest, installerDataSvc, sandbox, infoStub, errorStub, sha256Stub, downloadUrl, fakeProgress, success, failure} from './common';

describe('Virtualbox installer', function() {
  testBase('virtualbox');
  downloadTest('virtualbox');

  let version = '5.1.22';
  let revision = '115126';

  let installer;
  beforeEach(function() {
    installer = new VirtualBoxInstallWindows(installerDataSvc, 'virtualbox', downloadUrl, 'virtualbox.exe', 'sha', version, revision);
    installer.ipcRenderer = { on: function() {} };
  });

  describe('installation', function() {
    let downloadedFile = path.join('tempFolder', 'virtualbox.exe');
    let helper, item2;

    beforeEach(function() {
      helper = new Installer('virtualbox', fakeProgress, success, failure);
      item2 = new InstallableItem('jdk', 'url', 'installFile', 'targetFolderName', installerDataSvc);
    });

    describe('on macos', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('macOS');
        installer = new VirtualBoxInstallDarwin(installerDataSvc, 'virtualbox', downloadUrl, 'virtualbox.exe', 'sha', version, revision);
        installer.ipcRenderer = { on: function() {} };
      });

      it('should execute macos installer with osascript', function() {
        sandbox.stub(Installer.prototype, 'exec').resolves(true);
        installer.installAfterRequirements(fakeProgress, success, failure);
        expect(Installer.prototype.exec).calledWith(installer.getScript());
      })
    });

    describe('on windows', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
        installer.ipcRenderer = { on: function() {} };
      });

      it('should execute the silent extract', function() {
        sandbox.stub(child_process, 'execFile').yields('done');

        let data = [
          '--extract',
          '-path',
          installerDataSvc.virtualBoxDir(),
          '--silent'
        ];

        let spy = sandbox.spy(Installer.prototype, 'execFile');
        let item2 = new InstallableItem('jdk', 'url', 'installFile', 'targetFolderName', installerDataSvc);
        item2.setInstallComplete();
        item2.thenInstall(installer);
        installer.install(fakeProgress, success, failure);

        expect(spy).to.have.been.called;
        expect(spy).calledWith(downloadedFile, data);
      });

      it('setup should wait for all downloads to complete', function() {
        let spy = sandbox.spy(installer, 'installMsi');

        installerDataSvc.downloading = true;

        installer.configure(helper);

        expect(fakeProgress.setStatus).calledWith('Waiting for all downloads to finish');
        expect(spy).not.called;
      });

      describe('configure', function() {
        it('should call installMsi if all downloads have finished', function() {
          let spy = sandbox.spy(installer, 'installMsi');
          sandbox.stub(child_process, 'execFile').yields();

          installerDataSvc.downloading = false;

          installer.configure(helper);
          expect(spy).calledOnce;
        });
      });

      describe('installMsi', function() {
        let resolve, reject;

        beforeEach(function() {
          sandbox.stub(child_process, 'execFile').yields(undefined, '', '');
          resolve = (argument) => { Promise.resolve(argument); };
          reject = (argument) => { Promise.reject(argument); };
        });

        it('should set progress to "Installing"', function() {
          installer.installMsi(helper, resolve, reject);

          expect(fakeProgress.setStatus).to.have.been.calledOnce;
          expect(fakeProgress.setStatus).to.have.been.calledWith('Installing');
        });

        it('should execute the msi installer', function() {
          let spy = sandbox.spy(Installer.prototype, 'execFile');

          let msiFile = path.join(installerDataSvc.virtualBoxDir(), 'VirtualBox-' + version + '-r' + revision + '-MultiArch_amd64.msi');
          let opts = [
            '/i',
            msiFile,
            'INSTALLDIR=' + installerDataSvc.virtualBoxDir(),
            'ADDLOCAL=VBoxApplication,VBoxNetwork,VBoxNetworkAdp',
            '/qn',
            '/norestart',
            '/Liwe',
            path.join(installerDataSvc.installDir(), 'vbox.log')
          ];

          installer.installMsi(helper, resolve, reject);

          expect(spy).to.have.been.calledOnce;
          expect(spy).to.have.been.calledWith('msiexec', opts);
        });

        it('should add virtualbox target install folder to user PATH environment variable', function() {
          sandbox.stub(installer, 'configure').resolves(true);
          sandbox.stub(Platform, 'addToUserPath').resolves(true);

          installer.selectedOption = 'install';
          installer.addOption('install', installer.version, 'targetLocation', true);

          return new Promise((resolve, reject)=> {
            installer.install(fakeProgress, resolve, reject);
          }).then(()=>{
            expect(Platform.addToUserPath).to.be.calledOnce;
            expect(Platform.addToUserPath).calledWith(['targetLocation']);
          }).catch(()=>{
            expect.fail();
          });
        });

        afterEach(function () {
          sandbox.restore();
        });
      });
    });

    it('should catch errors during the installation', function(done) {
      sandbox.stub(child_process, 'execFile').yields(new Error('critical error'));
      sandbox.stub(child_process, 'exec').yields(new Error('critical error'));
      item2.setInstallComplete();
      item2.thenInstall(installer);

      try {
        installer.install(fakeProgress, success, failure);
        done();
      } catch (error) {
        console.log(error);
        expect.fail();
      }
    });
  });

  describe('detection', function() {
    let validateStub, stub;
    const VERSION = '5.0.26r1234';
    const VERSION_PARSED = '5.0.26';
    const LOCATION = 'folder/vbox';

    function addCommonDetectionTests() {
      it('should add option \'detected\' with detected version and location', function() {
        return installer.detectExistingInstall().then(()=> {
          expect(installer.option['detected'].location).to.equal(LOCATION);
          expect(installer.option['detected'].version).to.equal(VERSION_PARSED);
        });
      });

      it('should check the detected version', function() {
        return installer.detectExistingInstall().then(()=>{
          expect(installer.option['detected'].version).to.equal(VERSION_PARSED);
        });
      });

      it('should validate the detected version against the required one', function() {
        return installer.detectExistingInstall().then(()=>{
          expect(validateStub).calledOnce;
        });
      });

      it('should remove detected option in case detection ran agian an nothing detected', function() {
        return installer.detectExistingInstall().then(()=>{
          stub.rejects();
          return installer.detectExistingInstall();
        }).then(()=>{
          expect(installer.option['install']).to.not.equal(undefined);
          expect(installer.option['detected']).to.equal(undefined);
        }).catch((error)=>{
          console.log(error);
        });
      });
    }

    describe('on macos', function() {
      beforeEach(function() {
        stub = sandbox.stub(Util, 'executeCommand');
        sandbox.stub(Platform, 'getOS').returns('darwin');
        sandbox.stub(Platform, 'isVirtualizationEnabled').resolves(true);
        stub.onCall(0).resolves(LOCATION);
        stub.onCall(1).resolves(VERSION);

        sandbox.stub(Util, 'folderContains').resolves(LOCATION);
        installer = new VirtualBoxInstallDarwin(installerDataSvc, 'virtualbox', downloadUrl, 'virtualbox.exe', 'sha', version, revision);
        validateStub = sandbox.stub(installer, 'validateVersion').returns();
      });

      addCommonDetectionTests();

      it('should add option \'install\' when nothing detected', function() {
        stub.onCall(1).rejects();
        return installer.detectExistingInstall().then(()=> {
          expect(installer.option['install']).is.not.undefined;
        });
      });
    });

    describe('on windows', function() {
      beforeEach(function() {
        stub = sandbox.stub(Util, 'executeCommand');
        sandbox.stub(Platform, 'getOS').returns('win32');
        sandbox.stub(Platform, 'isVirtualizationEnabled').resolves(true);
        stub.onCall(0).resolves('%VBOX_MSI_INSTALL_PATH%');
        stub.onCall(1).resolves(LOCATION);
        stub.onCall(2).resolves(VERSION);

        sandbox.stub(Util, 'folderContains').resolves(LOCATION);
        installer = new VirtualBoxInstallWindows(installerDataSvc, 'virtualbox', downloadUrl, 'virtualbox.exe', 'sha', version, revision);
        validateStub = sandbox.stub(installer, 'validateVersion').returns();
      });

      addCommonDetectionTests();

      it('should add option \'install\' when nothing detected', function() {
        stub.onCall(2).rejects();
        return installer.detectExistingInstall().then(()=> {
          expect(installer.option['install']).is.not.undefined;
        });
      });

      it('should detect old non msi installed virtualbox', function() {
        stub.onCall(0).resolves('%VBOX_INSTALL_PATH%');
        return installer.detectExistingInstall().then(()=> {
          expect(installer.option['detected'].location).to.equal(LOCATION);
          expect(installer.option['detected'].version).to.equal(VERSION_PARSED);
        });
      });
    });
  });

  describe('version validation', function() {
    let option;

    beforeEach(function() {
      installer.addOption('detected', '', '', false);
      installer.selectedOption = 'detected';
      option = installer.option[installer.selectedOption];
    });

    it('should add warning for newer version', function() {
      installer.option['detected'].version = '5.1.99';
      installer.validateVersion();

      expect(option.error).to.equal('');
      expect(option.warning).to.equal('newerVersion');
      expect(option.valid).to.equal(true);
    });

    it('should add error for older version', function() {
      installer.option['detected'].version = '5.1.1';
      installer.validateVersion();

      expect(option.error).to.equal('oldVersion');
      expect(option.warning).to.equal('');
      expect(option.valid).to.equal(false);
    });

    it('should add neither warning nor error for recomended version', function() {
      installer.option['detected'].version = '5.1.22';
      installer.validateVersion();

      expect(option.error).to.equal('');
      expect(option.warning).to.equal('');
      expect(option.valid).to.equal(true);
    });

    it('should add error for version out of range', function() {
      installer.option['detected'].version = '5.2.12';
      installer.validateVersion();

      expect(option.error).to.equal('');
      expect(option.warning).to.equal('newerVersion');
      expect(option.valid).to.equal(false);
    });
  });
});
