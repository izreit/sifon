// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var devel = require("./devel");
var util = require("./util");

var slice = Array.prototype.slice;

function klass (spec) {
  spec.baseKlass || (spec.baseKlass = Object);

  util.overwrite(spec.initialize, spec._static);

  var base_obj = Object.create(spec.baseKlass.prototype);
  util.a_of(spec.mixingin).forEach(function (mod) {
    util.overwrite(base_obj, mod);
  });
  util.overwrite(base_obj, spec);
  spec.initialize.prototype = base_obj;

  return spec.initialize;
}

module.exports = klass;

