'use strict';

import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Platform from 'browser/services/platform';
import Installer from 'browser/model/helpers/installer';
import InstallableItem from 'browser/model/installable-item';
import DevstudioAutoInstallGenerator from 'browser/model/devstudio-autoinstall';
import loadMetadata from 'browser/services/metadata';
import {testBase, downloadTest, installerDataSvc, sandbox, installer, infoStub, errorStub, sha256Stub, downloadUrl, fakeProgress, fakeInstallable, success, failure} from './common';

let reqs = loadMetadata(require('../../../requirements.json'), 'win32');

describe('devstudio installer', function() {
  testBase('devstudio');
  downloadTest('devstudio');

  describe('installation', function() {
    let item2;

    beforeEach(function() {
      item2 = new InstallableItem('jdk', 'url', 'installFile', 'targetFolderName', installerDataSvc);
      installerDataSvc.getInstallable.withArgs('jdk').returns(item2);
    });

    describe('on windows', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
      });

      it('should not start until JDK has finished installing', function() {
        let installSpy = sandbox.spy(installer, 'installAfterRequirements');
        item2.thenInstall(installer);

        installer.install(fakeProgress, success, failure);

        expect(installSpy).not.called;
        expect(fakeProgress.setStatus).to.have.been.calledOnce;
        expect(fakeProgress.setStatus).to.have.been.calledWith('Waiting for OpenJDK to finish installation');
      });
    });

    it('should install once JDK has finished', function() {
      let stub = sandbox.stub(installer, 'installAfterRequirements').returns();
      item2.setInstallComplete();
      item2.thenInstall(installer);
      installer.install(fakeProgress, success, failure);

      expect(stub).calledOnce;
    });

    it('should set progress to "Installing"', function() {
      installer.installAfterRequirements(fakeProgress, success, failure);

      expect(fakeProgress.setStatus).to.have.been.calledOnce;
      expect(fakeProgress.setStatus).to.have.been.calledWith('Installing');
    });

    it('should load the install config contents', function() {
      let spy = sandbox.spy(DevstudioAutoInstallGenerator.prototype, 'fileContent');

      installer.installAfterRequirements(fakeProgress, success, failure);

      expect(spy).to.have.been.calledOnce;
    });

    it('should write the install configuration into temp/devstudio-autoinstall.xml', function() {
      sandbox.stub(fs, 'writeFile').yields();
      let spy = sandbox.spy(Installer.prototype, 'writeFile');

      let data = new DevstudioAutoInstallGenerator(installerDataSvc.devstudioDir(), installerDataSvc.jdkDir(), installer.version).fileContent();
      let installConfigFile = path.join(installerDataSvc.tempDir(), 'devstudio-autoinstall.xml');
      installer.installAfterRequirements(fakeProgress, success, failure);

      expect(spy).to.have.been.calledOnce;
      expect(spy).to.have.been.calledWith(installConfigFile, data);
    });

    it('should catch errors thrown during the installation', function(done) {
      let err = new Error('critical error');
      sandbox.stub(fs, 'writeFile').yields(err);

      try {
        installer.installAfterRequirements(fakeProgress, success, failure);
        done();
      } catch (error) {
        expect.fail('It did not catch the error');
      }
    });

    it('should call success callback when installation is finished successfully', function() {
      sandbox.stub(Installer.prototype, 'writeFile').resolves();
      sandbox.stub(installer, 'postJDKInstall').resolves();
      sandbox.stub(Installer.prototype, 'succeed');

      return installer.installAfterRequirements(
        fakeProgress, function() {}, function() {}
      ).then(()=>{
        expect(Installer.prototype.succeed).to.be.calledWith(true);
      });
    });

    describe('postJDKInstall', function() {
      let helper, stubInstall, eventStub;

      beforeEach(function() {
        helper = new Installer('devstudio', fakeProgress, success, failure);
        stubInstall = sandbox.stub(installer, 'headlessInstall').resolves(true);
        eventStub = sandbox.stub(installer.ipcRenderer, 'on');
      });

      it('should wait for JDK install to complete', function() {
        eventStub.yields({}, 'jdk');

        return installer.postJDKInstall(helper, true)
        .then(() => {
          expect(eventStub).calledOnce;
        });
      });

      it('should wait for JDK install to complete and ignore other installed components', function() {
        eventStub.onFirstCall().yields({}, 'cdk');
        sandbox.stub(fakeInstallable, 'isInstalled').returns(false);
        installer.postJDKInstall(helper, true);
        expect(installer.ipcRenderer.on).has.been.called;
        expect(stubInstall).has.not.been.called;
      });

      it('should call headlessInstall if JDK is installed', function() {
        sandbox.stub(item2, 'isInstalled').returns(true);

        return installer.postJDKInstall(
          helper
        ).then(() => {
          expect(eventStub).not.called;
          expect(stubInstall).calledOnce;
        });
      });

      it('should reject promise if headlessInstall fails', function() {
        sandbox.stub(item2, 'isInstalled').returns(true);
        installer.headlessInstall.restore();
        stubInstall = sandbox.stub(installer, 'headlessInstall').rejects('Error');
        return installer.postJDKInstall(
          helper
        ).then(() => {
          expect.fail();
        }).catch((error)=> {
          expect(eventStub).not.called;
          expect(stubInstall).calledOnce;
          expect(error.name).to.be.equal('Error');
        });
      });
    });

    describe('headlessInstall', function() {
      let helper;
      let child_process = require('child_process');

      beforeEach(function() {
        helper = new Installer('devstudio', fakeProgress, success, failure);
        sandbox.stub(child_process, 'execFile').yields();
        sandbox.stub(fs, 'appendFile').yields();
      });

      it('should perform headless install into the installation folder', function() {
        let spy = sandbox.spy(helper, 'execFile');
        let downloadedFile = path.join(installerDataSvc.tempDir(), reqs.devstudio.filename);
        let javaPath = path.join(installerDataSvc.jdkDir(), 'bin', 'java');
        let javaOpts = [
          '-DTRACE=true',
          '-jar',
          downloadedFile,
          path.join(installerDataSvc.tempDir(), 'devstudio-autoinstall.xml')
        ];

        return installer.headlessInstall(helper)
        .then(() => {
          expect(spy).calledOnce;
          expect(spy).calledWith(javaPath, javaOpts);
        });
      });
    });
  });
});
