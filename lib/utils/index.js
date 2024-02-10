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

/**
 * Asserts that the types of the object match the sample object's defined types
 *
 * @param {Object} sample
 * @param {Object} object
 */
const assertTypesFromSample = (sample, object) => {
  for (const [key, value] of Object.entries(object)) {
    const field = sample[key];
    expect(field).toBeDefined();

    // We don't have an easy way to run any assertions against null fields
    if (value === null) {
      continue;
    }

    if (field.children) {
      expect(typeof value).toBe('object');
      assertTypesFromSample(field.children, value);
      continue;
    }

    if (field.type === 'datetime') {
      expect(typeof value).toBe('string');
    } else if (field.type === 'integer') {
      expect(value % 1 === 0).toBe(true);
    } else {
      expect(typeof value).toBe(typeof field);
    }
  }
}


/**
 * Asserts that the types of the object match the type defined in the output fields
 *
 * @param {Array} fields
 * @param {Object} object
 */
const assertTypesFromOutputFields = (fields, object) => {
  for (const [key, value] of Object.entries(object)) {
    const field = fields.find(field => field.key === key)
    expect(field).toBeDefined();

    // We don't have an easy way to run any assertions against null fields
    if (value === null) {
      continue;
    }

    if (field.children) {
      expect(typeof value).toBe('object');
      assertTypesFromOutputFields(field.children, value);
      continue;
    }

    if (field.type === 'datetime') {
      expect(typeof value).toBe('string');
    } else if (field.type === 'integer') {
      expect(value % 1 === 0).toBe(true);
    } else {
      expect(typeof value).toBe(field.type);
    }
  }
}


module.exports = {
  quote,
  assertTypesFromSample,
  assertTypesFromOutputFields,
};
