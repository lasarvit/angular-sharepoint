/**
 * @ngdoc service
 * @name ExpertsInside.SharePoint.$spList
 * @requires ExpertsInside.SharePoint.$spRest
 * @requires ExpertsInside.SharePoint.$spConvert
 *
 * @description A factory which creates a list item resource object that lets you interact with
 *   SharePoint List Items via the SharePoint REST API.
 *
 *   The returned list item object has action methods which provide high-level behaviors without
 *   the need to interact with the low level $http service.
 *
 * @param {string} title The title of the SharePoint List (case-sensitive).
 *
 * @param {Object=} listOptions Hash with custom options for this List. The following options are
 *   supported:
 *
 *   - **`readOnlyFields`** - {Array.{string}=} - Array of field names that will be exlcuded
 *   from the request when saving an item back to SharePoint
 *   - **`query`** - {Object=} - Default query parameter used by each action. Can be
 *   overridden per action. See {@link ExpertsInside.SharePoint.$spList query} for details.
 *
 * @return {Object} A list item "class" object with methods for the default set of resource actions.
 *
 * # List Item class
 *
 * All query parameters accept an object with the REST API query string parameters. Prefixing them with $ is optional.
 *   - **`$select`**
 *   - **`$filter`**
 *   - **`$orderby`**
 *   - **`$top`**
 *   - **`$skip`**
 *   - **`$expand`**
 *   - **`$sort`**
 *
 * ## Methods
 *
 *   - **`get`** - {function(id, query)} - Get a single list item by id.
 *   - **`query`** - {function(query, options)} - Query the list for list items and returns the list
 *     of query results.
 *     `options` supports the following properties:
 *       - **`singleResult`** - {boolean} - Returns and empty object instead of an array. Throws an
 *         error when more than one item is returned by the query.
 *   - **`create`** - {function(item, query)} - Creates a new list item. Throws an error when item is
 *     not an instance of the list item class.
 *   - **`update`** - {function(item, options)} - Updates an existing list item. Throws an error when
 *     item is not an instance of the list item class. Supported options are:
 *       - **`query`** - {Object} - Query parameters for the REST call
 *       - **`force`** - {boolean} - If true, the etag (version) of the item is excluded from the
 *         request and the server does not check for concurrent changes to the item but just 
 *         overwrites it. Use with caution.
 *   - **`save`** - {function(item, options)} - Either creates or updates the item based on its state.
 *     `options` are passed down to `update` and and `options.query` are passed down to `create`.
 *   - **`delete`** - {function(item)} - Deletes the list item. Throws an error when item is not an
 *     instance of the list item class.
 *
 * @example
 *
 * # Todo List
 *
 * ## Defining the Todo class
 * ```js
     var Todo = $spList('Todo', {
       query: ['Id', 'Title', 'Completed']
     );
 * ```
 *
 * ## Queries
 *
 * ```js
     // We can retrieve all list items from the server.
     var todos = Todo.query();

    // Or retrieve only the uncompleted todos.
    var todos = Todo.query({
      filter: 'Completed eq 0'
    });

    // Queries that are used in more than one place or those accepting a parameter can be defined 
    // as a function on the class
    Todo.addNamedQuery('uncompleted', function() {
      filter: "Completed eq 0"
    });
    var uncompletedTodos = Todo.queries.uncompleted();
    Todo.addNamedQuery('byTitle', function(title) {
      filter: "Title eq " + title
    });
    var fooTodo = Todo.queries.byTitle('Foo');
 * ```
 */
