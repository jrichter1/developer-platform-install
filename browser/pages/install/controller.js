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
    let itemProgress = new ProgressState(value.getName(), this.$scope);

    Object.defineProperty(this.data, key, {
      enumerable: true,
      writable: true,
      value: itemProgress
    });

    if (value.isDownloadRequired() && !value.isDownloaded()) {
      this.$timeout(this.triggerDownload(key, value, itemProgress));
    } else if (!value.hasExistingInstall()) {
      this.$timeout(this.triggerInstall(key, value, itemProgress));
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

    installableValue.install(progress,
      () => {
        this.installerDataSvc.installDone(installableKey);
      },
      (error) => {
        Logger.error(installableKey + ' failed to install: ' + error);
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
  constructor(name, $scope) {
    this.name = name;
    this.$scope = $scope;
    this.current = 0;
    this.label = '';
    this.desc = '';
  }

  setCurrent(newVal) {
    if (newVal == this.current) return;

    this.$scope.$apply(() => {
      this.current = newVal;
      this.label = newVal + '%';
    });
  }

  setStatus(newStatus) {
    this.desc = this.name + ' - ' + newStatus;
  }

  setComplete() {
    this.$scope.$apply(() => {
      this.current = 100;
      this.label = '100%';
      this.setStatus('Complete');
    });
  }
}

InstallController.$inject = ['$scope', '$timeout', 'installerDataSvc'];

export default InstallController;
