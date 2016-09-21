'use strict';

import chai, { expect } from 'chai';
import { default as sinonChai } from 'sinon-chai';
import mockfs from 'mock-fs';
import request from 'request';
import fs from 'fs-extra';
import path from 'path';
import CDKInstall from 'model/cdk';
import VagrantInstall from "model/vagrant";
import VirtualboxInstall from "model/virtualbox";
import Logger from 'services/logger';
import Downloader from 'model/helpers/downloader';
import Installer from 'model/helpers/installer';
import InstallableItem from 'model/installable-item';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);
chai.use(sinonChai);

let sinon  = require('sinon');
require('sinon-as-promised');

describe('CDK installer', function() {
  let sandbox, installerDataSvc;
  let infoStub, errorStub;
  let fakeData = {
    tempDir: function() {},
    installDir: function() {},
    getUsername: function() {},
    getPassword: function() {},
    ocDir: function() {},
    vagrantDir: function() {},
    virtualBoxDir: function() {},
    cdkVagrantfileDir: function() {},
    cdkBoxDir: function() {},
    cdkMarker: function() {},
    cdkDir: function() {},
    getInstallable: function(key) {},
    getUsername: function() {},
    getPassword: function() {}
  };
  let fakeProgress = {
    setStatus: function (desc) { return; },
    setCurrent: function (val) {},
    setComplete: function() {},
    setTotalDownloadSize: function(size) {},
    getTotalDownloadSize: function() {}
  };

  installerDataSvc = sinon.stub(fakeData);
  installerDataSvc.tempDir.returns('temporaryFolder');
  installerDataSvc.installDir.returns('installFolder');
  installerDataSvc.getUsername.returns('user');
  installerDataSvc.getPassword.returns('password');
  installerDataSvc.cdkDir.returns(path.join(installerDataSvc.installDir(), 'cdk'));
  installerDataSvc.ocDir.returns(path.join(installerDataSvc.cdkDir(), 'bin'));
  installerDataSvc.vagrantDir.returns(path.join(installerDataSvc.installDir(), 'vagrant'));
  installerDataSvc.virtualBoxDir.returns(path.join(installerDataSvc.installDir(), 'virtualbox'));
  installerDataSvc.cdkVagrantfileDir.returns(path.join(installerDataSvc.cdkDir(), 'components', 'rhel', 'rhel-ose'));
  installerDataSvc.cdkBoxDir.returns(path.join(installerDataSvc.cdkDir(), 'boxes'));
  installerDataSvc.cdkMarker.returns(path.join(installerDataSvc.cdkVagrantfileDir(), '.cdk'));

  let vagrantInstallStub = new VagrantInstall(installerDataSvc,'url', null, 'vagrant');
  vagrantInstallStub.isSkipped = function() {return false;};
  vagrantInstallStub.addOption('install', '1.7.4',path.join('installFolder','vagrant'),true);
  installerDataSvc.getInstallable.returns(vagrantInstallStub);

  let installer;

  before(function() {
    infoStub = sinon.stub(Logger, 'info');
    errorStub = sinon.stub(Logger, 'error');

    mockfs({
      temporaryFolder: {},
      installFolder: {
        cdk: {
          plugins : {
            'some-file.gem': 'file content here'
          }
        }
      }
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

  let reqs = require(path.resolve('./requirements.json'));

  let cdkUrl = reqs['cdk.zip'].dmUrl,
      cdkBoxUrl = reqs['rhel-vagrant-virtualbox.box'].dmUrl,
      ocUrl = reqs['oc.zip'].url;

  beforeEach(function () {
    installer = new CDKInstall(installerDataSvc, ['cdk.zip', 'rhel-vagrant-virtualbox.box', 'oc.zip'], 'cdk');
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('files download', function() {
    let downloadStub, authStub;

    beforeEach(function() {
      downloadStub = sandbox.stub(Downloader.prototype, 'download').returns();
      authStub = sandbox.stub(Downloader.prototype, 'downloadAuth').returns();
    });

    it('should set progress to "Downloading"', function() {
      let spy = sandbox.spy(fakeProgress, 'setStatus');

      installer.downloadInstaller(fakeProgress, function() {}, function() {});

      expect(spy).to.have.been.calledOnce;
      expect(spy).to.have.been.calledWith('Downloading');
    });

    it('should call a correct downloader request for each file', function() {
      installer = new CDKInstall(installerDataSvc, ['cdk.zip', 'rhel-vagrant-virtualbox.box', 'oc.zip'], 'cdk');
      installer.downloadInstaller(fakeProgress, function() {}, function() {});

      //we download 1 out of 4 files with authentication
      expect(authStub.callCount).to.equal(2);
      expect(downloadStub).to.have.been.calledOnce;

      expect(authStub).calledWith(cdkBoxUrl);
      expect(downloadStub).calledWith(ocUrl);

      expect(authStub).calledWith(cdkUrl, installerDataSvc.getUsername(), installerDataSvc.getPassword());
    });

    it('should skip download when the files are located in downloads folder', function() {
      let spy = sandbox.spy(Downloader.prototype, 'closeHandler');
      sandbox.stub(fs, 'existsSync').returns(true);

      installer.downloadInstaller(fakeProgress, function() {}, function() {});

      expect(downloadStub).not.called;
      expect(authStub).not.called;
      expect(spy.callCount).to.equal(3);
    });
  });

  describe('installation', function() {
    it('should wait if vagrant has not finished installing', function() {
      let stub = sandbox.stub(installer, 'postVagrantInstall');
      let progressStub = sandbox.stub(fakeProgress, 'setStatus').throws('done');
      let item2 = new InstallableItem('vagrant', ['vagrant.msi'], 'targetFolderName', installerDataSvc);
      item2.thenInstall(installer);
      try {
        installer.install(fakeProgress, () => {}, (err) => {});
      } catch (err) {
        //workaround for ipcRenderer
      } finally {
        expect(stub).not.called;
        expect(progressStub).calledWith('Waiting for Vagrant to finish installation');
      }
    });

    it('should install once vagrant has finished', function() {
      let stub = sandbox.stub(installer, 'postVagrantInstall').returns();
      sandbox.stub(vagrantInstallStub, 'isInstalled').returns(true);
      let item2 = new InstallableItem('cygwin', ['cygwin.exe'], 'targetFolderName', installerDataSvc);
      item2.setInstallComplete();
      item2.thenInstall(installer);
      installer.install(fakeProgress, () => {}, (err) => {});

      expect(stub).calledOnce;
    });

    it('should set progress to "Installing"', function() {
      let spy = sandbox.spy(fakeProgress, 'setStatus');
      sandbox.stub(Installer.prototype, 'unzip').rejects('done');

      installer.postVagrantInstall(fakeProgress, null, null);

      expect(spy).to.have.been.calledOnce;
      expect(spy).to.have.been.calledWith('Installing');
    });

    it('should extract cdk archive to install folder', function() {
      let stub = sandbox.stub(Installer.prototype, 'unzip').rejects('done');
      installer.postVagrantInstall(fakeProgress, function() {}, function (err) {});

      expect(stub).to.have.been.called;
      expect(stub).calledWith(installer.cdkDownloadedFile, installerDataSvc.installDir());
    });

    describe('createEnvironment', function() {
      it('should return path with vagrant/bin', function() {
        let env = installer.createEnvironment();
        expect(env['Path']).includes(path.join(installerDataSvc.vagrantDir(), 'bin') + path.delimiter + installerDataSvc.vagrantDir());
      });
    });

    describe('setupVagrant', function() {
      let stub, helper;

      beforeEach(function() {
        stub = sandbox.stub(installer, 'postVagrantSetup').returns();
        helper = new Installer('cdk', fakeProgress, function() {}, function (err) {});
      });

      it('should wait for vagrant install to complete', function() {
        installer.setupVagrant(helper);
        expect(stub).not.called;
      });

      it('should call postVagrantSetup if vagrant is installed', function() {
        sandbox.stub(helper, 'exec');
        sandbox.stub(vagrantInstallStub, 'isInstalled').returns(true);

        installer.setupVagrant(helper);
        expect(stub).calledOnce;
      });
    });

    describe('postVagrantSetup', function() {
      let helper, envSpy, execStub;

      beforeEach(function() {
        helper = new Installer('cdk', fakeProgress, function() {}, function (err) {});
        envSpy = sandbox.spy(installer, 'createEnvironment');
        execStub = sandbox.stub(helper, 'exec').resolves(true);
      });

      it('should not execute if vagrant installation does not exist', function() {
        installer.setupVagrant(helper);
        expect(envSpy).not.called;
        expect(execStub).not.called;
      });

      it('should execute when vagrant installation is complete', function() {
        sandbox.stub(vagrantInstallStub, 'isInstalled').returns(true);

        let p = installer.setupVagrant(helper);

        expect(envSpy).calledOnce;
        return expect(p).to.eventually.equal(true);
      });
    });
  });
});
