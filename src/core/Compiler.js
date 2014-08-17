// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var klass = require("./../base/klass");
var Node = require("./Node");
var Parser = require("./Parser");
var Generator = require("./Generator");
var MacroEvaluator = require("./MacroEvaluator");
var Environment = require("./Environment");
var CompilerMessage = require("./CompilerMessage");
var JavaScriptAST = require("./JavaScriptAST");

var ErrorReceiver = klass({

  initialize: function () {
    this.reset();
  },

  reset: function () {
    this.dup_check_table_ = {};
    this.buf_ = [];
    this.err_num_ = 0;
    this.stack_ = [];
  },

  received: function () { return this.buf_; },
  errorNum: function () { return this.err_num_; },

  enterCompileUnit: function () {
    this.stack_.push([this.buf_, this.err_num_]);
    this.buf_ = [];
    this.err_num_ = 0;
  },

  leaveCompileUnit: function () {
    if (this.stack_.length === 0) throw "LogicError ErrorReceiver#leaveCompileUnit";
    var ret = { received: this.buf_, errorNum: this.err_num_ };
    var en = this.stack_.pop();
    var buf = en[0], err_num = en[1];
    buf.push.apply(buf, this.buf_);
    this.buf_ = buf;
    this.err_num_ += err_num;
    return ret;
  },

  receiverFunc: function () {
    var self = this;
    return function (e) {
      if (self.dup_check_table_[e.toString()]) return;
      self.dup_check_table_[e.toString()] = true;
      if (e.type === "error")
        ++self.err_num_;
      self.buf_.push(e);
    }
  },
});

var Compiler = klass({

  initialize: function () {
    this.error_receiver_ = new ErrorReceiver();
    var receiver_func = this.error_receiver_.receiverFunc();

    this.env_        = new Environment();
    this.parser_     = new Parser(receiver_func);
    this.generator_  = new Generator(receiver_func);
    this.macroeval_  = new MacroEvaluator(receiver_func);
    this.optimizers_ = [];
  },

  registerRootMacro: function (name, f) { this.env_.registerRootMacro(name, f); },
  registerRootSymbolMacro: function (name, f) { this.env_.registerRootSymbolMacro(name, f); },

  registerRootMacros: function (macs) {
    for (var p in macs) {
      if (!macs.hasOwnProperty(p)) continue;
      this.registerRootMacro(p, macs[p]);
    }
  },

  registerOptimizer: function (o) {
    this.optimizers_.push(o);
  },

  enterErrorScope_: function () { return this.error_receiver_.enterCompileUnit(); },
  leaveErrorScope_: function () { return this.error_receiver_.leaveCompileUnit(); },

  compileNodes_: function (nodes, env) {
    var expanded = this.macroeval_.macroEvaluate(nodes, env, this);
    var optimized = this.optimizers_.reduce(function (ns, o) {
      return ns.map(function (n) { return Node.normalize(o(n, env)); });
    }, expanded);
    var ast = this.generator_.generate(optimized, env);
    return ast.code();
  },

  compile: function (s, filename) {
    try {
      JavaScriptAST.pushOnError(this.error_receiver_.receiverFunc());
      if (filename) {
        CompilerMessage.enterFile(filename);
        this.generator_.setCompileTimePath(filename);
      }
      this.parser_.setInput(s);
      var nodes = this.parser_.parseAll(this.env_);
      var code = this.compileNodes_(nodes, this.env_);
      if (this.error_receiver_.errorNum() > 0)
        code = undefined;
      return { errors: this.error_receiver_.received(), code: code };
    } catch (e) {
      return { errors: this.error_receiver_.received(), code: undefined, exception: e };
    } finally {
      this.error_receiver_.reset();
      if (filename) {
        this.generator_.setCompileTimePath();
        CompilerMessage.leaveFile();
      }
      JavaScriptAST.popOnError();
    }
  },

  // Public but internal use only.  Only for call from MacroEvaluator...
  compileNode: function (node, env) {
    this.enterErrorScope_();
    try {
      var code = this.compileNodes_([node], env);
    } finally {
      if (this.leaveErrorScope_().errorNum > 0)
        return undefined;
    }
    return code;
  },

});

module.exports = Compiler;

