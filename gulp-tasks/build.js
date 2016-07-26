'use strict';

let common = require('./common'),
    mkdirp = require('mkdirp'),
    minimatch = require('minimatch'),
    path = require('path'),
    reqs = require('../requirements.json'),
    exec = require('child_process').exec,
    del = require('del'),
    unzip = require('gulp-unzip'),
    runSequence = require('run-sequence'),
    crypto = require('crypto'),
    fs = require('fs-extra'),
    rcedit = require('rcedit'),
    pjson = require('../package.json');

let prefetchFolder = 'requirements-cache';
let toolsFolder = 'tools';

let zaZip = path.join(toolsFolder, '7zip.zip');
let zaExe = path.join(common.buildFolderRoot, '7za.exe');
let zaSfx = path.join(common.buildFolderRoot, '7zS.sfx');

let zaExtra7z = path.join(toolsFolder, '7zip-extra.zip');
let zaElectronPackage = path.join(common.buildFolderRoot, common.artifactName + '-win32-x64');
let bundled7z = path.join(common.buildFolderRoot, common.artifactName +'-win32-x64.7z');
let installerExe = resolveInstallerExePath('');

module.exports = function(gulp) {

  gulp.task('create-dist-win-dir', function(cb) {
    return mkdirp(buildFolderPath, cb);
  });

  gulp.task('create-prefetch-cache-dir',function() {
    if (!fs.existsSync(prefetchFolder)) {
       mkdirp(prefetchFolder);
    }
  });

  gulp.task('create-tools-dir',function() {
    if (!fs.existsSync(toolsFolder)) {
       mkdirp(toolsFolder);
    }
  });

  // clean dist/ folder in prep for fresh build
  gulp.task('clean', function() {
    return del(['dist'], { force: true });
  });

  // clean dist/ AND prefetch-dependencies/ folder
  gulp.task('clean-all', ['clean'], function() {
    return del([prefetchFolder], { force: true });
  });

  // prefetch all the installer dependencies so we can package them up into the .exe
  gulp.task('prefetch', ['create-prefetch-cache-dir'], function() {
    return prefetch('yes', prefetchFolder);
  });

  gulp.task('prefetch-tools', ['create-tools-dir'], function() {
    return prefetch('tools', toolsFolder);
  });

  gulp.task('cleanup', function(cb) {
    return del([bundled7z, path.resolve(path.join(common.buildFolderRoot, '7z*'))], { force: false });
  });

  gulp.task('unzip-7zip', function() {
    return gulp.src(zaZip)
        .pipe(unzip({ filter : function(entry){ return minimatch(entry.path, "**/7za.exe") } }))
        .pipe(gulp.dest(common.buildFolderRoot));
  });

  gulp.task('unzip-7zip-extra', function(cb) {
    let cmd = zaExe + ' e ' + zaExtra7z + ' -o' + common.buildFolderRoot + ' -y ' + '7zS.sfx';
    // console.log(cmd);
    exec(cmd, createExecCallback(cb,true));
  });

  gulp.task('prepare-tools', function(cb) {
    runSequence('prefetch-tools', ['unzip-7zip'], 'unzip-7zip-extra', cb);
  });

  // wrap electron-generated app to 7zip archive
  gulp.task('create-7zip-archive', function(cb) {
    let packCmd = zaExe + ' a ' + bundled7z + ' ' + zaElectronPackage + path.sep + '*'
    // only include prefetch folder when zipping if the folder exists and we're doing a bundle build
    if (fs.existsSync(path.resolve(prefetchFolder)) && installerExe.indexOf("-bundle") > 0) {
      packCmd = packCmd + ' ' + path.resolve(prefetchFolder) + path.sep + '*';
    }
    //console.log('[DEBUG]' + packCmd);
    exec(packCmd, createExecCallback(cb, true));
  });

  gulp.task('update-metadata', function(cb) {
    return rcedit(zaSfx, {
      'icon': common.configIcon,
      'file-version': pjson.version,
      'product-version': pjson.version,
      'version-string': {
        'ProductName': pjson.productName,
        'FileDescription': pjson.description + ' v' + pjson.version,
        'CompanyName': 'Red Hat, Inc.',
        'LegalCopyright': 'Copyright 2016 Red Hat, Inc.',
        'OriginalFilename': common.artifactName + '-' + pjson.version + '-installer.exe'
      }
    }, cb);
  });

  gulp.task('create-final-exe', function(cb) {
    let configTxt = path.resolve('config.txt');
    let packageCmd = 'copy /b ' + zaSfx + ' + ' + configTxt + ' + ' + bundled7z + ' ' + installerExe;

    exec(packageCmd, createExecCallback(cb, true));
  });

  gulp.task('create-sha256sum-of-exe', function(cb) {
    createSHA256File(installerExe, cb);
  });

  gulp.task('package', function(cb) {
    runSequence('create-7zip-archive', 'update-metadata', 'create-final-exe', 'create-sha256sum-of-exe', cb);
  });
};

