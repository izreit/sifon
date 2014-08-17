// vim: set ts=2 sts=2 sw=2 et si:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var klass = require("./../base/klass");
var devel = require("./../base/devel");
var util = require("./../base/util");

var unique_counter = 0;
function gensym(s) {
  return (s || "") + "_jjt" + (unique_counter++);
};

var Template = klass({

  _static: {
    cached: {},
  },

  initialize: function (templ) {
    if (!(this instanceof Template.prototype.initialize)) {
      var args___ = Array.prototype.slice.call(arguments, 1);
      var t = Template.cached[templ] || (Template.cached[templ] = new Template(templ));
      return t.makeWithArray(args___);
    }

    var sym = gensym("args");
    var src;

    (function () {
      var symmap = [];
      var localgensym = function (s) {
        return symmap[s] || (symmap[s] = gensym(s));
      }
      src = util.escapeString(templ);

      // Replace ### to refer arguments.
      var i = 0;
      src = src.replace(/###/g, function () { return '"+(' + sym + '[' + (i++) + '])+"'; })

      // Rename the symbols following '##' to unique.
      src = src.replace(/##([a-zA-Z]\w*|_\w+)/g, function (r,a) { return localgensym(a); });
    })();

    this.source_ = templ;
    var s = 'var ' + sym + '=arguments;return ("' + src + '");';
    this.func_ = Function(s);
  },

  source: function () { return this.source_; },

  make: function () {
    return this.func_.apply(null, arguments);
  },

  makeWithArray: function (arg) {
    return this.func_.apply(null, arg);
  },

});

module.exports = Template;

