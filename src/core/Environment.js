// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var klass = require("./../base/klass");
var devel = require("./../base/devel");
var ScopingHashtable = require("./../base/ScopingHashtable");
var ScopingEval = require("./../base/ScopingEval");
var Node = require("./Node");

var macros_root = new ScopingHashtable();
var symbol_macros_root = new ScopingHashtable();

var util_values_root = new ScopingHashtable();

var VARSCOPE_ARGUMENT = "argument";
var VARSCOPE_LOCAL = "local";
var VARSCOPE_EXTENRAL = "external";
var VARSCOPE_ENCLOSED = "enclosed";

var VariableSpec = klass({
  initialize: function (varscope, invariable, type) {
    this.varscope = varscope || VARSCOPE_LOCAL;
    this.invariable = !!invariable;
    this.type = type || "unknown";
    this.enclosed = false;
  }
});

var ExpansionFailure = klass({

  initialize: function (s) {
    this.message = s || "";
  },

  toString: function () {
    return "[ExpansionFailure] " + this.message;
  },

});

var Environment = klass({

  _static: {
    EvalError: ScopingEval.EvalError,
    ExpansionFailure: ExpansionFailure, 
  },

  initialize: function () {
    this.scopes_ = [];
    this.top_ = {
      macros:           macros_root,
      symbol_macros:    symbol_macros_root,
      vars:             new ScopingHashtable(),
      uniques:          [],
      util_values:      util_values_root,
      enclosing_scope:  undefined,
      interp_scope:     new ScopingEval(true),
      have_direct_eval: false,
    };

    var self = this;
    this.macroexpandenv_ = {
      gensym: function (s) {
        return self.uniqueSymbol(s || "_");
      },
      expansionFailure: function (s) {
        return new Environment.ExpansionFailure(s);
      },
      optimizing: function () {
        return false;
      },
    };
  },

  macroExpandEnv: function () {
    return this.macroexpandenv_;
  },

  enterScope: function () {
    var t = this.top_;
    this.scopes_.push(t);
    this.top_ = {
      macros:           new ScopingHashtable(t.macros),
      symbol_macros:    new ScopingHashtable(t.symbol_macros),
      vars:             new ScopingHashtable(t.vars),
      uniques:          [],
      util_values:      new ScopingHashtable(t.util_values),
      enclosing_scope:  t,
      interp_scope:     t.interp_scope.injectScope(),
      have_direct_eval: false,
    };
  },

  leaveScope: function () {
    var t = this.top_;
    this.top_ = this.scopes_.pop();

    var vars = this.top_.vars;
    t.vars.ownKeys().forEach(function (p) {
      if (!vars.has(p))
        vars.set(p, new VariableSpec(VARSCOPE_ENCLOSED, false));
    });

    // Do at tha final because it may throws.
    t.interp_scope.flush();
  },

  uniqueSymbol: function (name, line, col, filename) {
    var top = this.top_;
    var o = { uniq: true };  // uniq is a marker to indicate this is a unique symbol
    var n;

    // Delayed name determiner...
    //
    // Unlike usual SYMBOL names, the name of the SYMBOL created here cannot
    // be set until the code generation finished.  Because we cannot determine
    // whether a name is unique or not without knowing all names in the scope.
    //
    // As configured by Object.defineProperty() below, This function works as
    // the getter for Node#val instead of a string that contains the name.
    // Its real name is determined by the getter when it is first accessed.
    function nameIt() {
      // Just return the name, after it was determined.
      if (n)
        return n;

      // Find a unique name
      var vars = top.vars;
      function isntUnique(name) {
        return vars.owns(name) || (vars.has(name) && vars.get(name).varscope !== VARSCOPE_ENCLOSED);
      }
      var suffix = 0;
      if (isntUnique(n = name))
        while (isntUnique(n = name + suffix++));

      // Register the name.  We here treat the name as an enclosed one, even for
      // the current scope, to avoid to be duplicated in a variable declaration.
      // For the declaration the symbol must be registered by registerUnique().
      top.vars.set(n, new VariableSpec(VARSCOPE_ENCLOSED, false));

      // Propagate the name to enclosing scopes.
      // This is because any unique symbol generated in a surrounding scope
      // *must not* be identical to the name generated here.  Otherwise the
      // name may cause unintended shadowing names in enclosing scopes.
      for (var s = top.enclosing_scope; s; s = s.enclosing_scope) {
        if (s.vars.has(n))
          break;
        s.vars.set(n, new VariableSpec(VARSCOPE_ENCLOSED, false));
      }

      // TODO [MEMORY] Should overwrite the val property of the return value
      //      of uniqueSymbol(), to release the memory grabbed by nameIt()...?

      return n;
    }

    if (Object.defineProperty)
      Object.defineProperty(o, "val", { get: nameIt });
    else if (o.__defineGetter__)
      o.__defineGetter__("val", nameIt);
    else
      devel.dthrow("LogicError: no getter defining means.");

    return Node.nodify(o, "SYMBOL", line, col, filename);
  },

  registerDirectEvalCall: function () {
    for (var t = this.top_; t && !t.have_direct_eval; t = t.enclosing_scope)
      t.have_direct_eval = true;
  },

  touchVariable: function (varname) {
    var vars = this.top_.vars;
    var spec = vars.get(varname);
    if (spec && !vars.owns(varname))
      spec.enclosed = true;
  },

  isInvariable: function (varname) {
    var spec = this.top_.vars.get(varname);
    return spec && spec.invariable;
  },

  isKnownVariable: function (varname) {
    var spec = this.top_.vars.get(varname);
    if (!spec) return false;
    return spec.varscope === VARSCOPE_LOCAL
        || spec.varscope === VARSCOPE_ARGUMENT;
  },

  isKnownSymbol: function (sym) {
    if (sym.uniq) {
      for (var t = this.top_; t; t = t.enclosing_scope) {
        var uniqs = t.uniques;
        for (var i = 0; i < uniqs.length; ++i) {
          if (sym === uniqs[i])
            return true;
        }
      }
      return false;
    } else {
      return this.isKnownVariable(sym.val);
    }
  },

  registerVariable: function (varname, invariable, vartype) {
    var vars = this.top_.vars;
    var spec = vars.get(varname);

    if (!spec || spec.varscope === VARSCOPE_ENCLOSED) {
      // Not in the scope chain.  Consider it a innermost local variable.
      vars.set(varname, new VariableSpec(vartype || VARSCOPE_LOCAL, !!invariable));

    } else if (!vars.owns(varname)) {
      // Found in an outer scope.
      spec.enclosed = true;
    }
  },

  forceRegisterVariable: function (varname, invariable, vartype) {
    this.top_.vars.set(varname, new VariableSpec(vartype || VARSCOPE_LOCAL, !!invariable));
  },

  registerArgument: function (varname, invariable) {
    return this.forceRegisterVariable(varname, !!invariable, VARSCOPE_ARGUMENT); // 'Force' since arguments are always local.
  },

  registerUnique: function (uniqnode) {
    this.top_.uniques.push(uniqnode);
  },

  variableSymbolsInScope: function (target_varscope) {
    target_varscope || (target_varscope = VARSCOPE_LOCAL);
    var ret = [], vars = this.top_.vars;
    vars.ownKeys().forEach(function (p) {
      if (vars.get(p).varscope !== target_varscope) return;

      var sym = Node.makeSymbol(p);
      if (Node.symbolIsValidJSVarName(sym)) {
        ret.push(sym);
      } else {
        // Do nothing: ignore variables which have invalid names, to suppress confusing
        // error messages.  This makes the variables never appear in variable declarations.
        // Note that still we should detect appropriate errors from assignments to the variables.
      }
    });
    if (target_varscope === VARSCOPE_LOCAL) {
      ret.push.apply(ret, this.top_.uniques);
    }
    return ret;
  },

  variableInfoInScope: function () {
    var vars = this.top_.vars;
    var ret = {};
    vars.ownKeys().forEach(function (p) {
      var spec = vars.get(p);
      if ((spec.varscope !== VARSCOPE_LOCAL) &&
          (spec.varscope !== VARSCOPE_ARGUMENT)) return;
      ret[p] = spec;
    });
    this.top_.uniques.forEach(function (u) {
      ret[u.val] = new VariableSpec(VARSCOPE_LOCAL, false);
    });
    return ret;
  },

  //

  addCompileTimeCode: function (src) {
    var nonvar = !src.match(/^var\s|\Wvar\s/);
    this.top_.interp_scope.add(src, nonvar);
  },

  compileTimeEval: function (src) {
    //console.log("CTEVAL: " + src);
    return this.top_.interp_scope.eval(src);
  },

  //

  registerRootMacro: function (name, f) {
    macros_root.set(name, f);
  },

  registerRootSymbolMacro: function (name, f) {
    symbol_macros_root.set(name, f);
  },

  registerMacro: function (name, f) {
    var macs = this.top_.macros;
    if (macs.owns(name))
      return false;
    macs.set(name, f);
    return true;
  },

  registerSymbolMacro: function (name, f) {
    var smacs = this.top_.symbol_macros;
    if (smacs.owns(name))
      return false;
    smacs.set(name, f);
    return true;
  },

  macroFor: function (name) { return this.top_.macros.get(name); },
  symbolMacroFor: function (name) { return this.top_.symbol_macros.get(name); },

  allMacrosFor: function (name) { return this.top_.macros.getAll(name); },
  allSymbolMacrosFor: function (name) { return this.top_.symbol_macros.getAll(name); },

  
  utilValue: function (key) {
    var uv = this.top_.util_values.get(key);
    return uv && uv.symbol;
  },

  utilValues: function () {
    var ret = [];
    var uvs = this.top_.util_values;
    uvs.ownKeys().forEach(function (p) {
      ret.push(uvs.get(p));
    });
    return ret;
  },

  registerUtilValue: function (key, val) {
    var uv = this.top_.util_values.get(key);
    if (uv)
      return uv.symbol;

    val = (typeof val === "function") ? val() : val;

    var sym = this.uniqueSymbol(key);
    this.top_.util_values.set(key, { symbol: sym, val: val });
    return sym;
  },

});

module.exports = Environment;

