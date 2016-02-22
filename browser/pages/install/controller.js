'use strict';

import Logger from '../../services/logger';

class InstallController {
  constructor($scope, $timeout, installerDataSvc) {
    this.$scope = $scope;
    this.$timeout = $timeout;
    this.installerDataSvc = installerDataSvc;

    this.data = Object.create(null);

    for (var [key, value] of this.installerDataSvc.allInstallables().entries()) {
      this.processInstallable(key, value);
    }
  }

  processInstallable(key, value) {
    let itemProgress = new ProgressState(value.getName(), value.getInstallTime(), this.$scope, this.$timeout);

    Object.defineProperty(this.data, key, {
      enumerable: true,
      writable: true,
      value: itemProgress
    });

    if (value.isDownloadRequired() && !value.isDownloaded()) {
      this.$timeout(this.triggerDownload(key, value, itemProgress));
    } else if (!value.hasExistingInstall()) {
      this.$timeout(this.triggerInstall(key, value, itemProgress));
    } else {
      this.$timeout(this.triggerSetup(key, value, itemProgress));
    }
  }

  triggerDownload(installableKey, installableValue, progress) {
    this.installerDataSvc.startDownload(installableKey);

    installableValue.downloadInstaller(progress,
      () => {
        this.$timeout(this.installerDataSvc.downloadDone(progress, installableKey));
      },
      (error) => {
        Logger.error(installableKey + ' failed to download: ' + error);
      }
    )
  }

  triggerInstall(installableKey, installableValue, progress) {
    this.installerDataSvc.startInstall(installableKey);

    progress.installTrigger();

    installableValue.install(progress,
      () => {
        this.installerDataSvc.installDone(installableKey);
      },
      (error) => {
        Logger.error(installableKey + ' failed to install: ' + error);
      }
    )
  }

  triggerSetup(installableKey, installableValue, progress) {
    this.installerDataSvc.startSetup(installableKey);

    progress.installTrigger();

    installableValue.setup(progress,
      () => {
        this.installerDataSvc.installDone(installableKey);
      },
      (error) => {
        Logger.error(installableKey + ' setup failed: ' + error);
      }
    )
  }

  current(key) {
    return this.data[key].current;
  }

  label(key) {
    return this.data[key].label;
  }

  desc(key) {
    return this.data[key].desc;
  }
}

class ProgressState {
  constructor(name, installTime, $scope, $timeout) {
    this.name = name;
    this.installTime = installTime;
    this.$scope = $scope;
    this.$timeout = $timeout;
    this.current = 0;
    this.totalDownloadSize = 0;
    this.downloadedSize = 0;
    this.timeSpent = 0;
    this.timeSpentInstall = 0;
    this.lastInstallTime = 0;
    this.label = '';
    this.desc = '';
  }

  setTotalDownloadSize(totalSize) {
    this.totalDownloadSize = totalSize;
  }

  downloaded(amt, time) {
    this.downloadedSize += amt;
    this.timeSpent += time;
    if (time == 0) return;
    let rate = amt / time;
    let remainingDownloadTime = (this.totalDownloadSize - this.downloadedSize) / rate;
    this.setCurrent(Math.round((this.timeSpent / (this.timeSpent + (this.installTime * 1000) + remainingDownloadTime)) * 100));
  }

  installTrigger() {
    this.lastInstallTime = Date.now();
    this.$timeout(this.installUpdate.bind(this), 10000);
  }

  installUpdate() {
    let now = Date.now();
    this.timeSpentInstall += (now - this.lastInstallTime);
    this.lastInstallTime = now;
    this.setCurrent(Math.round(((this.timeSpent + this.timeSpentInstall) / (this.timeSpent + (this.installTime * 1000))) * 100));

    this.$timeout(this.installUpdate.bind(this), 5000);
  }

  setCurrent(newVal) {
    if (newVal > this.current && newVal < 100) {
    	this.current = newVal;
    	this.label = newVal + '%';
    }
  }

  setStatus(newStatus) {
    this.desc = this.name + ' - ' + newStatus;
  }

  setComplete() {
    this.current = 100;
    this.label = '100%';
    this.setStatus('Complete');
  }
}

InstallController.$inject = ['$scope', '$timeout', 'installerDataSvc'];

export default InstallController;
