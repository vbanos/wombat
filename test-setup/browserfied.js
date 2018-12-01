export function chaiURL (chai, utils) {
  const Assertion = chai.Assertion;
  const props = [
    'hash',
    'host',
    'hostname',
    'href',
    'origin',
    'password',
    'pathname',
    'port',
    'protocol',
    'search',
    'username'];

  const matchers = {
    protocol (expected, actual, contains) {
      if (contains) return actual.includes(expected);
      return expected === actual || expected + ':' === actual;
    },
    hash (expected, actual, contains) {
      return matchers.default(expected, actual, contains) || matchers.default('#' + expected, actual, contains);
    },
    port (expected, actual, contains) {
      if (contains) {
        console.warn('chai-url: `contains` flag should not be used with port matching and will be ignored');
      }
      return expected === actual || expected === parseInt(actual, 10);
    },
    default (expected, actual, contains) {
      return contains ? actual.includes(expected) : actual === expected;
    }
  };

  function assertIsUrl () {
    const obj = this._obj;
    new Assertion(() => new URL(obj)).to.not.throw();
  }

  function chainIsUrl () {
    const obj = this._obj;
    try {
      utils.flag(this, 'URL', new URL(obj));
    } catch (e) {
      // hack :'(
      new Assertion(() => { throw e; }).to.not.throw();
    }
  }

  Assertion.addChainableMethod('url', assertIsUrl, chainIsUrl);

  let i = props.length;
  while (i--) {
    let prop = props[i];
    Assertion.addMethod(prop, function (value) {
      const maybeURL = utils.flag(this, 'URL');
      if (maybeURL) {
        const contains = utils.flag(this, 'contains');
        const matcher = matchers[prop] || matchers.default;
        const match = matcher(value, maybeURL[prop], contains);
        this.assert(
          match,
          `expected #{this} to have ${prop} #{exp} but got #{act}`,
          `expected #{this} to not to have ${prop} #{act}`,
          value,
          maybeURL[prop]
        );
      } else {
        const str = this._obj;
        const url = new URL('about:blank');
        new Assertion(() => { url.href = str; }).to.not.throw();
        const contains = utils.flag(this, 'contains');
        const matcher = matchers[prop] || matchers.default;
        const match = matcher(value, url[prop], contains);
        this.assert(
          match,
          `expected #{this} to have ${prop} #{exp} but got #{act}`,
          `expected #{this} to not to have ${prop} #{act}`,
          value,
          url[prop]
        );
      }
    });
  }
}

