'use strict';

import chai, { expect } from 'chai';
import sinon from 'sinon';
import { default as sinonChai } from 'sinon-chai';
import mockfs from 'mock-fs';
import fs from 'fs-extra';
import path from 'path';
import Logger from 'browser/services/logger';
import Downloader from 'browser/model/helpers/downloader';
import Hash from 'browser/model/helpers/hash';
import InstallerDataService from 'browser/services/data';
import {ProgressState} from 'browser/pages/install/controller';
import loadMetadata from 'browser/services/metadata';
import CDKInstall from 'browser/model/cdk';
import CygwinInstall from 'browser/model/cygwin';
import DevstudioInstall from 'browser/model/devstudio';
import JdkInstall from 'browser/model/jdk-install';
import KomposeInstall from 'browser/model/kompose';
import VirtualBoxInstall from 'browser/model/virtualbox';
chai.use(sinonChai);

let reqs = loadMetadata(require('../../../requirements.json'), 'win32');

let installerDataSvc, fakeInstallable, sandbox, installer;
let infoStub, errorStub, sha256Stub;
let downloadUrl, fakeProgress, success, failure;

let components = {};

function testBase(key) {
  before(function() {
    fakeInstallable = {
      isInstalled: function() { return false; },
      isSkipped: function() { return true; }
    };
    downloadUrl = reqs[key].dmUrl || reqs[key].url;

    success = () => {};
    failure = () => {};

    infoStub = sinon.stub(Logger, 'info');
    errorStub = sinon.stub(Logger, 'error');
    sha256Stub = sinon.stub(Hash.prototype, 'SHA256').callsFake(function(file, cb) {
      cb('hash');
    });

    mockfs({
      'Users' : {
        'dev1': {
          '.minishift': {
            'cache': {
              'oc': {
                '1.4.1': {
                  'oc.exe': 'executable code',
                  'oc': 'executable code'
                }
              }
            }
          }
        }
      },
      tempDirectory: {},
      installationFolder: {}
    }, {
      createCwd: false,
      createTmp: false
    });
  });

  after(function() {
    mockfs.restore();
    infoStub.restore();
    errorStub.restore();
    sha256Stub.restore();
  });

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    
    installerDataSvc = sandbox.stub(new InstallerDataService());
    installerDataSvc.tempDir.returns('tempFolder');
    installerDataSvc.installDir.returns('installFolder');
    installerDataSvc.cdkDir.returns(path.join(installerDataSvc.installDir(), 'cdk'));
    installerDataSvc.ocDir.returns(path.join(installerDataSvc.cdkDir(), 'bin'));
    installerDataSvc.virtualBoxDir.returns(path.join(installerDataSvc.installDir(), 'virtualbox'));
    installerDataSvc.cygwinDir.returns(path.join(installerDataSvc.installDir(), 'cygwin'));
    installerDataSvc.komposeDir.returns(path.join(installerDataSvc.installDir(), 'kompose'));
    installerDataSvc.jdkDir.returns(path.join(installerDataSvc.installDir(), 'jdk8'));
    installerDataSvc.devstudioDir.returns(path.join(installerDataSvc.installDir(), 'devstudio'));
    installerDataSvc.getUsername.returns('user');
    installerDataSvc.getPassword.returns('password');
    for (let item in reqs) {
      installerDataSvc.getRequirementByName.withArgs(item).returns(reqs[item]);
    }
    installerDataSvc.getInstallable.withArgs(key).returns(fakeInstallable);

    components = {
      cdk: new CDKInstall(installerDataSvc, 'cdk', reqs.cdk.dmUrl, reqs.cdk.filename, 'sha'),
      cygwin: new CygwinInstall(installerDataSvc, 'cygwin', reqs.cygwin.url, reqs.cygwin.filename, 'sha'),
      devstudio: new DevstudioInstall(installerDataSvc, 'developer-studio', reqs.devstudio.dmUrl, reqs.devstudio.filename, 'sha'),
      jdk: new JdkInstall(installerDataSvc, 'jdk8', reqs.jdk.dmUrl, reqs.jdk.filename, 'sha'),
      kompose: new KomposeInstall(installerDataSvc, 'kompose', '0.4.0', reqs.kompose.url, reqs.kompose.filename, 'sha1'),
      virtualbox: new VirtualBoxInstall(installerDataSvc, 'virtualbox', reqs.virtualbox.url, reqs.virtualbox.filename, 'sha', '5.1.22', '115126')
    }

    installer = components[key];
    installer.ipcRenderer = { on: function() {} };
    fakeProgress = sandbox.stub(new ProgressState());
    fakeProgress.$timeout = sinon.stub().yields();
    fakeProgress.$scope = {$apply: function () {}};
  });

  afterEach(function () {
    sandbox.restore();
  });
}

function downloadTest(key) {
  describe('installer download', function() {
    let downloadStub;

    beforeEach(function() {
      if (installer.authRequired) {
        downloadStub = sandbox.stub(Downloader.prototype, 'downloadAuth').returns();
      } else {
        downloadStub = sandbox.stub(Downloader.prototype, 'download').returns();
      }
    });

    it('should set progress to "Downloading"', function() {
      installer.downloadInstaller(fakeProgress, success, failure);

      expect(fakeProgress.setStatus).to.have.been.calledOnce;
      expect(fakeProgress.setStatus).to.have.been.calledWith('Downloading');
    });

    it('should write the data into temp/' + reqs[key].filename, function() {
      let spy = sandbox.spy(fs, 'createWriteStream');
      let streamSpy = sandbox.spy(Downloader.prototype, 'setWriteStream');

      installer.downloadInstaller(fakeProgress, success, failure);

      expect(streamSpy).to.have.been.calledOnce;
      expect(spy).to.have.been.calledOnce;
      expect(spy).to.have.been.calledWith(path.join('tempFolder', reqs[key].filename));
    });

    it('should call a correct downloader request with the specified parameters once', function() {
      installer.downloadInstaller(fakeProgress, success, failure);

      expect(downloadStub).to.have.been.calledOnce;
      expect(downloadStub).to.have.been.calledWith(downloadUrl);
    });

    it('should skip download when the file is found in the download folder', function() {
      sandbox.stub(fs, 'existsSync').returns(true);

      installer.downloadInstaller(fakeProgress, success, failure);

      expect(downloadStub).not.called;
    });
  });
}

export {testBase, downloadTest, installerDataSvc, sandbox, installer, infoStub, errorStub, sha256Stub, downloadUrl, fakeProgress, fakeInstallable, success, failure, components};
