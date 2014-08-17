// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var klass = require("./../base/klass");

var scoping_hashtable_root = {};

var ScopingHashtable = klass({

  initialize: function (parent, initials) {
    initials || (initials = {});

    if (parent instanceof ScopingHashtable) {
      var parent_table = parent.table_;
      this.parent_ = parent;
    } else {
      var parent_table = scoping_hashtable_root;
      this.parent_ = undefined;
    }

    var table = this.table_ = Object.create(parent_table);
    Object.keys(initials).forEach(function (p) {
      table[p] = initials[p];
    });
  },

  ownKeys: function () {
    return Object.keys(this.table_);
  },

  owns: function (key) {
    return this.table_.hasOwnProperty(key);
  },

  has: function (key) {
    var v = this.table_[key];
    return v !== scoping_hashtable_root[key];
  },

  get: function (key) {
    var v = this.table_[key];
    return (v !== scoping_hashtable_root[key]) ? v : undefined;
  },

  getAll: function (key) {
    var ret = (this.parent_) ? this.parent_.getAll(key) : [];
    if (this.owns(key))
      ret.push(this.get(key));
    return ret;
  },

  set: function (key, value) {
    this.table_[key] = value;
  },

});

module.exports = ScopingHashtable;