export function chaiAsPromised (chai, utils) {
  const Assertion = chai.Assertion;
  const assert = chai.assert;
  const proxify = utils.proxify;

  function compatibleInstance (thrown, errorLike) {
    return errorLike instanceof Error && thrown === errorLike;
  }

  function compatibleConstructor (thrown, errorLike) {
    if (errorLike instanceof Error) {
      // If `errorLike` is an instance of any error we compare their constructors
      return thrown.constructor === errorLike.constructor || thrown instanceof errorLike.constructor;
    } else if (errorLike.prototype instanceof Error || errorLike === Error) {
      // If `errorLike` is a constructor that inherits from Error, we compare `thrown` to `errorLike` directly
      return thrown.constructor === errorLike || thrown instanceof errorLike;
    }

    return false;
  }
  function compatibleMessage (thrown, errMatcher) {
    var comparisonString = typeof thrown === 'string' ? thrown : thrown.message;
    if (errMatcher instanceof RegExp) {
      return errMatcher.test(comparisonString);
    } else if (typeof errMatcher === 'string') {
      return comparisonString.indexOf(errMatcher) !== -1; // eslint-disable-line no-magic-numbers
    }

    return false;
  }

  var functionNameMatch = /\s*function(?:\s|\s*\/\*[^(?:*\/)]+\*\/\s*)*([^\(\/]+)/;
  function getFunctionName (constructorFn) {
    var name = '';
    if (typeof constructorFn.name === 'undefined') {
      // Here we run a polyfill if constructorFn.name is not defined
      var match = String(constructorFn).match(functionNameMatch);
      if (match) {
        name = match[1];
      }
    } else {
      name = constructorFn.name;
    }

    return name;
  }

  function getConstructorName (errorLike) {
    var constructorName = errorLike;
    if (errorLike instanceof Error) {
      constructorName = getFunctionName(errorLike.constructor);
    } else if (typeof errorLike === 'function') {
      // If `err` is not an instance of Error it is an error constructor itself or another function.
      // If we've got a common function we get its name, otherwise we may need to create a new instance
      // of the error just in case it's a poorly-constructed error. Please see chaijs/chai/issues/45 to know more.
      constructorName = getFunctionName(errorLike).trim() ||
        getFunctionName(new errorLike()); // eslint-disable-line new-cap
    }

    return constructorName;
  }

  function getMessage (errorLike) {
    var msg = '';
    if (errorLike && errorLike.message) {
      msg = errorLike.message;
    } else if (typeof errorLike === 'string') {
      msg = errorLike;
    }

    return msg;
  }

  let checkError = {
    compatibleInstance: compatibleInstance,
    compatibleConstructor: compatibleConstructor,
    compatibleMessage: compatibleMessage,
    getMessage: getMessage,
    getConstructorName: getConstructorName
  };

  const transferPromiseness = (assertion, promise) => {
    assertion.then = promise.then.bind(promise);
  };

  const transformAsserterArgs = values => values;

  // If we are using a version of Chai that has checkError on it,
  // we want to use that version to be consistent. Otherwise, we use
  // what was passed to the factory.
  if (utils.checkError) {
    checkError = utils.checkError;
  }

  function isLegacyJQueryPromise (thenable) {
    // jQuery promises are Promises/A+-compatible since 3.0.0. jQuery 3.0.0 is also the first version
    // to define the catch method.
    return typeof thenable.catch !== 'function' &&
      typeof thenable.always === 'function' &&
      typeof thenable.done === 'function' &&
      typeof thenable.fail === 'function' &&
      typeof thenable.pipe === 'function' &&
      typeof thenable.progress === 'function' &&
      typeof thenable.state === 'function';
  }

  function assertIsAboutPromise (assertion) {
    if (typeof assertion._obj.then !== 'function') {
      throw new TypeError(utils.inspect(assertion._obj) + ' is not a thenable.');
    }
    if (isLegacyJQueryPromise(assertion._obj)) {
      throw new TypeError('Chai as Promised is incompatible with thenables of jQuery<3.0.0, sorry! Please ' +
        'upgrade jQuery or use another Promises/A+ compatible library (see ' +
        'http://promisesaplus.com/).');
    }
  }

  function proxifyIfSupported (assertion) {
    return proxify === undefined ? assertion : proxify(assertion);
  }

  function method (name, asserter) {
    utils.addMethod(Assertion.prototype, name, function () {
      assertIsAboutPromise(this);
      return asserter.apply(this, arguments);
    });
  }

  function property (name, asserter) {
    utils.addProperty(Assertion.prototype, name, function () {
      assertIsAboutPromise(this);
      return proxifyIfSupported(asserter.apply(this, arguments));
    });
  }

  function doNotify (promise, done) {
    promise.then(() => done(), done);
  }

  // These are for clarity and to bypass Chai refusing to allow `undefined` as actual when used with `assert`.
  function assertIfNegated (assertion, message, extra) {
    assertion.assert(true, null, message, extra.expected, extra.actual);
  }

  function assertIfNotNegated (assertion, message, extra) {
    assertion.assert(false, message, null, extra.expected, extra.actual);
  }

  function getBasePromise (assertion) {
    // We need to chain subsequent asserters on top of ones in the chain already (consider
    // `eventually.have.property("foo").that.equals("bar")`), only running them after the existing ones pass.
    // So the first base-promise is `assertion._obj`, but after that we use the assertions themselves, i.e.
    // previously derived promises, to chain off of.
    return typeof assertion.then === 'function' ? assertion : assertion._obj;
  }

  function getReasonName (reason) {
    return reason instanceof Error ? reason.toString() : checkError.getConstructorName(reason);
  }

  // Grab these first, before we modify `Assertion.prototype`.

  const propertyNames = Object.getOwnPropertyNames(Assertion.prototype);

  const propertyDescs = {};
  for (const name of propertyNames) {
    propertyDescs[name] = Object.getOwnPropertyDescriptor(Assertion.prototype, name);
  }

  property('fulfilled', function () {
    const derivedPromise = getBasePromise(this).then(
      value => {
        assertIfNegated(this,
          'expected promise not to be fulfilled but it was fulfilled with #{act}',
          { actual: value });
        return value;
      },
      reason => {
        assertIfNotNegated(this,
          'expected promise to be fulfilled but it was rejected with #{act}',
          { actual: getReasonName(reason) });
        return reason;
      }
    );

    module.exports.transferPromiseness(this, derivedPromise);
    return this;
  });

  property('rejected', function () {
    const derivedPromise = getBasePromise(this).then(
      value => {
        assertIfNotNegated(this,
          'expected promise to be rejected but it was fulfilled with #{act}',
          { actual: value });
        return value;
      },
      reason => {
        assertIfNegated(this,
          'expected promise not to be rejected but it was rejected with #{act}',
          { actual: getReasonName(reason) });

        // Return the reason, transforming this into a fulfillment, to allow further assertions, e.g.
        // `promise.should.be.rejected.and.eventually.equal("reason")`.
        return reason;
      }
    );

    module.exports.transferPromiseness(this, derivedPromise);
    return this;
  });

  method('rejectedWith', function (errorLike, errMsgMatcher, message) {
    let errorLikeName = null;
    const negate = utils.flag(this, 'negate') || false;

    // rejectedWith with that is called without arguments is
    // the same as a plain ".rejected" use.
    if (errorLike === undefined && errMsgMatcher === undefined &&
      message === undefined) {
      /* eslint-disable no-unused-expressions */
      return this.rejected;
      /* eslint-enable no-unused-expressions */
    }

    if (message !== undefined) {
      utils.flag(this, 'message', message);
    }

    if (errorLike instanceof RegExp || typeof errorLike === 'string') {
      errMsgMatcher = errorLike;
      errorLike = null;
    } else if (errorLike && errorLike instanceof Error) {
      errorLikeName = errorLike.toString();
    } else if (typeof errorLike === 'function') {
      errorLikeName = checkError.getConstructorName(errorLike);
    } else {
      errorLike = null;
    }
    const everyArgIsDefined = Boolean(errorLike && errMsgMatcher);

    let matcherRelation = 'including';
    if (errMsgMatcher instanceof RegExp) {
      matcherRelation = 'matching';
    }

    const derivedPromise = getBasePromise(this).then(
      value => {
        let assertionMessage = null;
        let expected = null;

        if (errorLike) {
          assertionMessage = 'expected promise to be rejected with #{exp} but it was fulfilled with #{act}';
          expected = errorLikeName;
        } else if (errMsgMatcher) {
          assertionMessage = `expected promise to be rejected with an error ${matcherRelation} #{exp} but ` +
            `it was fulfilled with #{act}`;
          expected = errMsgMatcher;
        }

        assertIfNotNegated(this, assertionMessage, { expected, actual: value });
        return value;
      },
      reason => {
        const errorLikeCompatible = errorLike && (errorLike instanceof Error
          ? checkError.compatibleInstance(reason, errorLike)
          : checkError.compatibleConstructor(reason, errorLike));

        const errMsgMatcherCompatible = errMsgMatcher && checkError.compatibleMessage(reason, errMsgMatcher);

        const reasonName = getReasonName(reason);

        if (negate && everyArgIsDefined) {
          if (errorLikeCompatible && errMsgMatcherCompatible) {
            this.assert(true,
              null,
              'expected promise not to be rejected with #{exp} but it was rejected ' +
              'with #{act}',
              errorLikeName,
              reasonName);
          }
        } else {
          if (errorLike) {
            this.assert(errorLikeCompatible,
              'expected promise to be rejected with #{exp} but it was rejected with #{act}',
              'expected promise not to be rejected with #{exp} but it was rejected ' +
              'with #{act}',
              errorLikeName,
              reasonName);
          }

          if (errMsgMatcher) {
            this.assert(errMsgMatcherCompatible,
              `expected promise to be rejected with an error ${matcherRelation} #{exp} but got ` +
              `#{act}`,
              `expected promise not to be rejected with an error ${matcherRelation} #{exp}`,
              errMsgMatcher,
              checkError.getMessage(reason));
          }
        }

        return reason;
      }
    );

    module.exports.transferPromiseness(this, derivedPromise);
    return this;
  });

  property('eventually', function () {
    utils.flag(this, 'eventually', true);
    return this;
  });

  method('notify', function (done) {
    doNotify(getBasePromise(this), done);
    return this;
  });

  method('become', function (value, message) {
    return this.eventually.deep.equal(value, message);
  });

  // ### `eventually`

  // We need to be careful not to trigger any getters, thus `Object.getOwnPropertyDescriptor` usage.
  const methodNames = propertyNames.filter(name => {
    return name !== 'assert' && typeof propertyDescs[name].value === 'function';
  });

  methodNames.forEach(methodName => {
    Assertion.overwriteMethod(methodName, originalMethod => function () {
      return doAsserterAsyncAndAddThen(originalMethod, this, arguments);
    });
  });

  const getterNames = propertyNames.filter(name => {
    return name !== '_obj' && typeof propertyDescs[name].get === 'function';
  });

  getterNames.forEach(getterName => {
    // Chainable methods are things like `an`, which can work both for `.should.be.an.instanceOf` and as
    // `should.be.an("object")`. We need to handle those specially.
    const isChainableMethod = Assertion.prototype.__methods.hasOwnProperty(getterName);

    if (isChainableMethod) {
      Assertion.overwriteChainableMethod(
        getterName,
        originalMethod => function () {
          return doAsserterAsyncAndAddThen(originalMethod, this, arguments);
        },
        originalGetter => function () {
          return doAsserterAsyncAndAddThen(originalGetter, this);
        }
      );
    } else {
      Assertion.overwriteProperty(getterName, originalGetter => function () {
        return proxifyIfSupported(doAsserterAsyncAndAddThen(originalGetter, this));
      });
    }
  });

  function doAsserterAsyncAndAddThen (asserter, assertion, args) {
    // Since we're intercepting all methods/properties, we need to just pass through if they don't want
    // `eventually`, or if we've already fulfilled the promise (see below).
    if (!utils.flag(assertion, 'eventually')) {
      asserter.apply(assertion, args);
      return assertion;
    }

    const derivedPromise = getBasePromise(assertion).then(value => {
      // Set up the environment for the asserter to actually run: `_obj` should be the fulfillment value, and
      // now that we have the value, we're no longer in "eventually" mode, so we won't run any of this code,
      // just the base Chai code that we get to via the short-circuit above.
      assertion._obj = value;
      utils.flag(assertion, 'eventually', false);

      return args ? module.exports.transformAsserterArgs(args) : args;
    }).then(newArgs => {
      asserter.apply(assertion, newArgs);

      // Because asserters, for example `property`, can change the value of `_obj` (i.e. change the "object"
      // flag), we need to communicate this value change to subsequent chained asserters. Since we build a
      // promise chain paralleling the asserter chain, we can use it to communicate such changes.
      return assertion._obj;
    });

    module.exports.transferPromiseness(assertion, derivedPromise);
    return assertion;
  }

  // ### Now use the `Assertion` framework to build an `assert` interface.
  const originalAssertMethods = Object.getOwnPropertyNames(assert).filter(propName => {
    return typeof assert[propName] === 'function';
  });

  assert.isFulfilled = (promise, message) => (new Assertion(promise, message)).to.be.fulfilled;

  assert.isRejected = (promise, errorLike, errMsgMatcher, message) => {
    const assertion = new Assertion(promise, message);
    return assertion.to.be.rejectedWith(errorLike, errMsgMatcher, message);
  };

  assert.becomes = (promise, value, message) => assert.eventually.deepEqual(promise, value, message);

  assert.doesNotBecome = (promise, value, message) => assert.eventually.notDeepEqual(promise, value, message);

  assert.eventually = {};
  originalAssertMethods.forEach(assertMethodName => {
    assert.eventually[assertMethodName] = function (promise) {
      const otherArgs = Array.prototype.slice.call(arguments, 1);

      let customRejectionHandler;
      const message = arguments[assert[assertMethodName].length - 1];
      if (typeof message === 'string') {
        customRejectionHandler = reason => {
          throw new chai.AssertionError(`${message}\n\nOriginal reason: ${utils.inspect(reason)}`);
        };
      }

      const returnedPromise = promise.then(
        fulfillmentValue => assert[assertMethodName].apply(assert, [fulfillmentValue].concat(otherArgs)),
        customRejectionHandler
      );

      returnedPromise.notify = done => {
        doNotify(returnedPromise, done);
      };

      return returnedPromise;
    };
  });
}

export function chaiInterface (chai, utils) {
  var Assertion = chai.Assertion;
  var assert = chai.assert;
  var every = Array.prototype.every;
  var some = Array.prototype.some;

  function or () {
    var terms = arguments;
    return function () {
      var ctx = this;
      var args = arguments;
      return some.call(terms, function (term) {
        return !!term.apply(ctx, args);
      });
    };
  }

  function and () {
    var terms = arguments;
    return function () {
      var ctx = this;
      var args = arguments;
      return every.call(terms, function (term) {
        return !!term.apply(ctx, args);
      });
    };
  }

  function not (term) {
    return function () {
      return !term.apply(this, arguments);
    };
  }

  var or_1 = or;
  var and_1 = and;
  var not_1 = not;

  var connective = {
    or: or_1,
    and: and_1,
    not: not_1
  };

  var commonjsGlobal = typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined' ? global : typeof self !== 'undefined'
      ? self
      : {};

  var k = function K (x) {
    return function () {
      return x;
    };
  };

  function all (predicate) {
    return function (arr) {
      return arr.every(predicate);
    };
  }

  is.TypeOf = function (type) {
    type = type.toLowerCase();
    return function (subject) {
      return typeof subject === type;
    };
  };

  is.ObjectOf = function (constructorName) {
    var signature = '[object ' + constructorName + ']';
    return function (subject) {
      return Object.prototype.toString.call(subject) === signature;
    };
  };

  is.RegExMatch = function (regex) {
    return function (str) {
      return is.String(str) && regex.test(str);
    };
  };

  is.Null = function (x) { return x === null; };
  is.Number = connective.and(is.TypeOf('number'), connective.not(Number.isNaN));

  var types = [
    'Function',
    'Boolean',
    'Object',
    'Undefined',
    'String'
  ];
  types.forEach(function (type) {
    is[type] = is.TypeOf(type);
  });

  var builtins = [
    'Date',
    'RegExp',
    'DataView',
    'ArrayBuffer',
    'Float32Array',
    'Float64Array',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Uint8Array',
    'Uint16Array',
    'Uint32Array'
  ];
  builtins.forEach(function (cons) {
    is[cons] = is.ObjectOf(cons);
  });

  function is (predicate) {
    if (predicate === Function) return is.Function;
    if (predicate === Boolean) return is.Boolean;
    if (predicate === Object) return is.Object;
    if (predicate === Number) return is.Number;
    if (predicate === String) return is.String;
    if (predicate === Array) return Array.isArray;

    if (predicate && predicate.name && predicate.name in
      commonjsGlobal) return is[predicate.name];

    if (predicate instanceof RegExp) return is.RegExMatch(predicate);
    if (is.Function(predicate)) return predicate;
    if (is.Null(predicate)) return is.Null;
    if (Array.isArray(predicate)) return all(is(predicate[0]));

    // object literal, fallback to tracery
    if (is.Object(predicate)) return false;

    return k(false);
  }

  var is_1 = is;

  function Collection (predicate) {
    return function (obj) {
      for (var key in obj) {
        if (!predicate(obj[key])) {
          return false;
        }
      }
      return true;
    };
  }

  var collection = Collection;

  function tracery (structure) {
    if (Array.isArray(structure)) {
      return is_1(structure);
    }

    return function (obj) {
      if (obj === undefined || obj === null) {
        return false;
      }
      for (var key in structure) {
        var type = structure[key];
        var test = is_1(type) || tracery(type);
        var prop = obj[key];
        if (!test(prop)) {
          return false;
        }
      }
      return true;
    };
  }

  function Optional (type) {
    return connective.or(is_1(type), is_1.Undefined);
  }

  function Nullable (type) {
    return connective.or(is_1(type), is_1.Null);
  }

  function Vector (structure) {
    var predicates = structure.map(is_1);
    var len = structure.length;
    return function (arr) {
      if (!Array.isArray(arr)) return false;
      if (arr.length !== len) return false;
      for (var i = 0; i < len; i++) {
        var ele = arr[i];
        if (!predicates[i](ele)) return false;
      }
      return true;
    };
  }

  function InstanceOf (constructor) {
    return function (x) {
      return x instanceof constructor;
    };
  }
  function format (diff) {
    var str = 'Interface not as expected:\n';
    // pretty print json
    str += JSON.stringify(diff, null, 2);
    return str;
  }
  var tracery_1 = tracery;
  var Collection$1 = collection;
  var Optional_1 = Optional;
  var Nullable_1 = Nullable;
  var Vector_1 = Vector;
  var InstanceOf_1 = InstanceOf;
  tracery_1.Collection = Collection$1;
  tracery_1.Optional = Optional_1;
  tracery_1.Nullable = Nullable_1;
  tracery_1.Vector = Vector_1;
  tracery_1.InstanceOf = InstanceOf_1;

  function diff (Interface, doc) {
    var d = {};
    var same = true;

    for (var prop in Interface) {
      var actual = doc[prop];
      var expected = Interface[prop];
      var test = is_1(expected);
      if (!test) {
        // expecting an object

        if (!actual) {
          // and it's mising
          same = false;
          d[prop] = {
            actual: toString(actual),
            expected: toString(expected),
            actualValue: actual
          };
        } else {
          // it's an object, recurse
          var dd = diff(expected, actual);
          if (dd) {
            same = false;
            d[prop] = dd;
          }
        }
      } else if (!is_1(expected)(actual)) {
        same = false;
        d[prop] = {
          actual: toString(actual),
          expected: toString(expected),
          actualValue: actual
        };
      }
    }

    return same ? false : d;
  }

  function toString (type) {
    // null
    if (is_1.Null(type)) { return 'Null'; }

    var t = typeof type;
    // builtin functions and custom pattern predicates
    if (t === 'function') {
      return type.name || 'Custom Function';
    }

    // value types
    if (t !== 'object') return t[0].toUpperCase() + t.substring(1);

    // typed arrays
    if (Array.isArray(type)) {
      var t0 = toString(type[0]);
      if (type.every(function (ele) { return toString(ele) === t0; })) {
        return 'Array<' + t0 + '>';
      } else {
        return 'Array';
      }
    }

    // otherwise
    return Object.prototype.toString(type).replace(/[\[\]]/g, '');
  }

  var diff_1 = diff;
  utils.addMethod(Assertion.prototype, 'interface', function (interfaceMap) {
    // map is an object map with property names as keys and strings for
    // typeof checks or a nested interfaceMap
    assert(typeof this._obj === 'object' || typeof this._obj === 'function',
      'object or function expected');

    var hasInterface = tracery_1(interfaceMap);
    assert(
      hasInterface(this._obj),
      format(diff_1(interfaceMap, this._obj)));
  });
}