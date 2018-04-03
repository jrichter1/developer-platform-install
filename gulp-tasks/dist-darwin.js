'use strict';

const download = require('./download');
const loadMetadata = require('../browser/services/metadata');
const config = require('./config.js');
const rename = require('gulp-rename');
const runSequence = require('run-sequence');
const pjson = require('../package');
const fs = require('fs-extra');
const common = require('./common');
const del = require('del');

let productName = pjson.productName;
let productVersion = pjson.version;

function buildInstaller(gulp, origin, destination, extraFiles) {
  const builder = require('electron-builder');
  const Platform = builder.Platform;

  // Promise is returned
  return builder.build({
    targets: Platform.MAC.createTarget(),
    config: {
      appId: 'com.redhat.devsuite.installer',
      mac: {
        category: 'public.app-category.developer-tools',
        icon: 'resources/devsuite.icns',
        target: ['dmg'],
        publish: null
      },
      files: '**/*',
      extraFiles,
      directories: {
        app : 'transpiled'
      }
    }
  }).then(() => {
    return new Promise((resolve, reject)=>{
      gulp.src(origin)
        .pipe(rename(destination))
        .pipe(gulp.dest('./')).on('end', resolve).on('error', reject);
    });
  }).then(()=>{
    return new Promise((resolve, reject)=>{
      common.createSHA256File(destination, function(error) {
        if(error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }).catch((error)=>{
    return Promise.reject(error);
  });
}

function darwinDist(gulp, reqs) {

  // prefetch all the installer dependencies so we can package them up into the .exe
  gulp.task('prefetch', ['create-prefetch-cache-dir'], function() {
    return download.prefetch(reqs, 'yes', config.prefetchFolder);
  });

  gulp.task('dist', function() {
    return runSequence('clean', 'check-requirements', 'update-requirements', 'dist-simple', 'clean-old-cache', 'dist-bundle', 'cleanup');
  });

  gulp.task('dist-bundle', ['prefetch'], function() {
    return buildInstaller(gulp,
      `dist/${productName}-${productVersion}.dmg`,
      `dist/devsuite-${productVersion}-bundle-installer-mac.dmg`,
      [{
        'from': 'requirements-cache',
        'to': '.',
        'filter': ['*']
      }]);
  });

  gulp.task('dist-simple', function() {
    return buildInstaller(gulp,
      `dist/${productName}-${productVersion}.dmg`,
      `dist/devsuite-${productVersion}-installer-mac.dmg`
    );
  });

  gulp.task('cleanup', function() {
    return del(['dist/mac', `dist/${productName}-${productVersion}.blockmap`],
      { force: false });
  });

}

module.exports = darwinDist;
