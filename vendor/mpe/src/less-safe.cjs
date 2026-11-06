// SPDX-License-Identifier: MIT
// Copyright (c) 2026 PiperLiu
// Loaded only through build.js: no repository-controlled Less JavaScript runs.
'use strict';
const less = require('piper-less-original');
const pluginError = () => new Error('LESS plugins are not allowed in Piper styles.');
class DisabledPluginLoader extends less.PluginLoader {
  loadPlugin() { return Promise.reject(pluginError()); }
  loadPluginSync() { return { error: pluginError() }; }
  evalPlugin() { throw pluginError(); }
}
// Less does not propagate disablePluginRule to imported files. The loader
// override closes that path as well, without modifying the shared Less module.
const renderer = less.createFromEnvironment(less.environment, [new less.FileManager(), new less.UrlFileManager()]);
renderer.PluginLoader = DisabledPluginLoader;
renderer.options = { ...less.options };
renderer.fs = less.fs;
module.exports = {
  ...less,
  render(source, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    return renderer.render(source, {
      ...(options || {}),
      javascriptEnabled: false,
      disablePluginRule: true,
      reUsePluginManager: false,
      plugins: [],
    }, callback);
  },
};
