'use strict'

/**
 * Describes an input field prepared for Zapier output
 *
 * @template {{
 *  request: {
 *    urlEnvVar: String,
 *    headers: Object,
 *  },
 *  scalarMap?: Object,
 *  idMap?: Object,
 *  sortFields?: Boolean,
 *  sampleFieldValues?: {
 *    startingWith?: Object,
 *    endingWith?: Object,
 *  },
 *  testBundle?: Object,
 * }} Config
 */
class Config {

  request = {
    urlEnvVar: '',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  };


  sampleFieldValues = {
    startingWith: {},
    endingWith: {},
  };

  /**
   * @param {Config} param0
   */
  constructor({
    request,
    scalarMap = {},
    idMap = {},
    sortFields = true,
    sampleFieldValues = {},
    testBundle = {},
  }) {
    this.request.urlEnvVar = request.urlEnvVar;
    this.request.headers = {
      ...this.request.headers,
      ...request.headers,
    }

    this.scalarMap = scalarMap;
    this.idMap = idMap;
    this.sortFields = sortFields;

    this.sampleFieldValues = {
      ...this.sampleFieldValues,
      ...sampleFieldValues,
    };

    // Ensure all startingWith and endingWith keys are lowercase
    this.sampleFieldValues.startingWith = Object.entries(this.sampleFieldValues.startingWith).reduce((acc, [key, value]) => {
      acc[key.toLowerCase()] = value;
      return acc;
    }, {});

    this.sampleFieldValues.endingWith = Object.entries(this.sampleFieldValues.endingWith).reduce((acc, [key, value]) => {
      acc[key.toLowerCase()] = value;
      return acc;
    }, {});

    this.testBundle = testBundle;
  }
}

module.exports = Config;
