var builtin_macros;
builtin_macros = {};
builtin_macros["*if"] = function (node, cond) {
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  return __anode([
    __sym("if", 12, 4),
    cond,
    node
  ], 12, 4);
};
builtin_macros["*unless"] = function (node, cond) {
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  return __anode([
    __sym("if", 15, 4),
    __anode([
      __sym("not", 15, 8),
      cond
    ], 15, 8),
    node
  ], 15, 4);
};
builtin_macros["*++"] = function (node) {
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  return __anode([
    __sym("<<post++>>", 18, 6),
    node
  ], 18, 6);
};
builtin_macros["*--"] = function (node) {
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  return __anode([
    __sym("<<post-->>", 21, 6),
    node
  ], 21, 6);
};
builtin_macros["*."] = function (lhs, rhs) {
  var head, args, _qqv;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  if (rhs instanceof Array && rhs.length >= 1) {
    head = rhs[0];
    args = rhs.slice(1, rhs.length);
    _qqv = [];
    _qqv.push(__anode([
      __sym("<<dot>>", 26, 9),
      lhs,
      head
    ], 26, 9));
    _qqv.push.apply(_qqv, args);
    return __anode(_qqv, 26, 9);
  } else {
    head = rhs;
    return __anode([
      __sym("<<dot>>", 28, 9),
      lhs,
      head
    ], 28, 9);
  }
};
builtin_macros["*when"] = function (expr, whenpart) {
  var cond, body, sym;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  if (!(whenpart instanceof Array && whenpart.length == 2)) throw "MatchFailure";
  cond = whenpart[0];
  body = whenpart[1];
  sym = this.gensym("_it");
  return __anode([
    __sym("->", 34, 3),
    __anode([
      __sym("=", 34, 11),
      sym,
      expr
    ], 34, 11),
    __anode([
      __sym("macro-scope", 35, 6),
      __anode([
        __sym("->", 35, 18),
        __anode([
          __sym("symbol-macro", 36, 8),
          __sym("%it", 36, 21),
          __anode([
            __sym("->", 36, 25),
            __anode([
              __sym("<<quote>>", 36, 28),
              sym
            ], 36, 28)
          ], 36, 25)
        ], 36, 8),
        __anode([
          __sym("if", 37, 8),
          cond,
          body,
          sym
        ], 37, 8)
      ], 35, 18)
    ], 35, 6)
  ], 34, 3);
};
builtin_macros["*catch"] = function (trypart, catchpart) {
  var sym, _, _qqv, _qqv0, _qqv1, _qqv2;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  if (trypart instanceof Array && trypart.length >= 2 && trypart[0].nodetype === "SYMBOL" && trypart[0].val === "try" && trypart[trypart.length - 1] instanceof Array && trypart[trypart.length - 1].length >= 1 && trypart[trypart.length - 1][0].nodetype === "SYMBOL" && trypart[trypart.length - 1][0].val === "finally") {
    _ = trypart.slice(1, trypart.length - 1);
    _qqv2 = [];
    _qqv2.push(__sym("catch", 43, 10));
    _qqv2.push.apply(_qqv2, catchpart);
    return __anode([
      __sym("try", 42, 9),
      trypart,
      __anode(_qqv2, 43, 10)
    ], 42, 9);
  } else if (trypart instanceof Array && trypart.length >= 1 && trypart[0].nodetype === "SYMBOL" && trypart[0].val === "try") {
    _qqv1 = [];
    _qqv1.push(__sym("catch", 45, 20));
    _qqv1.push.apply(_qqv1, catchpart);
    _qqv0 = [];
    _qqv0.push.apply(_qqv0, trypart);
    _qqv0.push(__anode(_qqv1, 45, 20));
    return __anode(_qqv0, 45, 9);
  } else if (trypart instanceof Array && trypart.length >= 1 && trypart[0].nodetype === "SYMBOL" && trypart[0].val === "*catch") {
    sym = this.gensym();
    return __anode([
      __sym("meta-do", 48, 9),
      __anode([
        __sym("->", 48, 17),
        __anode([
          __sym("=", 49, 16),
          sym,
          __anode([
            __sym("%macroexpand-1", 49, 19),
            trypart
          ], 49, 19)
        ], 49, 16),
        __anode([
          __sym("<<quasiquote>>", 50, 11),
          __anode([
            __anode([
              __sym("<<unquote-splicing>>", 50, 15),
              __anode([
                __sym("<<dot>>", 50, 18),
                sym,
                __anode([
                  __sym("<<array>>", 50, 23),
                  0
                ], 50, 23)
              ], 50, 18)
            ], 50, 15),
            __anode([
              __sym("catch", 50, 29),
              __anode([
                __sym("<<unquote-splicing>>", 50, 35),
                __anode([
                  __sym("<<quote>>", 50, 37),
                  catchpart
                ], 50, 37)
              ], 50, 35)
            ], 50, 29)
          ], 50, 15)
        ], 50, 11)
      ], 48, 17)
    ], 48, 9);
  } else {
    _qqv = [];
    _qqv.push(__sym("catch", 53, 10));
    _qqv.push.apply(_qqv, catchpart);
    return __anode([
      __sym("try", 52, 9),
      trypart,
      __anode(_qqv, 53, 10)
    ], 52, 9);
  }
};
builtin_macros["*finally"] = function (trypart, finallypart) {
  var sym, _, _qqv, _qqv0;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  if (trypart instanceof Array && trypart.length >= 2 && trypart[0].nodetype === "SYMBOL" && trypart[0].val === "try" && trypart[trypart.length - 1] instanceof Array && trypart[trypart.length - 1].length >= 1 && trypart[trypart.length - 1][0].nodetype === "SYMBOL" && trypart[trypart.length - 1][0].val === "finally") {
    _ = trypart.slice(1, trypart.length - 1);
    _qqv0 = [];
    _qqv0.push(__sym("try", 58, 9));
    _qqv0.push.apply(_qqv0, trypart);
    _qqv0.push(__anode([
      __sym("finally", 59, 10),
      finallypart
    ], 59, 10));
    return __anode(_qqv0, 58, 9);
  } else if (trypart instanceof Array && trypart.length >= 1 && trypart[0].nodetype === "SYMBOL" && trypart[0].val === "try") {
    _qqv = [];
    _qqv.push.apply(_qqv, trypart);
    _qqv.push(__anode([
      __sym("finally", 61, 20),
      finallypart
    ], 61, 20));
    return __anode(_qqv, 61, 9);
  } else if (trypart instanceof Array && trypart.length >= 1 && trypart[0].nodetype === "SYMBOL" && trypart[0].val === "*catch") {
    sym = this.gensym();
    return __anode([
      __sym("meta-do", 64, 9),
      __anode([
        __sym("->", 64, 17),
        __anode([
          __sym("=", 65, 16),
          sym,
          __anode([
            __sym("%macroexpand-1", 65, 19),
            trypart
          ], 65, 19)
        ], 65, 16),
        __anode([
          __sym("<<quasiquote>>", 66, 11),
          __anode([
            __anode([
              __sym("<<unquote-splicing>>", 66, 15),
              __anode([
                __sym("<<dot>>", 66, 18),
                sym,
                __anode([
                  __sym("<<array>>", 66, 23),
                  0
                ], 66, 23)
              ], 66, 18)
            ], 66, 15),
            __anode([
              __sym("finally", 66, 29),
              __anode([
                __sym("<<unquote>>", 66, 37),
                __anode([
                  __sym("<<quote>>", 66, 38),
                  finallypart
                ], 66, 38)
              ], 66, 37)
            ], 66, 29)
          ], 66, 15)
        ], 66, 11)
      ], 64, 17)
    ], 64, 9);
  } else {
    return __anode([
      __sym("try", 68, 9),
      trypart,
      __anode([
        __sym("finally", 69, 10),
        finallypart
      ], 69, 10)
    ], 68, 9);
  }
};
builtin_macros["*NODE_DEBUG"] = function (node) {
  return process.env.NODE_DEBUG ? node : undefined;
};
builtin_macros.unless = function (cond, then_clause, else_clause) {
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  else_clause == undefined && (else_clause = undefined);
  return __anode([
    __sym("if", 75, 6),
    __anode([
      __sym("not", 75, 10),
      cond
    ], 75, 10),
    then_clause,
    else_clause
  ], 75, 6);
};
builtin_macros["#+"] = function (args, body) {
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  return __anode([
    __anode([
      __sym("<<dot>>", 78, 7),
      __anode([
        __sym("#", 78, 7),
        args,
        body
      ], 78, 7),
      __sym("bind", 78, 22)
    ], 78, 7),
    __sym("this", 78, 27)
  ], 78, 7);
};
builtin_macros["#match"] = function () {
  var body, it, _qqv;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  body = [].slice.call(arguments, 0, arguments.length);
  if (body instanceof Array && body.length == 1 && body[0] instanceof Array && body[0].length >= 1 && body[0][0].nodetype === "SYMBOL" && body[0][0].val === "->") {
    it = body[0].slice(1, body[0].length);
    body = it;
  } else {
    body = body;
  }
  _qqv = [];
  _qqv.push(__sym("match", 89, 13));
  _qqv.push(__anode([
    __sym("<<dot>>", 89, 19),
    __sym("arguments", 89, 19),
    __anode([
      __sym("<<array>>", 89, 29),
      0
    ], 89, 29)
  ], 89, 19));
  _qqv.push.apply(_qqv, body);
  return __anode([
    __sym("#", 89, 6),
    __anode([], 89, 7),
    __anode([
      __sym("->", 89, 10),
      __anode(_qqv, 89, 13)
    ], 89, 10)
  ], 89, 6);
};
builtin_macros["#match+"] = function () {
  var body, it, _qqv;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  body = [].slice.call(arguments, 0, arguments.length);
  if (body instanceof Array && body.length == 1 && body[0] instanceof Array && body[0].length >= 1 && body[0][0].nodetype === "SYMBOL" && body[0][0].val === "->") {
    it = body[0].slice(1, body[0].length);
    body = it;
  } else {
    body = body;
  }
  _qqv = [];
  _qqv.push(__sym("match", 93, 14));
  _qqv.push(__anode([
    __sym("<<dot>>", 93, 20),
    __sym("arguments", 93, 20),
    __anode([
      __sym("<<array>>", 93, 30),
      0
    ], 93, 30)
  ], 93, 20));
  _qqv.push.apply(_qqv, body);
  return __anode([
    __sym("#+", 93, 6),
    __anode([], 93, 8),
    __anode([
      __sym("->", 93, 11),
      __anode(_qqv, 93, 14)
    ], 93, 11)
  ], 93, 6);
};
builtin_macros["do"] = function (arg, block) {
  var it, _assignee, _qqv;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  if (!block) {
    _assignee = [
      [],
      arg
    ];
    if (!(_assignee instanceof Array && _assignee.length == 2)) throw "MatchFailure";
    arg = _assignee[0];
    block = _assignee[1];
  }
  if (arg instanceof Array && arg.length >= 1 && arg[0].nodetype === "SYMBOL" && arg[0].val === "<<tuple>>") {
    it = arg.slice(1, arg.length);
    arg = it;
  } else {
    arg = arg;
  }
  if (arg instanceof Array) {
    _qqv = [];
    _qqv.push(__anode([
      __sym("#", 100, 10),
      arg,
      block
    ], 100, 10));
    _qqv.push.apply(_qqv, arg);
    return __anode(_qqv, 100, 10);
  } else {
    return __anode([
      __anode([
        __sym("#", 102, 10),
        arg,
        block
      ], 102, 10),
      arg
    ], 102, 10);
  }
};
builtin_macros.loop = function (label, block) {
  var _assignee;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  if (!block) {
    _assignee = [
      undefined,
      label
    ];
    if (!(_assignee instanceof Array && _assignee.length == 2)) throw "MatchFailure";
    label = _assignee[0];
    block = _assignee[1];
  }
  if (label) {
    return __anode([
      __sym("for", 107, 9),
      __anode([], 107, 13),
      label,
      block
    ], 107, 9);
  } else {
    return __anode([
      __sym("for", 109, 9),
      __anode([], 109, 13),
      block
    ], 109, 9);
  }
};
builtin_macros["case"] = function () {
  var cases, it, cs, _qqv;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  cases = [].slice.call(arguments, 0, arguments.length);
  if (cases instanceof Array && cases.length == 1 && cases[0] instanceof Array && cases[0].length >= 1 && cases[0][0].nodetype === "SYMBOL" && cases[0][0].val === "->") {
    it = cases[0].slice(1, cases[0].length);
    cases = it;
  } else {
    cases = cases;
  }
  cs = cases.map(function (c) {
    var cond, _matchee;
    var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
      return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
    }, __sym = function (v, l, c) {
      return {
        nodetype: "SYMBOL",
        line: l,
        col: c,
        val: v,
        toString: function () {
          return this.val;
        },
        filename: _compiletime_path
      };
    };
    _matchee = c[0];
    if (_matchee instanceof Array && _matchee.length >= 1 && _matchee[0].nodetype === "SYMBOL" && _matchee[0].val === "typeof") {
      throw this.expansionFailure("A pattern in case cannot have `typeof'");
    } else if (_matchee instanceof Array && _matchee.length >= 1 && _matchee[0].nodetype === "SYMBOL" && _matchee[0].val === "instanceof") {
      throw this.expansionFailure("A pattern in case cannot have `instanceof'");
    } else if (_matchee.nodetype === "SYMBOL" && _matchee.val === "_") {
      cond = c[0];
    } else {
      cond = __anode([
        __sym("if", 120, 24),
        c[0]
      ], 120, 24);
    }
    return [
      cond,
      c[1]
    ];
  });
  _qqv = [];
  _qqv.push(__sym("match", 122, 6));
  _qqv.push(false);
  _qqv.push.apply(_qqv, cs);
  return __anode(_qqv, 122, 6);
};
builtin_macros["=freeze"] = function (lhs, rhs) {
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  };
  if (this.optimizing()) {
    return __anode([
      __sym("=", 126, 15),
      lhs,
      rhs
    ], 126, 15);
  } else {
    return __anode([
      __sym("=", 127, 15),
      lhs,
      __anode([
        __anode([
          __sym("<<dot>>", 127, 18),
          __sym("Object", 127, 18),
          __sym("freeze", 127, 25)
        ], 127, 18),
        rhs
      ], 127, 18)
    ], 127, 15);
  }
};
builtin_macros.reap = function (tag, block) {
  var tagstr, res, _assignee;
  var _compiletime_path = "src\\sifonlib\\builtin_macros.sifon", __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v,
      toString: function () {
        return this.val;
      },
      filename: _compiletime_path
    };
  }, __anode = function (a, l, c) {
    return a.nodetype = "ARRAY", a.line = l, a.col = c, a.filename = _compiletime_path, a;
  };
  if (block) {
    
  } else {
    _assignee = [
      __sym("_", 132, 31),
      tag
    ];
    if (!(_assignee instanceof Array && _assignee.length == 2)) throw "MatchFailure";
    tag = _assignee[0];
    block = _assignee[1];
  }
  tagstr = tag.toString();
  res = this.gensym("_reaping" + tagstr);
  return __anode([
    __sym("macro-scope", 135, 6),
    __anode([
      __sym("->", 135, 18),
      __anode([
        __sym("=", 136, 13),
        res,
        __anode([__sym("<<array>>", 136, 16)], 136, 16)
      ], 136, 13),
      __anode([
        __sym("macro", 137, 8),
        __sym("sow", 137, 14),
        __anode([
          __sym("<<tuple>>", 137, 24),
          __sym("value", 137, 19),
          __anode([
            __sym("=", 137, 28),
            __sym("t", 137, 26),
            __anode([
              __sym("<<quote>>", 137, 31),
              __sym("_", 137, 32)
            ], 137, 31)
          ], 137, 28)
        ], 137, 24),
        __anode([
          __sym("->", 137, 35),
          __anode([
            __sym("if", 138, 10),
            __anode([
              __sym("!=", 138, 28),
              __anode([__anode([
                __sym("<<dot>>", 138, 14),
                __sym("t", 138, 14),
                __sym("toString", 138, 16)
              ], 138, 14)], 138, 14),
              tagstr
            ], 138, 28),
            __anode([
              __sym("throw", 139, 12),
              __anode([
                __anode([
                  __sym("@", 139, 21),
                  __sym("expansionFailure", 139, 22)
                ], 139, 21),
                "Tag mismatch."
              ], 139, 21)
            ], 139, 12)
          ], 138, 10),
          __anode([
            __sym("<<quasiquote>>", 140, 10),
            __anode([
              __anode([
                __sym("<<dot>>", 140, 14),
                __anode([
                  __sym("<<unquote>>", 140, 14),
                  __anode([
                    __sym("<<quote>>", 140, 15),
                    res
                  ], 140, 15)
                ], 140, 14),
                __sym("push", 140, 21)
              ], 140, 14),
              __anode([
                __sym("<<unquote>>", 140, 26),
                __sym("value", 140, 27)
              ], 140, 26)
            ], 140, 14)
          ], 140, 10)
        ], 137, 35)
      ], 137, 8),
      block,
      res
    ], 135, 18)
  ], 135, 6);
};
module.exports = { builtin_macros: builtin_macros };