'use strict'

/**
 * Describes an input field prepared for Zapier
 *
 * @template {{
 *  key: String,
 *  field?: String|null,
 *  label: String,
 *  type?: String|null,
 *  required: Boolean,
 *  helpText?: String|null,
 *  choices?: Array<String>,
 *  children?: Array<InputField>,
 * }} InputField
 */
class InputField {

  /**
   * @param {InputField} param0
   */
  constructor({
    key,
    field,
    label,
    type,
    required,
    helpText,
    choices,
    children,
  }) {
    this.key = key;
    this.field = field;
    this.label = label;
    this.type = type;
    this.required = required;
    this.helpText = helpText;
    this.choices = choices;
    this.children = children;
  }
}

module.exports = InputField;
