// @flow

import Sources from '../sources';
import Cache from '../cache';
import Status from '../status/status';
import { RETURNS_ITEM, RETURNS_LIST } from '../consts';

import type Query from '../query';
import type {
  Props,
} from '../consts';

import deepEqual from 'deep-equal';

export type ManagerOpts = {
  store: Object, // todo: redux flow
  drivers: { [key: string]: Function }, // todo: Driver type
  resolver: Object, // todo: Resolver type
}

/**
 * The manager is the single interface for tectonic. It handles:
 *  - Adding API endpoints as sources from various drivers
 *  - Passing queries to the resolver
 *  - Calling resolve using previously defined sources to load data
 *  - Instantiating and handling the cache [todo]
 *
 * Example usage:
 *
 *   'use strict';
 *
 *   import { Manager, BaseResolver } from 'tectonic';
 *   import superagent from 'tectonic-superagent';
 *
 *   const manager = new Manager({
 *     drivers: {
 *       fromSuperagent: superagent
 *     },
 *     resolver: new BaseResolver()
 *   });
 *
 *   manager.fromSuperagent([
 *     {...} // List superagent sources
 *   ]);
 *
 *   ... // Wrap your root component like so:
 *   <Loader manager={ manager }>
 *     ...
 *   </Loader>
 *
 */
export default class Manager {

  store: Object
  cache: Object
  resolver: Object
  drivers: Object
  sources: Sources

  constructor({ store, drivers, resolver }: ManagerOpts = {}) {
    if (typeof drivers !== 'object') {
      throw new Error('You must supply at least one driver to instantiate a manager');
    }

    if (!resolver) {
      throw new Error('You must pass a resolver to instantiate a manager');
    }

    this.cache = new Cache(store);
    this.store = store;
    this.resolver = resolver;
    this.sources = new Sources();
    // Add the store to the resolver for dispatching actions
    this.resolver.store = store;
    // And add the cache to the resolver for querying and adding data
    this.resolver.cache = this.cache;
    this.drivers = {};

    // Make each driver callable via its key bound to our current context. This
    // allows us to add definitions for each driver by calling
    // sources[driverName](), ie: sources.fromSDK([...]);
    Object.keys(drivers).forEach((driver) => {
      const driverFunc = drivers[driver];
      // When calling the driver name run processDefinitions to add the
      // definitions to the Source class.
      (this: Object).drivers[driver] = defs =>
        this.sources.processDefinitions(driverFunc, defs, this.resolver);
    });
  }

  /**
   * addQuery adds a query to the resolver from within the @load decoator.
   *
   * @param Query
   */
  addQuery(query: Query) {
    this.resolver.addQuery(query, this.sources.definitions);
  }

  /**
   * resolve calls the Resolver's `resolveAll` function passing in the map of
   * source definitions previously defined and processed.
   */
  resolve() {
    this.resolver.resolveAll(this.sources.definitions);
  }

  // Return True/False/NaN. NaN is returned if there is no expiration.
  isQueryExpired(query) {
    if (!query) {
      return NaN;
    }

    const state = this.store.getState().tectonic;
    const expiry = state.getIn(['queriesToExpiry', query.hash()], 0);
    // There is no expiration, return NaN
    if (0 === expiry) {
      return NaN;
    }

    // There is an expiration, return if it is expired
    return expiry < new Date();
  }

  /**
   * props returns the query data and loading data for a given set of queries.
   *
   * @param object Object of prop names => queries
   * @param Immutable.Map tectonic state
   */
  props(queries: { [key: string]: Query }, state: ?Map<*, *> = undefined) {
    const { cache } = this;
    const props: Props = {
      status: {},
    };

    if (!queries) {
      return props;
    }

    if (state === undefined || state === null) {
      state = this.store.getState().tectonic;
      // if state is still undefined then the reducer hasn't been added to
      // redux - throw an error
    }

    Object.keys(queries).forEach((prop) => {
      const query = queries[prop];
      const Model = query.model;
      let status = cache.getQueryStatus(query, state);

      // respectCache is only taken into account if the status is undefined or
      // pending; if the status is SUCCESS or ERROR within the query it has
      // already been resolved.
      const respectCache = query.status !== 'SUCCESS' && !status.isError();

      // We only respect the cache if the query status is pending or undefined.
      // You might expect us to respec the cache if the status is SUCCESS: we
      // don't, because the query property's status is ONLY set if the query has
      // just been resolved, so we can ignore the cache.
      // SUCCESS is not set internally on query instances based on cache hits
      // TODO: tidy into cache hit property?
      if (this.cache.hasQueryExpired(query, state) && respectCache) {
        status = new Status({ status: 'PENDING' });
      }

      if (!deepEqual(props.status[prop], status)) {
        props.status[prop] = status;
      }

      // Attempt to load the data regardless of the query status. This will
      // return the previous data, if possible.
      let data = cache.getQueryData(query, state)[0];

      if (data === undefined) {
        // There was no data - add defaults, which is a blank model or an empty
        if (query.returnType === RETURNS_ITEM) {
          data = query.model.blank();
        } else {
          data = [];
        }
      } else {
        data = cache.getIdentical(Model, data);
      }

      props[prop] = data;
    });

    return props;
  }

}
