var path = require('path');

var exports = module.exports = {};

exports.artifactName = 'devsuite';
exports.buildFolderRoot = 'dist/win/';
exports.configIcon = path.resolve(path.join('resources', exports.artifactName + '.ico'));
exports.buildFolderPath = path.resolve(exports.buildFolderRoot);

// Create default callback for exec
exports.createExecCallback = function(cb, quiet) {
  return function(err,stdout,stderr) {
    if (!quiet) {
      console.log(stdout);
    }
    console.log(stderr);
    cb(err);
  }
};
