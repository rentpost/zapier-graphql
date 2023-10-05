'use strict';

/**
 * Adds a dynamic dropdown for an input field.  This takes care of the bad namespaced API needed
 * to call input fields.  That's an unfortunate side effect of Zapier's requirement that all input
 * fields have unique keys.
 *
 * @param {Array<Object>} inputFields The inputFields array from the operation
 * @param {Object} triggerMapping     The key name of the input field (all required to be unique), is the object property
 *                                    The dot-separated string concatenation for the trigger value, follows this pattern:
 *                                      - The key of the trigger you want to use to power the dropdown. required
 *                                      - The value to be made available in bundle.inputData. required
 *                                      - The human friendly value to be shown on the left of the dropdown in bold. optional
 *
 * @return {Array<Object>}            The inputFields array with the dynamic dropdown added
 */
const addDynamicDropdowns  = (inputFields, triggerMapping) => {
  for (const [key, value] of Object.entries(triggerMapping)) {
    inputFields.map((inputField) => {
      if (inputField.key === key) {
        inputField.dynamic = `${value}`;
      }

      // Zapier only supports one level of depth (should be refactored to recursive for more depth)
      if (inputField.children && inputField.children.length) {
        inputField.children.map((child) => {
          if (child.key === key) {
            child.dynamic = `${value}`;
          }
        });
      }
    });
  }

  return inputFields;
}

module.exports = {
  addDynamicDropdowns,
};
