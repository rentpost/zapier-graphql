'use strict'

/**
 * Describes an input field prepared for Zapier output
 *
 * @template {{
 *  key: String,
 *  label: String,
 *  type?: String,
 *  choices?: Array<String>|undefined,
 * }} OutputField
 */
class OutputField {

  /**
   * @param {OutputField} param0
   */
  constructor({
    key,
    label,
    type,
    choices,
  }) {
    this.key = key;
    this.label = label;
    this.type = type;
    this.choices = choices;
  }
}

module.exports = OutputField;