// for a given filename, return the sha256sum
function getSHA256(filename, cb) {
  var hashstring = "NONE";
  var hash = crypto.createHash('sha256');
  var readStream = fs.createReadStream(filename);
  readStream.on('readable', function () {
    var chunk;
    while (null !== (chunk = readStream.read())) {
      hash.update(chunk);
    }
  }).on('end', function () {
    hashstring = hash.digest('hex');
    cb(hashstring);
  });
}

// writes to {filename}.sha256, eg., 6441cde1821c93342e54474559dc6ff96d40baf39825a8cf57b9aad264093335 requirements.json
function createSHA256File(filename, cb) {
  !cb && cb();
  getSHA256(filename, function(hashstring) {
    fs.writeFile(filename + ".sha256", hashstring + " *" + path.parse(filename).base,(err)=>{
      cb(err);
    });
  });
}

// read the existing .sha256 file and compare it to the existing file's SHA
function isExistingSHA256Current(currentFile, sha256sum, processResult) {
  if (fs.existsSync(currentFile)) {
    getSHA256(currentFile, function(hashstring) {
      if (sha256sum !== hashstring) {
        console.log('[WARN] SHA256 in requirements.json (' + sha256sum + ') does not match computed SHA (' + hashstring + ') for ' + currentFile);
      }
      processResult(sha256sum === hashstring);
    });
  } else {
    processResult(false);
  }
}

function resolveInstallerExePath(artifactType) {
  return path.join(common.buildFolderRoot, common.artifactName + '-' + pjson.version + artifactType + '-installer.exe');
}

function prefetch(bundle, targetFolder) {
  let promises = new Set();
  for (let key in reqs) {
    if (reqs[key].bundle === bundle) {
      let currentUrl = reqs[key].url;
      let currentFile = path.join(targetFolder, key);
      promises.add(new Promise((resolve,reject) => {
        // if file is already downloaded, check its sha against the stored one
        downloadAndReadSHA256(targetFolder, key + ".sha256", reqs[key].sha256sum, reject, (currentSHA256) => {
          // console.log('[DEBUG] SHA256SUM for '+key+' = ' + currentSHA256);
          isExistingSHA256Current(currentFile, currentSHA256, (dl) => {
            dl ? resolve(true) : downloadFileAndCreateSha256(targetFolder, key, reqs[key].url, resolve, reject)
          });
        });
      }));
    }
  }
  return Promise.all(promises).then((result) => {
    if (bundle === 'yes') {
      installerExe = resolveInstallerExePath('-bundle');
    }
  });
}

function downloadAndReadSHA256(targetFolder, fileName, reqURL,  reject, processResult) {
  let currentFile = path.join(targetFolder, fileName);
  var currentSHA256 = 'NOSHA256SUM';
  if (reqURL.length == 64 && reqURL.indexOf("http") < 0 && reqURL.indexOf("ftp") < 0)
  {
    // return the hardcoded SHA256sum in requirements.json
    processResult(reqURL);
  } else {
    // download the remote SHA256sum, save the file, and return its value to compare to existing downloaded file
    console.log('[INFO] Check ' + fileName);
    downloadFile(reqURL, currentFile, (err, res) => {
      if (err) {
        reject(err);
      } else {
        // read the contents of the sha256sum file
        currentSHA256 = fs.readFileSync(currentFile,'utf8');
        // console.log ("[DEBUG] SHA256 = " + currentSHA256 + " for " + fileName);
        processResult(currentSHA256);
      }
    });
  }
}

function downloadFileAndCreateSha256(targetFolder, fileName, reqURL, resolve, reject) {
  let currentFile = path.join(targetFolder, fileName);
  var currentSHA256 = '';
  console.log('[INFO] Download ' + reqURL + ' to ' + currentFile);
  downloadFile(reqURL, currentFile, (err, res) => {
    if (err) {
      reject(err);
    } else {
      createSHA256File(currentFile,(shaGenError) => {
        shaGenError ? reject(shaGenError) : resolve(res);
      });
    }
  });
}

function downloadFile(fromUrl, toFile, onFinish) {
  request(fromUrl).pipe(fs.createWriteStream(toFile)).on('finish', onFinish);
}
