'use strict';

import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Installer from 'browser/model/helpers/installer';
import InstallerDataService from 'browser/services/data';
import Platform from 'browser/services/platform';
import InstallableItem from 'browser/model/installable-item';
import child_process from 'child_process';
import {testBase, downloadTest, installerDataSvc, sandbox, installer, infoStub, errorStub, sha256Stub, downloadUrl, fakeProgress, fakeInstallable, success, failure} from './common';

describe('CDK installer', function() {
  testBase('cdk');
  downloadTest('cdk');

  describe('installAfterRequirements', function() {
    it('should set progress to "Installing"', function() {
      sandbox.stub(Installer.prototype, 'unzip').rejects('done');
      installer.installAfterRequirements(fakeProgress, success, failure);
      expect(fakeProgress.setStatus).calledOnce;
      expect(fakeProgress.setStatus).calledWith('Installing');
    });

    it('should fail for cdk file without known extension', function() {
      installer.downloadedFile = 'cdk.foo';
      sandbox.stub(Platform, 'getUserHomePath').returns(Promise.resolve('home'));
      let stubCopy = sandbox.stub(Installer.prototype, 'copyFile');
      let stubUnzip = sandbox.stub(Installer.prototype, 'unzip');
      return new Promise((resolve, reject)=> {
        installer.installAfterRequirements(fakeProgress, resolve, reject);
      }).catch(()=> {
        expect(stubCopy).to.have.been.not.called;
        expect(stubUnzip).to.have.been.not.called;
      });
    });

    describe('on windows', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
        sandbox.stub(Platform, 'getUserHomePath').returns(Promise.resolve(path.join('Users', 'dev1')));
        sandbox.stub(Installer.prototype, 'copyFile').resolves();
        sandbox.stub(Installer.prototype, 'exec').resolves();
        sandbox.stub(child_process, 'exec').yields();
        sandbox.stub(Platform, 'addToUserPath').resolves();
        sandbox.stub(installer, 'createEnvironment').returns({PATH:''});
      });

      it('should copy cdk exe file to install folder', function(done) {
        installer.installAfterRequirements(fakeProgress, function success() {
          expect(Installer.prototype.copyFile).to.have.been.called;
          expect(Installer.prototype.copyFile).calledWith(installer.downloadedFile, path.join(installerDataSvc.ocDir(), 'minishift.exe'));
          done();
        }, function failure(e) {
          console.log(e);
          expect.fail();
        });
      });

      it('should run downloaded file with augmented environment', function() {
        return new Promise((resolve, reject)=> {
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=> {
          expect(Installer.prototype.exec).to.have.been.calledWith(
              path.join(installerDataSvc.ocDir(), 'minishift.exe') + ' setup-cdk --force --default-vm-driver=virtualbox',
              {PATH:''}
            );
          expect(installer.createEnvironment).to.have.been.called;
        });
      });

      it('should run downloaded file with hyper-v if detected', function() {
        let hyperv = new InstallableItem('hyperv', 'url', 'file', 'folder', installerDataSvc, false);
        hyperv.addOption('detected');
        installerDataSvc.getInstallable.withArgs('hyperv').returns(hyperv);

        return new Promise((resolve, reject)=> {
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=> {
          expect(Installer.prototype.exec).to.have.been.calledWith(
              path.join(installerDataSvc.ocDir(), 'minishift.exe') + ' setup-cdk --force --default-vm-driver=hyperv',
              {PATH:''}
            );
          expect(installer.createEnvironment).to.have.been.called;
        });
      });

      it('should not run chmod command on windows for installed file', function() {
        return new Promise((resolve, reject)=>{
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=>{
          expect(child_process.exec).not.called;
        });
      });

      it('should find installed oc.exe cli, minishift.exe and add them to user PATH', function() {
        return new Promise((resolve, reject)=> {
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=> {
          expect(Platform.addToUserPath).calledWith([
            path.join(process.cwd(), 'Users', 'dev1', '.minishift', 'cache', 'oc', '1.4.1', 'oc.exe'),
            path.join(installerDataSvc.ocDir(), 'minishift.exe')
          ]);
        });
      });

      it('should add current user to `Hyper-V Administrators` group', function() {
        Installer.prototype.exec.restore();
        sandbox.stub(Installer.prototype,'exec').onCall(0).rejects('Error');
        Installer.prototype.exec.onCall(1).resolves();
        return new Promise((resolve, reject)=>{
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=>{
          expect(Installer.prototype.exec).calledWith('net localgroup "Hyper-V Administrators" %USERDOMAIN%\\%USERNAME% /add');
        }).catch(()=>{
          expect.fail();
        });
      });

      it('should stop minishift before running `minishift setup-cdk`', function() {
        Installer.prototype.exec.restore();
        sandbox.stub(Installer.prototype,'exec').onCall(0).resolves();
        Installer.prototype.exec.onCall(1).rejects('error');
        return new Promise((resolve, reject)=>{
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=>{
          expect(Installer.prototype.exec).calledWith(`${installer.minishiftExeLocation} stop`);
        }).catch(()=>{
          expect.fail();
        });
      });
    });

    describe('on macos', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('darwin');
        sandbox.stub(Platform, 'getUserHomePath').returns(Promise.resolve(path.join('Users', 'dev1')));
        sandbox.stub(Installer.prototype, 'copyFile').resolves();
        sandbox.stub(Installer.prototype, 'exec').resolves();
        sandbox.stub(child_process, 'exec').yields();
        sandbox.stub(Platform, 'addToUserPath').resolves();
        sandbox.stub(installer, 'createEnvironment').returns({PATH:''});
      });

      it('should copy cdk file without extension to install folder', function() {
        return new Promise((resolve, reject)=>{
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).catch(()=> {
          expect(Installer.prototype.copyFile).to.have.been.called;
          expect(Installer.prototype.copyFile).calledWith(installer.downloadedFile, path.join(installerDataSvc.ocDir(), 'minishift'));
        });
      });

      it('should set executable bit for installed files minishift and oc', function() {
        return new Promise((resolve, reject)=>{
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=>{
          expect(child_process.exec).calledWith('chmod +x ' + path.join(installerDataSvc.ocDir(), 'minishift'));
          expect(child_process.exec).calledWith('chmod +x ' + path.join(process.cwd(), 'Users', 'dev1', '.minishift', 'cache', 'oc', '1.4.1', 'oc'));
        });
      });

      it('should find installed oc cli, minishift and add them to user PATH', function() {
        return new Promise((resolve, reject)=>{
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=>{
          expect(Platform.addToUserPath).calledWith([
            path.join(process.cwd(), 'Users', 'dev1', '.minishift', 'cache', 'oc', '1.4.1', 'oc'),
            path.join(installerDataSvc.ocDir(), 'minishift')
          ]);
        });
      });
    });
  });

  describe('createEnvironment', function() {    
    beforeEach(function() {
      let cygwin = new InstallableItem('cygwin', 'url', 'cygwin.exe', 'cygwin', installerDataSvc, false);
      let vbox = new InstallableItem('virtualbox', 'url', 'virtualbox.exe', 'virtualbox', installerDataSvc, false);

      installerDataSvc.getInstallable.withArgs('cygwin').returns(cygwin);
      installerDataSvc.getInstallable.withArgs('virtualbox').returns(vbox);
    });

    describe('on macos', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('darwin');
      });

      it('returns copy of Platform.ENV with virtualbox location added to PATH', function() {
        sandbox.stub(Platform, 'getEnv').returns({'PATH':'path'});
        let pathArray = ['virtualbox', 'path'];
        if (process.platform === 'win32') {
          pathArray.splice(1, 0, 'cygwin');
        }
        expect(installer.createEnvironment()[Platform.PATH]).to.be.equal(pathArray.join(path.delimiter));
      });

      it('does not use empty path', function() {
        sandbox.stub(Platform, 'getEnv').returns({'PATH':''});
        let pathArray = ['virtualbox'];
        if (process.platform === 'win32') {
          pathArray.push('cygwin');
        }
        expect(installer.createEnvironment()[Platform.PATH]).to.be.equal(pathArray.join(path.delimiter));
      });
    });

    describe('on windows', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
      });

      it('returns copy of Platform.ENV with virtualbox and cygwin locations added to PATH', function() {
        sandbox.stub(Platform, 'getEnv').returns({'Path':'path'});
        let pathArray = ['virtualbox', 'path'];
        if (process.platform === 'win32') {
          pathArray.splice(1, 0, 'cygwin');
        }
        expect(installer.createEnvironment()[Platform.PATH]).to.be.equal(pathArray.join(path.delimiter));
      });

      it('does not use empty path', function() {
        sandbox.stub(Platform, 'getEnv').returns({'Path':''});
        let pathArray = ['virtualbox'];
        if (process.platform === 'win32') {
          pathArray.push('cygwin');
        }
        expect(installer.createEnvironment()[Platform.PATH]).to.be.equal(pathArray.join(path.delimiter));
      });
    });
  });
});
