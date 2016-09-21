'use strict';

import chai, { expect } from 'chai';
import sinon from 'sinon';
import { default as sinonChai } from 'sinon-chai';
import mockfs from 'mock-fs';
import request from 'request';
import fs from 'fs';
import path from 'path';
import CygwinInstall from 'model/cygwin';
import Logger from 'services/logger';
import Downloader from 'model/helpers/downloader';
import Installer from 'model/helpers/installer';
import InstallableItem from 'model/installable-item';
import child_process from 'child_process';
chai.use(sinonChai);

describe('Cygwin installer', function() {
  let installerDataSvc, sandbox, installer;
  let infoStub, errorStub;
  let downloadUrl = 'https://cygwin.com/setup-x86_64.exe';
  let fakeInstallable = {
    isInstalled: function() { return false; }
  };

  let fakeData = {
    tempDir: function() { return 'tempDirectory'; },
    installDir: function() { return 'installationFolder'; },
    cygwinDir: function() { return 'install/Cygwin'; },
    getInstallable: function(key) { return fakeInstallable; }
  };

  installerDataSvc = sinon.stub(fakeData);
  installerDataSvc.tempDir.returns('tempDirectory');
  installerDataSvc.installDir.returns('installationFolder');
  installerDataSvc.cygwinDir.returns('install/Cygwin');
  installerDataSvc.getInstallable.returns(fakeInstallable)

  let fakeProgress = {
    setStatus: function (desc) { return; },
    setCurrent: function (val) {},
    setComplete: function() {},
    setTotalDownloadSize: function(size) {},
    getTotalDownloadSize: function() {}
  };

  before(function() {
    infoStub = sinon.stub(Logger, 'info');
    errorStub = sinon.stub(Logger, 'error');

    mockfs({
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
  });

  beforeEach(function () {
    installer = new CygwinInstall(installerDataSvc, downloadUrl, null);
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should fail when no url is set', function() {
    expect(function() {
      new CygwinInstall(installerDataSvc, null, null);
    }).to.throw('No download URL set');
  });

  it('should download cygwin installer to temporary folder as ssh-rsync.zip', function() {
    expect(new CygwinInstall(installerDataSvc, 'url', null).downloadedFile).to.equal(
      path.join('tempDirectory', 'cygwin.exe'));
  });

  describe('installer download', function() {
    let downloadStub;

    beforeEach(function() {
      downloadStub = sandbox.stub(Downloader.prototype, 'download').returns();
    });

    it('should set progress to "Downloading"', function() {
      let spy = sandbox.spy(fakeProgress, 'setStatus');

      installer.downloadInstaller(fakeProgress, function() {}, function() {});

      expect(spy).to.have.been.calledOnce;
      expect(spy).to.have.been.calledWith('Downloading');
    });

    it('should call a correct downloader request with the specified parameters once', function() {
      installer.downloadInstaller(fakeProgress, function() {}, function() {});

      expect(downloadStub).to.have.been.calledOnce;
      expect(downloadStub).to.have.been.calledWith(downloadUrl);
    });

    it('should skip download when the file is found in the download folder', function() {
      sandbox.stub(fs, 'existsSync').returns(true);

      installer.downloadInstaller(fakeProgress, function() {}, function() {});

      expect(downloadStub).not.called;
    });
  });

  describe('installation', function() {
    let downloadedFile = path.join(installerDataSvc.tempDir(), 'cygwin.exe');

    it('should not start until virtualbox has finished installing', function() {
      let spy = sandbox.spy(fakeProgress, 'setStatus');
      let installSpy = sandbox.spy(installer, 'postVirtualboxInstall');
      let item2 = new InstallableItem('virtualbox', 1000, 'url', 'installFile', 'targetFolderName', installerDataSvc);
      item2.thenInstall(installer);
      try {
        installer.install(fakeProgress, null, null);
      } catch (err) {
        //workaround for ipcRenderer
      } finally {
        expect(installSpy).not.called;
        expect(spy).to.have.been.calledOnce;
        expect(spy).to.have.been.calledWith('Waiting for Oracle VirtualBox to finish installation');
      }
    });

    it('should install once virtualbox has finished', function() {
      let stub = sandbox.stub(installer, 'postVirtualboxInstall').returns();
      sandbox.stub(fakeInstallable, 'isInstalled').returns(true);
      let item2 = new InstallableItem('virtualbox', 1000, 'url', 'installFile', 'targetFolderName', installerDataSvc);
      item2.setInstallComplete();
      item2.thenInstall(installer);
      installer.install(fakeProgress, () => {}, (err) => {});

      expect(stub).calledOnce;
    });

    it('should set progress to "Installing"', function() {
      let spy = sandbox.spy(fakeProgress, 'setStatus');
      sandbox.stub(Installer.prototype, 'execFile').rejects('done');

      installer.postVirtualboxInstall(fakeProgress, null, null);

      expect(spy).to.have.been.calledOnce;
      expect(spy).to.have.been.calledWith('Installing');
    });

    it('should run the installer with correct parameters', function() {
      let stub = sandbox.stub(child_process, 'execFile').yields();
      let spy = sandbox.spy(Installer.prototype, 'execFile');

      installer.postVirtualboxInstall(fakeProgress, null, null);

      expect(spy).to.have.been.calledWith(installer.downloadedFile,
        ["--no-admin", "--quiet-mode", "--only-site", '-l',
         path.join(installerDataSvc.cygwinDir(),'packages'),
         "--site", "http://mirrors.xmission.com/cygwin",
         "--root", "install/Cygwin", "--categories", "Base",
         "--packages", "openssh,rsync"]);
    });

    it('should catch errors thrown during the installation', function(done) {
      let err = new Error('critical error');
      let stub = sandbox.stub(child_process, 'execFile').yields(err);

      try {
        installer.postVirtualboxInstall(fakeProgress, null, null);
        done();
      } catch (error) {
        expect.fail('It did not catch the error');
      }
    });
  });
});
