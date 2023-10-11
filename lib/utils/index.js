'use strict';

/**
 * Will quote a string, but leave other types alone
 *
 * @param {*} value
 *
 * @returns {*}
 */
const quote = (value) => {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  return value;
}


module.exports = {
  quote,
};
