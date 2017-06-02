'use strict';

import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Installer from 'browser/model/helpers/installer';
import Platform from 'browser/services/platform';
import {testBase, downloadTest, installerDataSvc, sandbox, installer, infoStub, errorStub, sha256Stub, downloadUrl, fakeProgress, success, failure} from './common';

describe('kompose installer', function() {

  testBase('kompose');
  downloadTest('kompose');

  describe('installAfterRequirements', function() {
    let stubCopy;

    beforeEach(function() {
      stubCopy = sandbox.stub(Installer.prototype, 'copyFile').resolves();
      sandbox.stub(Platform, 'addToUserPath').resolves();
      sandbox.stub(Platform, 'makeFileExecutable').resolves();
    });

    it('should set progress to "Installing"', function() {
      installer.installAfterRequirements(fakeProgress, success, failure);
      expect(fakeProgress.setStatus).calledOnce;
      expect(fakeProgress.setStatus).calledWith('Installing');
    });

    it('should fail for kompose file without known extension', function() {
      sandbox.stub(Platform, 'getUserHomePath').returns(Promise.resolve('home'));
      return new Promise((resolve, reject)=> {
        installer.installAfterRequirements(fakeProgress, resolve, reject);
      }).catch(()=> {
        expect(stubCopy).to.have.been.not.called;
      });
    });

    it('should call Installer.fail() if kmpose installation failed', function() {
      Installer.prototype.copyFile.restore();
      sandbox.stub(Installer.prototype, 'copyFile').throws('error');
      sandbox.spy(Installer.prototype, 'fail');
      sandbox.stub(Platform, 'getUserHomePath').returns(Promise.resolve('home'));
      return new Promise((resolve, reject)=> {
        installer.installAfterRequirements(fakeProgress, resolve, reject);
      }).catch(()=> {
        expect(Installer.prototype.fail).calledOnce;
      });
    })

    describe('on windows', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('win32');
      });

      it('should copy kompose exe file to install folder', function() {
        return new Promise((resolve, reject)=>{
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=> {
          expect(stubCopy).to.have.been.called;
          expect(stubCopy).calledWith(installer.downloadedFile, path.join(installer.installerDataSvc.komposeDir(), 'kompose.exe'));
        }).catch((error) => {
          throw error;
        });
      });
    });

    describe('on macos', function() {
      beforeEach(function() {
        sandbox.stub(Platform, 'getOS').returns('darwin');
      });

      it('should copy kompose file without extension to install folder', function() {
        return new Promise((resolve, reject)=>{
          installer.installAfterRequirements(fakeProgress, resolve, reject);
        }).then(()=> {
          expect(stubCopy).to.have.been.called;
          expect(stubCopy).calledWith(installer.downloadedFile, path.join(installerDataSvc.komposeDir(), 'kompose'));
        }).catch((error) => {
          throw error;
        });
      });
    });
  });
});
