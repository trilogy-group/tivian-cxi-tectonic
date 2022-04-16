// @flow

import React, { Component } from "react";
import PropTypes from "prop-types";
import Manager from "../manager";

/**
 * Loader is a top-level wrapper component which provides react context for
 * the Manager.
 *
 * This allows our @load wrapper to issue queries to Manager which then
 * resolves these queries via `resolvers`.
 */
export const TectonicContext = React.createContext({});

export default function Loader(props) {
  return (
    <TectonicContext.Provider value={props.manager}>
      {props.children}
    </TectonicContext.Provider>
  );
}

Loader.propTypes = {
  children: PropTypes.node.isRequired,
  manager: PropTypes.instanceOf(Manager).isRequired,
};