angular.module('ExpertsInside.SharePoint')
  .factory('$spList', function($spRest, $http, $spConvert) {
    'use strict';
    var $spListMinErr = angular.$$minErr('$spList');

    function listFactory(title, listOptions) {
      if (!angular.isString(title) || title === '') {
        throw $spListMinErr('badargs', 'title must be a nen-empty string.');
      }
      if(!angular.isObject(listOptions)) {
        listOptions = {};
      }

      var normalizedTitle = $spConvert.capitalize(title
        .replace(/[^A-Za-z0-9 ]/g, '') // remove invalid chars
        .replace(/\s/g, '_x0020_') // replace whitespaces with _x0020_
      );
      var className = $spConvert.capitalize(normalizedTitle
        .replace(/_x0020/g, '') // remove _x0020_
        .replace(/^\d+/,'') // remove leading digits
       );
      var listItemType = 'SP.Data.' + normalizedTitle + 'ListItem';

      // Constructor function for List dynamically generated List class
      var List = (function() {
        // jshint evil:true
        var script =
        " (function() {                     " +
        "   function {{List}}(data) {       " +
        "     this.__metadata = {           " +
        "       type: '" + listItemType + "'" +
        "     };                            " +
        "     angular.extend(this, data);   " +
        "   }                               " +
        "   return {{List}};                " +
        " })();                             ";
        return eval(script.replace(/{{List}}/g, className));
      })();

      List.$title = title;

      /**
       * Web relative list url
       * @private
       */
      List.$$relativeUrl = "web/lists/getByTitle('" + title + "')";

      /**
       * Is this List in the host web?
       * @private
       */
      List.$$inHostWeb = !!listOptions.inHostWeb;

      /**
       * Decorate the result with $promise and $resolved
       * @private
       */
      List.$$decorateResult = function(result, httpConfig) {
        if (!angular.isArray(result) && !(result instanceof List)) {
          result = new List(result);
        }
        if (angular.isUndefined(result.$resolved)) {
          result.$resolved = false;
        }
        result.$promise = $http(httpConfig).then(function(response) {
          var data = response.data;

          if (angular.isArray(result) && angular.isArray(data)) {
            angular.forEach(data, function(item) {
              result.push(new List(item));
            });
          } else if (angular.isObject(result)) {
            if (angular.isArray(data)) {
              if (data.length === 1) {
                angular.extend(result, data[0]);
              } else {
                throw $spListMinErr('badresponse', 'Expected response to contain an array with one object but got {1}',
                  data.length);
              }
            } else if (angular.isObject(data)) {
              angular.extend(result, data);
            }
          } else {
            throw $spListMinErr('badresponse', 'Expected response to contain an {0} but got an {1}',
              angular.isArray(result) ? 'array' : 'object', angular.isArray(data) ? 'array' : 'object');
          }

          var responseEtag;
          if(response.status === 204 && angular.isString(responseEtag = response.headers('ETag'))) {
            result.__metadata.etag = responseEtag;
          }
          result.$resolved = true;

          return result;
        });

        return result;
      };


      /**
       *
       * @description Get a single list item by id
       *
       * @param {Number} id Id of the list item
       * @param {Object=} query Additional query properties
       *
       * @return {Object} List item instance
       */
      List.get = function(id, query) {
        if (angular.isUndefined(id) || id === null) {
          throw $spListMinErr('badargs', 'id is required.');
        }

        var result = {
          Id: id
        };
        var httpConfig = $spRest.buildHttpConfig(List, 'get', {id: id, query: query});

        return List.$$decorateResult(result, httpConfig);
      };


      /**
       *
       * @description Query for the list for items
       *
       * @param {Object=} query Query properties
       * @param {Object=} options Additional query options.
       *   Accepts the following properties:
       *   - **`singleResult`** - {boolean} - Returns and empty object instead of an array. Throws an
       *     error when more than one item is returned by the query.
       *
       * @return {Array<Object>} Array of list items
       */
      List.query = function(query, options) {
        var result = (angular.isDefined(options) && options.singleResult) ? {} : [];
        var httpConfig = $spRest.buildHttpConfig(List, 'query', {
          query: angular.extend({}, List.prototype.$$queryDefaults, query)
        });

        return List.$$decorateResult(result, httpConfig);
      };


      /**
       *
       * @description Save a new list item on the server.
       *
       * @param {Object=} item Query properties
       * @param {Object=} options Additional query properties.
       *
       * @return {Object} The decorated list item
       */
      List.create = function(item, query) {
        if (!(angular.isObject(item) && item instanceof List)) {
          throw $spListMinErr('badargs', 'item must be a List instance.');
        }
        item.__metadata = angular.extend({
          type: listItemType
        }, item.__metadata);

        var httpConfig = $spRest.buildHttpConfig(List, 'create', {
          item: item,
          query: angular.extend({}, item.$$queryDefaults, query)
        });

        return List.$$decorateResult(item, httpConfig);
      };


      /**
       *
       * @description Update an existing list item on the server.
       *
       * @param {Object=} item the list item
       * @param {Object=} options Additional update properties.
       *   Accepts the following properties:
       *   - **`force`** - {boolean} - Overwrite newer versions on the server.
       *
       * @return {Object} The decorated list item
       */
      List.update = function(item, options) {
        if (!(angular.isObject(item) && item instanceof List)) {
          throw $spListMinErr('badargs', 'item must be a List instance.');
        }

        options = angular.extend({}, options, {
          item: item
        });

        var httpConfig = $spRest.buildHttpConfig(List, 'update', options);

        return List.$$decorateResult(item, httpConfig);
      };

      /**
       *
       * @description Update or create a list item on the server.
       *
       * @param {Object=} item the list item
       * @param {Object=} options Options passed to create or update.
       *
       * @return {Object} The decorated list item
       */
      List.save = function(item, options) {
        if (angular.isDefined(item.__metadata) && angular.isDefined(item.__metadata.id)) {
          return this.update(item, options);
        } else {
          var query = angular.isObject(options) ? options.query : undefined;
          return this.create(item, query);
        }
      };

      /**
       *
       * @description Delete a list item on the server.
       *
       * @param {Object=} item the list item
       *
       * @return {Object} The decorated list item
       */
      List.delete = function(item) {
        if (!(angular.isObject(item) && item instanceof List)) {
          throw $spListMinErr('badargs', 'item must be a List instance.');
        }
        var httpConfig = $spRest.buildHttpConfig(List, 'delete', {item: item});

        return List.$$decorateResult(item, httpConfig);
      };

      /**
       * Named queries hash
       */
      List.queries = { };

      /**
       *
       * @description Add a named query to the queries hash
       *
       * @param {Object} name name of the query, used as the function name
       * @param {Function} createQuery callback invoked with the arguments passed to
       *   the created named query that creates the final query object
       * @param {Object=} options Additional query options passed to List.query
       *
       * @return {Array} The query result
       */
      List.addNamedQuery = function(name, createQuery, options) {
        List.queries[name] = function() {
          var query = angular.extend(
            {},
            List.prototype.$$queryDefaults,
            createQuery.apply(List, arguments)
          );
          return List.query(query, options);
        };
        return List;
      };

      List.prototype = {
        $$readOnlyFields: angular.extend([
          'AttachmentFiles',
          'Attachments',
          'Author',
          'AuthorId',
          'ContentType',
          'ContentTypeId',
          'Created',
          'Editor',
          'EditorId', 'FieldValuesAsHtml',
          'FieldValuesAsText',
          'FieldValuesForEdit',
          'File',
          'FileSystemObjectType',
          'FirstUniqueAncestorSecurableObject',
          'Folder',
          'GUID',
          'Modified',
          'OData__UIVersionString',
          'ParentList',
          'RoleAssignments'
        ], listOptions.readOnlyFields),
        $$queryDefaults: angular.extend({}, listOptions.query),
        $save: function(options) {
          return List.save(this, options).$promise;
        },
        $delete: function() {
          return List.delete(this).$promise;
        },
        $isNew: function() {
          return angular.isUndefined(this.__metadata) || angular.isUndefined(this.__metadata.id);
        }
      };

      return List;
    }

    return listFactory;
  });
