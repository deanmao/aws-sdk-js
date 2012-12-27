/**
 * Copyright 2011-2012 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You
 * may not use this file except in compliance with the License. A copy of
 * the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

var AWS = require('../core');
var inherit = AWS.util.inherit;

require('../xml/parser');

AWS.ServiceInterface.Query = {
  buildRequest: function buildRequest(req, resp) {
    var operation = req.client.api.operations[req.operation];
    var httpRequest = resp.httpRequest;
    httpRequest.headers['Content-Type'] =
      'application/x-www-form-urlencoded; charset=utf-8';
    httpRequest.params = new AWS.QueryParamList();
    httpRequest.params.add('Version', req.client.api.apiVersion);
    httpRequest.params.add('Action', req.operation);

    // convert the request parameters into a list of query params,
    // e.g. Deeply.NestedParam.0.Name=value
    var rules = operation.i;
    if (rules) rules = rules.m;
    var builder = new AWS.QueryParamSerializer(rules);
    builder.serialize(req.params, function(name, value) {
      httpRequest.params.add(name, value);
    });
  },

  extractError: function extractError(req, resp) {
    var data = new AWS.XML.Parser({}).parse(resp.httpResponse.body);
    if (data.Code) {
      resp.error = AWS.util.error(new Error(), {
        code: data.Code,
        message: data.Message
      });
    } else {
      resp.error = AWS.util.error(new Error(), {
        code: resp.httpResponse.statusCode,
        message: null
      });
    }
  },

  extractData: function extractData(req, resp) {
    var operation = req.client.api.operations[req.operation];
    var parser = new AWS.XML.Parser(operation.o);
    resp.data = parser.parse(resp.httpResponse.body);
  }
};

/**
 * @api private
 */
AWS.QueryParamList = inherit({

  constructor: function QueryParamList() {
    this.params = [];
  },

  add: function add(name, value) {
    this.params.push(new AWS.QueryParam(name, value));
  },

  sortedParams: function sortedParams() {
    return this.params.sort(function (p1, p2) {
      return p1.name < p2.name ? -1 : 1;
    });
  },

  toString: function toString() {
    var params = [];
    AWS.util.arrayEach(this.sortedParams(), function (param) {
      params.push(param.toString());
    });
    return params.join('&');
  }

});

/**
 * @api private
 */
AWS.QueryParam = inherit({

  constructor: function QueryParam(name, value) {
    this.name = name;
    this.value = value;
  },

  encode: function encode(string) {
    return AWS.util.uriEscape(string);
  },

  toString: function toString() {
    return this.value ?
      this.encode(this.name) + '=' + this.encode(this.value) :
      this.encode(this.name);
  }

});

/**
 * @api private
 */
AWS.QueryParamSerializer = inherit({

  constructor: function QueryParamSerializer(rules, memberedLists) {
    this.rules = rules;
    this.memberedLists = memberedLists;
  },

  serialize: function serialize(params, fn) {
    this.serializeStructure('', params, this.rules, fn);
  },

  serializeStructure: function serializeStructure(prefix, struct, rules, fn) {
    var that = this;
    AWS.util.each(struct, function (name, member) {
      var n = rules[name].n || name; // handle member names for structures
      var memberName = prefix ? prefix + '.' + n : n;
      that.serializeMember(memberName, member, rules[name], fn);
    });
  },

  serializeMap: function serialzeMap(name, map, rules, fn) {

    var n = 1;
    var that = this;

    AWS.util.each(map, function (key, value) {

      var position = '.' + (n++) + '.';
      var keyName = position + (rules.k.n || 'key');
      var valueName = position + (rules.m.n || 'value');

      that.serializeMember(name + keyName, key, rules.k, fn);
      that.serializeMember(name + valueName, value, rules.m, fn);

    });
  },

  serializeList: function serializeList(name, list, rules, fn) {
    var that = this;
    AWS.util.arrayEach(list, function (v, n) {
      var suffix = '.' + (n + 1);
      if (that.memberedLists)
        suffix = '.' + (rules.n || 'member') + suffix;
      that.serializeMember(name + suffix, v, rules, fn);
    });
  },

  serializeMember: function serializeMember(name, value, rules, fn) {
    if (rules.t === 'o')
      this.serializeStructure(name, value, rules.m, fn);
    else if (rules.t === 'a')
      this.serializeList(name, value, rules.m, fn);
    else if (rules.t === 'm')
      this.serializeMap(name, value, rules, fn);
    else
      fn.call(this, name, String(value));
  }

});
