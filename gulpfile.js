'use strict';

var gulp = require('gulp'),
    babel = require('gulp-babel'),
    runSequence = require('run-sequence'),
    request = require("request"),
    exec = require('child_process').exec,
    path = require('path'),
    merge = require('merge-stream'),
    sourcemaps = require("gulp-sourcemaps"),
    common = require('./gulp-tasks/common'),
    pjson = require('./package.json');

require('./gulp-tasks/tests')(gulp);
require('./gulp-tasks/build')(gulp);

var artifactPlatform = 'win32',
    artifactArch = 'x64';

process.on('uncaughtException', function(err) {
    if(err) {
      throw err;
    }
});

// transpile sources and copy resources to a separate folder
gulp.task('transpile:app', ['create-modules-link'], function() {
  var sources = gulp.src(['browser/**/*.js', 'main/**/*.js', '*.js'], {base: '.'})
    .pipe(sourcemaps.init())
    .pipe(babel())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('transpiled'));

  var resources = gulp.src(['browser/**/*', '!browser/**/*.js', '*.json'], {base: '.'})
    .pipe(gulp.dest('transpiled'));

  return merge(sources, resources);
});

// create symlink to node_modules in transpiled folder
gulp.task('create-modules-link', function() {
  return gulp.src('node_modules')
    .pipe(symlink('transpiled/node_modules', {
      force: true
    }));
});

gulp.task('generate', ['transpile:app'], function(cb) {
  var electronVersion = pjson.devDependencies['electron-prebuilt'];
  var cmd = path.join('node_modules', '.bin') + path.sep + 'electron-packager transpiled ' + common.artifactName + ' --platform=' + artifactPlatform + ' --arch=' + artifactArch;
  cmd += ' --version=' + electronVersion + ' --out="' + common.buildFolderPath + '" --overwrite --asar=true';
  cmd += ' --version-string.CompanyName="Red Hat, Inc."';
  cmd += ' --version-string.ProductName="' + pjson.productName + '"';
  cmd += ' --version-string.OriginalFilename="' + common.artifactName + '-' + pjson.version + '-installer.exe"';
  cmd += ' --version-string.FileDescription="' + pjson.description + ' v' + pjson.version + '"';
  cmd += ' --app-copyright="Copyright 2016 Red Hat, Inc."';
  cmd += ' --app-version="' + pjson.version + '"' + ' --build-version="' + pjson.version + '"';
  cmd += ' --prune';
  cmd += ' --icon="' + common.configIcon + '"';
  //console.log(cmd);
  exec(cmd, common.createExecCallback(cb, true));
});

// default task
gulp.task('default', ['run']);

gulp.task('run', ['transpile:app'], function(cb) {
  exec(path.join('node_modules', '.bin') + path.sep + 'electron transpiled', common.createExecCallback(cb));
});

// Create stub installer that will then download all the requirements
gulp.task('package-simple', function(cb) {
  runSequence(['check-requirements', 'clean'], 'create-dist-win-dir', ['generate',
    'prepare-tools'], 'package', 'cleanup', cb);
});

gulp.task('package-bundle', function(cb) {
  runSequence(['check-requirements', 'clean'], 'create-dist-win-dir', ['generate',
   'prepare-tools'], 'prefetch', 'package', 'cleanup', cb);
});

// Create both installers
gulp.task('dist', function(cb) {
  runSequence(['check-requirements', 'clean'], 'create-dist-win-dir', ['generate',
    'prepare-tools'], 'package', 'prefetch', 'package', 'cleanup', cb);
});

gulp.task('test', function() {
  return runSequence('create-electron-symlink', 'unit-test', 'delete-electron-symlink');
});

gulp.task('ui-test', function(cb) {
  process.env.PTOR_TEST_RUN = 'ui';
  return runSequence(['generate', 'protractor-install'], 'protractor-run', cb);
});

gulp.task('system-test', function(cb) {
  process.env.PTOR_TEST_RUN = 'system';
  return runSequence(['generate', 'protractor-install'], 'protractor-run', cb);
});

//check if URLs in requirements.json return 200 and generally point to their appropriate tools
gulp.task('check-requirements', function(cb) {
  exec('node test/check-requirements.js', common.createExecCallback(cb, false));
});
