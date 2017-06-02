'use strict';

import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import rimraf from 'rimraf';
import Platform from 'browser/services/platform';
import Util from 'browser/model/helpers/util';
import Installer from 'browser/model/helpers/installer';
import JdkInstall from 'browser/model/jdk-install';
import {testBase, downloadTest, installerDataSvc, sandbox, installer, infoStub, errorStub, sha256Stub, downloadUrl, fakeProgress, success, failure} from './common';

describe('JDK installer', function() {
  testBase('jdk');
  downloadTest('jdk');

  function mockDetectedJvm(version, location = 'java.home = /java/home\n') {
    sandbox.stub(JdkInstall.prototype, 'findMsiInstalledJava').returns(Promise.resolve(''));
    sandbox.stub(Util, 'executeCommand')
      .onFirstCall().returns(Promise.resolve(`version "${version}"`))
      .onSecondCall().returns(Promise.resolve(location));
    sandbox.stub(Util, 'writeFile').returns(Promise.resolve(true));
    sandbox.stub(Util, 'executeFile').returns(Promise.resolve(true));
  }

  describe('when detecting existing installation', function() {
    it('should detect java location if installed', function() {
      mockDetectedJvm('1.8.0_111');
      return installer.detectExistingInstall().then(()=>{
        expect(installer.selectedOption).to.be.equal('detected');
        expect(installer.hasOption('detected')).to.be.equal(true);
        expect(installer.getLocation()).to.be.equal('/java/home');
      });
    });

    it('should create deafult empty callback if not provided', function() {
      mockDetectedJvm('1.8.0_1');
      try {
        installer.detectExistingInstall();
      } catch (exception)  {
        expect.fail('Did not created default empty callback');
      }
    });

    it('should not fail if selected option is not present in available options', function() {
      installer.selectedOption = 'detected';
      installer.validateVersion();
    });

    describe('on windows', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
      });

      it('should select openjdk for installation if no java detected', function() {
        mockDetectedJvm('');
        return installer.detectExistingInstall().then(()=>{
          expect(installer.selectedOption).to.be.equal('install');
          expect(installer.getLocation()).to.be.equal('');
        });
      });

      // FIXME is not the case for JDK 9, because version has different format
      it('should select openjdk for installation if newer than supported java version detected', function() {
        mockDetectedJvm('1.9.0_1');
        return installer.detectExistingInstall().then(()=>{
          expect(installer.selectedOption).to.be.equal('detected');
        });
      });

      it('should select openjdk for installation if older than supported java version detected', function() {
        mockDetectedJvm('1.7.0_1');
        return installer.detectExistingInstall().then(()=>{
          expect(installer.selectedOption).to.be.equal('install');
        });
      });

      it('should reject openjdk if location for java is not found', function() {
        mockDetectedJvm('1.8.0', '');
        return installer.detectExistingInstall().then(()=> {
          expect(installer.selectedOption).to.be.equal('install');
        });
      });

      it('should check for available msi installtion', function() {
        mockDetectedJvm('1.8.0_1');
        installer.findMsiInstalledJava.restore();
        return installer.detectExistingInstall().then(()=>{
          expect(Util.writeFile).to.have.been.calledWith(
            installer.getMsiSearchScriptLocation(), installer.getMsiSearchScriptData());
          expect(Util.executeFile).to.have.been.calledWith(
            'powershell', installer.getMsiSearchScriptPowershellArgs(installer.getMsiSearchScriptLocation()));
        });
      });

      it('should remove detected option and mark for installation in case detection ran agian an nothing detected', function() {
        mockDetectedJvm('1.9.0_1');
        return installer.detectExistingInstall().then(()=>{
          expect(installer.selectedOption).to.be.equal('detected');
          Util.executeCommand.rejects();
          return installer.detectExistingInstall();
        }).then(()=>{
          expect(installer.selectedOption).equals('install');
          expect(installer.option['detected']).to.equal(undefined);
        });
      });
    });

    describe('on macos', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('darwin');
      });

      it('should not select jdk for installation if no java detected', function() {
        mockDetectedJvm('');
        return installer.detectExistingInstall().then(()=>{
          expect(installer.selectedOption).to.be.equal('detected');
        });
      });

      it('should not select openjdk for installation if newer than supported supported version detected', function() {
        mockDetectedJvm('1.9.0_1');
        return installer.detectExistingInstall().then(()=>{
          expect(installer.selectedOption).to.be.equal('detected');
        });
      });

      it('should not select openjdk for installation if older than supported supported java version detected', function() {
        mockDetectedJvm('1.7.0_1');
        return installer.detectExistingInstall().then(()=>{
          expect(installer.selectedOption).to.be.equal('detected');
        });
      });

      it('should not check for available msi installtion', function() {
        mockDetectedJvm('1.8.0_1');
        installer.findMsiInstalledJava.restore();
        return installer.detectExistingInstall().then(()=>{
          expect(Util.executeFile).to.have.not.been.called;
          expect(Util.writeFile).to.have.not.been.called;
        });
      });

      it('should remove detected option and mark as detected in case detection ran agian an nothing detected', function() {
        mockDetectedJvm('1.9.0_1');
        return installer.detectExistingInstall().then(()=>{
          expect(installer.selectedOption).to.be.equal('detected');
          expect(installer.option.detected.version).to.be.equal('1.9.0');
          Util.executeCommand.rejects();
          return installer.detectExistingInstall();
        }).then(()=>{
          expect(installer.option['detected']).to.be.equal(undefined);
          expect(installer.selectedOption).to.be.equal('detected');
        });
      });
    });
  });

  describe('when installing jdk', function() {

    it('should set progress to "Installing"', function() {
      sandbox.stub(Installer.prototype, 'execFile').resolves();
      sandbox.stub(Util, 'findText').rejects();
      sandbox.stub(fs, 'existsSync').returns(true);
      installer.install(fakeProgress, success, failure);

      expect(fakeProgress.setStatus).to.have.been.calledOnce;
      expect(fakeProgress.setStatus).to.have.been.calledWith('Installing');
    });

    it('should remove an existing folder with the same name', function() {
      sandbox.stub(Installer.prototype, 'execFile').resolves();
      sandbox.stub(Util, 'findText').rejects();
      sandbox.stub(fs, 'existsSync').returns(true);
      let stub = sandbox.stub(rimraf, 'sync').returns();

      installer.install(fakeProgress, success, failure);

      expect(stub).calledOnce;
    });

    it('should call the installer with appropriate parameters', function() {
      let spy =   sandbox.stub(Installer.prototype, 'exec').resolves();
      sandbox.stub(Util, 'findText').rejects();
      installer.install(fakeProgress, success, failure);

      expect(spy).to.have.been.called;
      expect(spy).calledWith(installer.createMsiExecParameters().join(' '));
    });

    it('should catch errors during the installation', function() {
      sandbox.stub(require('child_process'), 'execFile').yields(new Error('critical error'), 'stdout', 'stderr');
      sandbox.spy(installer, 'installAfterRequirements');
      return new Promise((resolve, reject)=> {
        installer.installAfterRequirements(fakeProgress, resolve, reject);
      }).then(()=>{
        expect.fail();
      }).catch((error)=>{
        expect(installer.installAfterRequirements).has.been.called;
        expect(error.message).equals('critical error');
      });
    });

    it('should call success callback if install was sucessful but redirected to different location', function() {
      sandbox.stub(Installer.prototype, 'execFile').returns(Promise.resolve(true));
      sandbox.stub(Util, 'findText').returns(Promise.resolve('Dir (target): Key: INSTALLDIR	, Object: target/install'));
      return new Promise((resolve, reject)=> {
        installer.install(fakeProgress, resolve, reject);
      }).catch((error)=>{
        expect(error).is.not.undefined;
      });
    });

    it('should call success callback if install was sucessful but search for actual location failed', function(done) {
      sandbox.stub(Installer.prototype, 'exec').returns(Promise.resolve(true));
      sandbox.stub(Util, 'findText').returns(Promise.reject('failure'));
      return installer.install(fakeProgress, function() {
        done();
      }, function() {
        expect.fail('it should not fail');
      });
    });

    it('setup should call success callback', function() {
      let calls = 0;
      let succ = function() { return calls++; };

      installer.setup(fakeProgress, succ, failure);

      expect(calls).to.equal(1);
    });

    it('should not change installerDataSvc.jdkRoot if the same location found in install log', function(done) {
      sandbox.stub(require('child_process'), 'execFile').yields();
      sandbox.stub(Installer.prototype, 'execFile').returns(Promise.resolve(true));
      sandbox.stub(Util, 'findText').returns(Promise.resolve('Dir \(target\): Key: INSTALLDIR	, Object: target/install'));
      sandbox.stub(installer, 'getLocation').returns('target/install');
      installerDataSvc.jdkRoot = 'install/jdk8';
      return installer.install(fakeProgress, function() {
        expect(installerDataSvc.jdkRoot).to.be.equal('install/jdk8');
        done();
      }, function() {
        expect.fail('it should not fail');
      });
    });
  });
});
