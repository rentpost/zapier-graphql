'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const inflection = require('inflection');

const { Agent } = require('undici');
const {
  GraphQLSchema,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLScalarType,
  GraphQLEnumType,
} = require('graphql');
const { buildClientSchema } = require('graphql/utilities/buildClientSchema.js');
const { getIntrospectionQuery } = require('graphql/utilities/getIntrospectionQuery.js');
const { updateEntryFile } = require('zapier-platform-cli/src/utils/scaffold.js');

const Config = require('./Config.js');
const TypeDetails = require('./TypeDetails.js');
const InputField = require('./InputField.js');
const OutputField = require('./OutputField.js');

/** @type {Config} */
let config;

/** @type {GraphQLSchema } */
let cachedSchema;


/**
 * A hacked JSON.stringify that will preserve functions and regexes, etc.
 * This isn't perfect for sure and could use improvment, but is sufficient for single layer sample
 * data at the moment.  It's really nasty, I'm aware.
 *
 * @param {Object|Array} input
 *
 * @returns {String}
 */
const stringifyObject = (input, indentation = 0) => {
  if (Array.isArray(input)) {
    return `[
${' '.repeat(indentation > 2 ? (indentation - 2) : indentation)}${input.map((v) => stringifyObject(v, indentation)).join(`,\n${' '.repeat(indentation > 2 ? (indentation - 2) : indentation)}`)}
${' '.repeat(indentation > 2 ? (indentation - 2) : indentation)}]`;
  }

  if (typeof input === 'object') {
    return `{
${' '.repeat(indentation)}${Object.entries(input).map(([k, v]) => `${k}: ${stringifyObject(v, indentation)}`).join(`,\n${' '.repeat(indentation)}`)}
${' '.repeat(indentation > 2 ? (indentation - 2) : indentation)}}`;
  }

  if (input === 'CURRENT_TIMESTAMP') {
    return `new Date().toISOString()`;
  }

  if (typeof input === 'string') {
    return `${JSON.stringify(input)}`;
  }

  return `${input}`;
};


/**
 * Helper function to indent in every line of a multi-line string.
 *
 * @param {String} string
 */
const indentString = (string, spaces = 0) => {
  return string.replaceAll('\n', `\n${' '.repeat(spaces)}`);
}


/**
 * Gets the GraphQL request configuration and performs necessary validation.
 *
 * @returns {Object}
 */
const getConfig = () => {
  if (config) {
    return config;
  }

  try {
    config = new Config(require(process.cwd() + '/.zapiergraphql'));
  } catch (e) {
    throw new Error('No .zapiergraphql config file found in project root');
  }

  if (!config.request.urlEnvVar) {
    throw new Error(
      'GraphQL service not configured. You must call "configureGraphQL" and provide the request.url.',
    );
  }

  return config;
}


/**
 * This is really for testing due to mocking limitations.
 *
 * @param {Config} newConfig
 */
const setConfig = (newConfig) => {
  config = newConfig;
}


/**
 * Makes a GraphQL request to the API server.
 *
 * @returns {Promise<Object>}
 */
const makeRequest = async (gql) => {
  const { urlEnvVar, headers } = getConfig().request;

  const response = await fetch(new URL(process.env[urlEnvVar]), {
    dispatcher: new Agent({
      connect: {
        rejectUnauthorized: false,
      },
    }),
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
        query: gql,
    }),
  });

  if (response.status !== 200) {
    throw new Error(`[HTTP ${response.status}: ${response.statusText}}] ${await response.text()}`);
  }

  return await response.json();
}


/**
 * Gets the GraphQL schema from the API server and parses it out into a GraphQLSchema object.
 *
 * @returns {Promise<GraphQLSchema>}
 */
const getSchema = async () => {
  if (cachedSchema) {
    return cachedSchema;
  }

  const json = await makeRequest(getIntrospectionQuery());

  cachedSchema = buildClientSchema(json.data);

  return cachedSchema;
}


/**
 * Gets a specific query definition from the schema
 *
 * @param {String} query
 */
const getQueryDefinition = async (query) => {
  const schema = await getSchema();
  const queries = schema.getQueryType()?.getFields();
  if (!queries || !queries[query]) {
    throw new Error(`Query "${query}" does not exist`);
  }

  return queries[query];
}


/**
 * Gets a specific mutation definition from the schema
 *
 * @param {String} mutation
 */
const getMutationDefinition = async (mutation) => {
  const schema = await getSchema();
  const mutations = schema.getMutationType()?.getFields();
  if (!mutations || !mutations[mutation]) {
    throw new Error(`Mutation "${mutation}" does not exist`);
  }

  return mutations[mutation];
}


/**
 * Builds out the details for a type
 *
 * Type objects are one of the following:
 *    GraphQLUnionType
 *    GraphQLScalarType (inferred)
 *    GraphQLObjectType (implemented)
 *    GraphQLNonNull (implemented)
 *    GraphQLList (implemented)
 *    GraphQLInterfaceType
 *    GraphQLInputObjectType (implemented)
 *    GraphQLEnumType
 *
 * @param {Object} outerType          The outermost type object
 * @param {String|null} fieldName          The name of the field, if available
 *
 * @returns {TypeDetails}
 */
const getTypeDetails = (outerType, fieldName = null) => {
  let typeName = null;
  let type = null;
  let scalarType = null;
  let isList = false;
  let isRequired = false;
  let description = null;
  let enumValues = [];
  let children = [];

  /**
   * Will determine the scalar type of the type
   *
   * @param {Object} t
   *
   * @returns {String|null}
   */
  const determineScalarType = (t) => {
    if (t instanceof GraphQLScalarType && t.name) {
      const scalarType = getConfig().scalarMap[t.name] ?? null;
      if (!scalarType) {
        throw new Error(`Unable to determine scalar type for "${type.name}" field`);
      }

      return scalarType;
    }

    if (t instanceof GraphQLEnumType) {
      return 'string';
    }

    return null;
  }

  /**
   * Checking for the actual name property seems to be a reliable way of determining this.
   * This will infer the outerscope, which is really the most important for our needs.
   *
   * @param {Object} t  Could be one of many graphql-js object types and unsure of an interface
   */
  const inferTypeDetails = (t) => {
    typeName = t.name ? t.name : null;
    type = t.name ? t : null;
    isList = isList || t instanceof GraphQLList;
    description = description || t.description;
    isRequired = isRequired ? isRequired : t instanceof GraphQLNonNull;
    scalarType = scalarType || determineScalarType(t);
    enumValues = enumValues.length ? enumValues : (t instanceof GraphQLEnumType
      ? t.getValues().map(v => v.name)
      : []
    );

    if (t.ofType) {
      inferTypeDetails(t.ofType); // Continue inferring on the sub ofType
    }
  }

  inferTypeDetails(outerType);

  if (!type || !typeName || typeof type !== 'object') {
    throw new Error(`Unable to determine type details for "${type}"`);
  }

  return new TypeDetails({
    fieldName,
    typeName,
    type,
    scalarType,
    isList,
    isRequired,
    description,
    enumValues,
    children, // For API simplcity we're including this
  });
}


/**
 * Gets the actual Type object, which is often nested and associated details
 *
 * Type objects are one of the following:
 *    GraphQLUnionType
 *    GraphQLScalarType (inferred)
 *    GraphQLObjectType (implemented)
 *    GraphQLNonNull (implemented)
 *    GraphQLList (implemented)
 *    GraphQLInterfaceType
 *    GraphQLInputObjectType (implemented)
 *    GraphQLEnumType
 *
 * @param {Object} outerType          The outermost type object
 * @param {String|null} fieldName     The name of the field, if available
 * @param {Number} depth              The depth of the field, used for recursion
 *
 * @returns {TypeDetails}
 */
const getTypeDetailsWithChildren = (outerType, fieldName = null, depth = 0) => {
  let typeDetails = getTypeDetails(outerType, fieldName);

  // Prevents infinite recursion and Zapier only supports 1 level of depth anyway
  if (depth > 1) {
    return typeDetails;
  }

  let children = [];
  if (typeDetails.type instanceof GraphQLObjectType || typeDetails.type instanceof GraphQLInputObjectType) {
    const fields = Object.entries(typeDetails.type.getFields());

    depth++;
    fields.forEach((f) => {
      if (f[1].type instanceof GraphQLList) {
        children[f[0]] = getTypeDetailsWithChildren(f[1].type.ofType, fieldName, depth);
        return;
      }

      children[f[0]] = getTypeDetailsWithChildren(f[1].type, fieldName, depth);
    });

    typeDetails.children = children;
  }

  return typeDetails;
}


/**
 * Prioritize the id in the first position, then alphabetically sort the input fields,
 * based on the config setting.
 *
 * @param {Array<InputField>} fields
 *
 * @returns {Array<InputField>}
 */
const sortInputFields = (fields) => {
  return !getConfig().sortFields ? fields : fields.sort((a, b) => {
    const aKey = a.key.split('__').pop();
    const bKey = b.key.split('__').pop();

    if (!aKey || !bKey) {
      return 0;
    }

    if (aKey === 'id') {
      return -1;
    }

    if (bKey === 'id') {
      return 1;
    }

    return aKey < bKey ? -1 : 1;
  });
}


/**
 * Builds an array of children fields
 *
 * @param {TypeDetails} typeDetails     The type details of the type with children
 * @param {Boolean} forGQL              Whether or not to build the input fields for a GQL query
 * @param {Array<String>} fieldDepth    The field depth (array of parent field names)
 *
 * @returns {Array<InputField>}
 */
const getInputFieldChildren = (typeDetails, forGQL, fieldDepth) => {
  let children = [];
  for (const [field, child] of Object.entries(typeDetails.children)) {
    if (fieldDepth.length > 1) {
      return []; // Skip children of children - Zapier only supports a depth of 1 :(
    }

    // It's possible that children have children of their own, so we need to process those
    child.name = field;
    const parentFieldName = child.children.length ? child.field : typeDetails.fieldName;
    fieldDepth.push(parentFieldName);
    children.push(...getInputFields([child], forGQL, fieldDepth));
    fieldDepth.pop();
  }

  return children;
}


/**
 * Builds an object of the input fields for a query or mutation.
 *
 * @param {Array<import('graphql').GraphQLArgument>|Array<TypeDetails>} fields
 * @param {Boolean} forGQL                Whether or not to build the input fields for a GQL query
 * @param {Array<String>} fieldDepth      The field depth, an array of parent field names
 *
 * @returns {Array<InputField>}
 */
const getInputFields = (
  fields,
  forGQL = false,
  fieldDepth = [],
) => {
  if (!fields.length) {
    return [];
  }

  let inputFields = [];

  const buildInputFields = (fields) => {
    for (const field of fields) {
      const typeDetails = getTypeDetailsWithChildren(field.type, field.name);

      // If there aren't any children, it's a scalar field
      if (!Object.entries(typeDetails.children).length) {
        inputFields.push(new InputField({
          key: `${fieldDepth.length > 1 ? fieldDepth.slice(-1) + '__' : ''}${typeDetails.fieldName}`,
          ...(forGQL && {field: typeDetails.fieldName}),
          label: inflection.transform(typeDetails.fieldName, ['underscore', 'titleize']),
          type: typeDetails.scalarType,
          // typeDetails won't be processed for outermost type on children, since the getTypeDetails
          // attempts to get the innermost type, while gathering important information, like isRequired.
          // To get the isRequired value, we just check the outer field (typeDetails in this case).
          required: field.isRequired || typeDetails.isRequired,
          helpText: typeDetails.description,
          ...(typeDetails.enumValues.length && {choices: typeDetails.enumValues}),
        }));

        continue;
      }

      // Process the child fields
      const children = sortInputFields(getInputFieldChildren(typeDetails, forGQL, fieldDepth));
      if (children && fieldDepth.length > 1) {
        continue; // Skip children of children - Zapier only supports a depth of 1 :(
      }

      // Type field isn't used for fields with children
      // Help text cannot be used for fields with children
      inputFields.push(new InputField({
        key: `${fieldDepth.length > 1 ? fieldDepth.join('.') + '.' : ''}${typeDetails.fieldName}`,
        ...(forGQL && {field: typeDetails.fieldName}),
        label: inflection.transform(typeDetails.fieldName, ['underscore', 'titleize']),
        // typeDetails won't be processed for outermost type on children, since the getTypeDetails
        // attempts to get the innermost type, while gathering important information, like isRequired.
        // To get the isRequired value, we just check the outer field (typeDetails in this case).
        required: field.isRequired || typeDetails.isRequired,
        ...(typeDetails.enumValues.length && {choices: typeDetails.enumValues}),
        ...(children.length && {children}),
      }));
    }
  }

  buildInputFields(fields);

  return sortInputFields(inputFields);
}


/**
 * Gets the flatted input fields with the primary input field removed.
 *
 * @param {Array<import('graphql').GraphQLArgument>} fields
 */
const getInputFieldsFlattened = (fields) => {
  let inputFields = getInputFields(fields);

  // If it's a single input type field with children, for better compatibility with Zapier,
  // we'll flatten it and apply all the fields to the top level.
  if (inputFields.length === 1 // Child fields should be nested
    && inputFields[0].children?.length
  ) {
    // Remove the top level field
    const topLevelField = inputFields.shift();

    // Add the children to the top level
    inputFields = topLevelField.children;
  }

  return inputFields;
}


/**
 * Prioritize the id in the first position, then alphabetically sort the input fields,
 * based on the config setting.
 *
 * @param {Array<OutputField>} fields
 *
 * @returns {Array<OutputField>}
 */
const sortOutputFields = (fields) => {
  return !getConfig().sortFields ? fields : fields.sort((a, b) => {
    if (a.key === 'id') {
      return -1;
    }

    if (b.key === 'id') {
      return 1;
    }

    return a.key < b.key ? -1 : 1;
  });
}


/**
 * Builds an object of the output fields from a type.
 *
 * @param {GraphQLObjectType} type
 * @param {Boolean} forGQL          Whether or not to build the output fields for a GQL query
 *
 * @returns {Array<OutputField>}
 */
const getOutputFields = (type, forGQL = false) => {
  // If the getFields function isn't available, assume it's a scalar or enum output type
  if (typeof type.getFields !== 'function') {
    const typeDetails = getTypeDetails(type);

    if (!typeDetails.scalarType) {
      throw new Error(`Unable to handle scalar type for "${type.name}" field`);
    }

    return [new OutputField({
      key: typeDetails.typeName === 'ID' ? 'id' : 'value', // GraphQL implicity returns don't have a field - default to 'value'
      label: inflection.transform(type.name, ['underscore', 'titleize']),
      type: typeDetails.scalarType,
      ...(typeDetails.enumValues.length && {choices: typeDetails.enumValues}),
      // required: typeDetails.isRequired, // Will require sample data
    })];
  }

  // Otherwise treat it as an object with associated fields
  const fields = Object.entries(type.getFields());

  let outputFields = [];
  for (const [key, field] of fields) {
    const typeDetails = getTypeDetails(field.type, field.name);

    // For now we're skipping relational object fields and only outputting scalar fields.
    if (!typeDetails.scalarType) {
      continue;
    }

    if (!typeDetails.fieldName) {
      throw new Error(`Unable to determine field name for "${typeDetails.typeName}" field`);
    }

    outputFields.push(new OutputField({
      key: typeDetails.fieldName,
      label: inflection.transform(field.name, ['underscore', 'titleize']),
      type: typeDetails.scalarType,
      ...(typeDetails.enumValues.length && {choices: typeDetails.enumValues}),
      // required: typeDetails.isRequired, // Will require sample data
    }));
  }

  // If this type is in our idMap, map the "id" to the mapped field.  We don't want this being
  // passed to the GQL query, since it's not a real field.  This is instead dynamically handled
  // within the "perform" function by modifying the response data.
  if (!forGQL && getConfig().idMap[type.name]) {
    const idField = outputFields.find(f => f.key === 'id');
    if (!idField) {
      outputFields.push(new OutputField({
        key: 'id',
        label: 'Id',
        type: 'string',
      }));
    }
  }

  // Is there an "id" field added?  If not, we'll add it.

  // Prioritize the id in the first position, then sort alphabetically
  return sortOutputFields(outputFields);
}


/**
 * Builds out a GQL query string.
 *
 * @param {String} queryOrMutation
 * @param {String} operation
 * @param {Array<InputField>} inputFields
 * @param {Array<OutputField>} outputFields
 *
 * @returns {String}
 */
const buildGQL = (
  queryOrMutation,
  operation,
  inputFields,
  outputFields,
) => {
  if (!['query', 'mutation'].includes(queryOrMutation)) {
    throw new Error(`Must be 'query' or 'mutation', not "${queryOrMutation}"`);
  }

  const buildGQLFields = (fields, fieldDepth = []) => {
    return fields.map(field => {
      if (field.children && field.children.length) {
        fieldDepth.push(field.key);
        const gqlFields =
`${'  '.repeat(fieldDepth.length + 1)}${field.field}: {
${buildGQLFields(field.children, fieldDepth).join('\n')}
${'  '.repeat(fieldDepth.length + 1)}}`;

        fieldDepth.pop();
        return gqlFields;
      }

      return buildGQLField(field, fieldDepth);
    });
  }

  const buildGQLField = (field, fieldDepth = []) => {
    if (!field.field) {
      throw new Error(`Unable to build GQL field for "${field.key}" field`);
    }

    // Since we don't know if we've flattened any objects for Zapier compatibility here, it's a bit
    // difficult to deal with the fieldDepth when appending it to the namespace.  However, since
    // the depth for Zapier is limited to 1, we can just get the last parent field in the depth.
    const parentFieldNamespace = fieldDepth.length > 1 ? fieldDepth.slice(-1)[0] + '.': '';
    let value = `\${quote(inputData.${parentFieldNamespace}${field.key}${!field.required ? ' ?? null' : ''})}`;

    return '  '.repeat(fieldDepth.length ? fieldDepth.length + 2 : 2) + `${field.field}: ${value}`;
  }

  let gql = `${queryOrMutation} {
  ${operation}`;

  gql += inputFields.length ? `(
${buildGQLFields(inputFields).join('\n')}
  ) {\n` : ' {\n';
  gql += '    ' + outputFields.map(f => f.key).join('\n    ');
  gql += `
  }
}`;

  return gql;
}


/**
 * Does a best-effort attempt to create sample data for the output fields.
 *
 * @param {Array<InputField|OutputField>} fields
 */
const createSamples = (fields) => {
  /**
   * Will get a configured sample value for a field, if available.
   *
   * @param {InputField|OutputField} field
   * @returns
   */
  const getConfiguredValue = (field) => {
    if (field.children) {
      return null;
    }

    const sampleFieldValues = getConfig().sampleFieldValues || {};

    if (sampleFieldValues.exact && sampleFieldValues.exact[field.key]) {
      return sampleFieldValues.exact[field.key];
    }

    let returnValue = null;
    Object.entries(sampleFieldValues.startingWith || {}).forEach(([key, value]) => {
      if (field.key.toLowerCase().startsWith(key)) {
        returnValue = value;
      }
    });

    Object.entries(sampleFieldValues.endingWith || {}).forEach(([key, value]) => {
      if (field.key.toLowerCase().endsWith(key)) {
        returnValue = value;
      }
    });

    return returnValue;
  }


  let samples = {};
  for (const field of fields) {
    if (samples[field.key]) {
      continue;
    }

    if (field.choices && field.choices.length) {
      samples[field.key] = field.choices[0];
      continue;
    }

    const configredValue = getConfiguredValue(field);
    if (configredValue !== null) {
      samples[field.key] = configredValue;
      continue;
    }

    const getSampleValue = (field) => {
      if (field.children) {
        return createSamples(field.children);
      }

      switch (field.type) {
        case 'string':
          if (field.key === 'id') {
            return '1';
          }
          return 'Something';
        case 'number':
          return 1.0;
        case 'integer':
          return 1;
        case 'boolean':
          return true;
        case 'datetime':
          return 'CURRENT_TIMESTAMP';
        default:
          throw new Error(`Unable to create sample data for "${field.key}" field`);
      };
    }

    samples[field.key] = getSampleValue(field);
  }

  return samples;
}


/**
 * Gets the content for a query action file.
 *
 * @param {String} action   Zapier action type, either "triggers" or "searches"
 * @param {String} query    The GraphQL query field name
 *
 * @returns {Promise<String>}   Query file contents
 */
const getQueryActionContent = async (action, query) => {
  if (!['trigger', 'search'].includes(action)) {
    throw new Error(`Must be 'trigger' or 'search', not "${action}"`);
  }

  const definition = await getQueryDefinition(query);
  const typeDetails = getTypeDetails(definition.type);
  const inputFields = getInputFieldsFlattened(definition.args);
  const outputFields = getOutputFields(typeDetails.type);

  const samples = createSamples(outputFields);
  const gql = indentString(buildGQL(
    'query',
    query,
    getInputFields(definition.args, true),
    getOutputFields(typeDetails.type, true)
  ), 6);

  const label = typeDetails.isList
    ? `Finds ${inflection.pluralize(typeDetails.type.name)}`
    : `Find ${typeDetails.type.name}`;

  const description = typeDetails.isList
    ? action === 'triggers' ? `Triggers when performing lookup for ${inflection.pluralize(typeDetails.type.name)}` : definition.description
    : action === 'triggers' ? `Triggers when performing lookup for a ${inflection.pluralize(typeDetails.type.name)}` : definition.description;

  const idMapping = getConfig().idMap[typeDetails.type.name]
    ? `
  // Will handle the id mapping to a new "id" field for Zapier compatibility
  response.data.data.${query} = response.data.data.${query}.map(r => ({...r, id: r.${getConfig().idMap[typeDetails.type.name]}}));
    `
    : '';

  const contents =
`/**
 * ${query} query
 * This file was auto-generated by zapier-graphql.
 */

'use strict';

const { getConfig } = require('zapier-graphql');
const { quote } = require('zapier-graphql/lib/utils');

// Executes the ${query} query at runtime
const perform = async (z, bundle) => {
  ${inputFields.length ? 'const inputData = bundle.inputData;' : ''}
  const response = await z.request({
    url: process.env.${getConfig().request.urlEnvVar},
    method: 'POST',
    headers: getConfig().request.headers,
    json: {
      query: \`${gql}\`,
    }
  });
  ${idMapping}
  // This should return an array of objects
  return ${typeDetails.isList ? `response.data.data.${query}` : `[response.data.data.${query}]`};
};


// For a full list of available properties, see:
// https://github.com/zapier/zapier-platform/blob/main/packages/schema/docs/build/schema.md#searchschema
module.exports = {
  key: '${definition.name}',
  noun: '${typeDetails.type.name}',

  display: {
    label: '${label}',
    description: \`${description}\`,
  },

  operation: {
    perform,

    inputFields: ${indentString(JSON5.stringify(inputFields, null, 2), 4)},

    sample: ${stringifyObject(samples, 6)},

    outputFields: ${indentString(JSON5.stringify(outputFields, null, 2), 4)},
  }
};
`;

  return contents;
}


/**
 * Gets the content for a mutation action file.
 *
 * @param {String} mutation
 *
 * @returns {Promise<String>}   Mutation file contents
 */
const getMutationActionContent = async (mutation) => {
  const definition = await getMutationDefinition(mutation);

  const typeDetails = getTypeDetails(definition.type);
  const inputFields = getInputFieldsFlattened(definition.args);
  const outputFields = getOutputFields(typeDetails.type);
  const samples = createSamples(outputFields);
  const gql = indentString(buildGQL(
    'mutation',
    mutation,
    getInputFields(definition.args, true),
    getOutputFields(typeDetails.type, true)
  ), 6);

  const label = typeDetails.isList
    ? `Creates multiple ${inflection.pluralize(typeDetails.type.name)}`
    : `Create ${typeDetails.type.name}`;

  const idMapping = getConfig().idMap[typeDetails.type.name]
    ? `
  // Will handle the id mapping to a new "id" field for Zapier compatibility
  response.data.data.${mutation} = response.data.data.${mutation}.map(r => ({...r, id: r.${getConfig().idMap[typeDetails.type.name]}}));
    `
    : '';

  const contents =
`/**
 * ${mutation} mutation
 * This file was auto-generated by zapier-graphql.
 */

'use strict';

const { getConfig } = require('zapier-graphql');
const { quote } = require('zapier-graphql/lib/utils');

// Executes the ${mutation} mutation at runtime
const perform = async (z, bundle) => {
  ${inputFields.length ? 'const inputData = bundle.inputData;' : ''}
  const response = await z.request({
    url: process.env.${getConfig().request.urlEnvVar},
    method: 'POST',
    headers: getConfig().request.headers,
    json: {
      query: \`${gql}\`,
    }
  });
  ${idMapping}
  // This should return a single object
  return response.data.data.${mutation};
};


// For a full list of available properties, see:
// https://github.com/zapier/zapier-platform/blob/main/packages/schema/docs/build/schema.md#searchschema
module.exports = {
  key: '${definition.name}',
  noun: '${typeDetails.type.name}',

  display: {
    label: '${label}',
    description: \`${definition.description}\`,
  },

  operation: {
    perform,

    inputFields: ${indentString(JSON5.stringify(inputFields, null, 2), 4)},

    sample: ${stringifyObject(samples, 6)},

    outputFields: ${indentString(JSON5.stringify(outputFields, null, 2), 4)},
  }
};
`;

  return contents;
}


/**
 * Creates an action file (creates, triggers, searches) from a query or mutation.
 *
 * @param {String} action     Zapier action type, either "triggers", "searches", or "creates"
 * @param {String} operation  The GraphQL query or mutation field name
 *
 * @returns {Promise<{file: String, contents: String}>}   Action file contents
 */
const createActionFile = async (action, operation) => {
  if (!['trigger', 'search', 'create'].includes(action)) {
    throw new Error(`Must be 'trigger', 'search', or 'create', not "${action}"`);
  }

  if (action === 'create') {
    var definition = await getMutationDefinition(operation);
    var contents = await getMutationActionContent(operation);
  } else {
    var definition = await getQueryDefinition(operation);
    var contents = await getQueryActionContent(action, operation);
  }

  const filename = inflection.dasherize(inflection.underscore(definition.name)) + '.js';

  console.log(`Creating ${operation} action file: ${inflection.pluralize(action)}/${filename}`);

  fs.mkdirSync(`${process.cwd()}/${inflection.pluralize(action)}/`, { recursive: true });
  const file = `${process.cwd()}/${inflection.pluralize(action)}/${filename}`;
  fs.writeFileSync(file, contents);

  return { file, contents };
}


/**
 * Creates the test file for the operation
 *
 * @param {String} action     Zapier action type, either "triggers", "searches", or "creates"
 * @param {String} operation  The GraphQL query or mutation field name
 *
 * @returns {Promise<{file: String, contents: String}>}   Test file contents
 */
const createTestFile = async (action, operation) => {
  if (!['trigger', 'search', 'create'].includes(action)) {
    throw new Error(`Must be 'trigger', 'search', or 'create', not "${action}"`);
  }

  if (action === 'create') {
    var queryOrMutation = 'mutation';
    var definition = await getMutationDefinition(operation);
  } else {
    var queryOrMutation = 'query';
    var definition = await getQueryDefinition(operation);
  }

  const filename = inflection.dasherize(inflection.underscore(definition.name)) + '.test.js';

  console.log(`Creating ${queryOrMutation} test file: test/${inflection.pluralize(action)}/${filename}`);

  const inputFields = getInputFieldsFlattened(definition.args);
  const samples = createSamples(inputFields);

  const contents =
`/**
 * ${inflection.capitalize(action)} ${operation} ${queryOrMutation}
 * This file was auto-generated by the zapier-graphql plugin.
 */

'use strict';

const zapier = require('zapier-platform-core');
const { getConfig } = require('zapier-graphql');

const App = require('../../index');
const appTester = zapier.createAppTester(App);

// Read the '.env' file into the environment, if available
zapier.tools.env.inject();

describe('${definition.name} ${queryOrMutation}', () => {
  it('should run', async () => {
    const bundle = {
      ...getConfig().testBundle,
      inputData: ${indentString(JSON.stringify(samples, null, 2), 6)},
    };

    const assertTypes = (fields, object) => {
      for (const [key, value] of Object.entries(object)) {
        const field = fields.find(field => field.key === key)
        expect(field).toBeDefined();

        // We don't have an easy way to run any assertions against null fields
        if (value === null) {
          continue;
        }

        if (field.children) {
          expect(typeof value).toBe('object');
          assertTypes(field.children, value);
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

    let results = await appTester(App.${inflection.pluralize(action)}.${operation}.operation.perform, bundle);
    results = results instanceof Array ? results : [results];
    const firstResult = results[0];

    const outputFields = App.${inflection.pluralize(action)}.${operation}.operation.outputFields
    expect(Object.keys(firstResult).length).toBe(outputFields.length);
    assertTypes(outputFields, firstResult);
  });
});
`;

  fs.mkdirSync(`${process.cwd()}/test/${inflection.pluralize(action)}/`, { recursive: true });
  const file = `${process.cwd()}/test/${inflection.pluralize(action)}/${filename}`;
  fs.writeFileSync(file, contents);

  return { file, contents };
}


/**
 * Creates the test file for the operation
 *
 * @param {String} urlEnvVar
 *
 * @returns {Promise<{file: String, contents: String}>}   Config file contents
 */
const createDefaultConfigFile = async (urlEnvVar) => {
  if (!urlEnvVar) {
    throw new Error('Missing URL environment variable parameter');
  }

  let contents = '';
  try {
      const filename = require.resolve('zapier-graphql/.zapiergraphql.sample');
      contents = await fs.promises.readFile(filename, { encoding: 'utf8' });
      contents = contents.replace('{{urlEnvVar}}', urlEnvVar);
  } catch (e) {
      throw new Error(e.message);
  }

  if (!contents) {
    throw new Error('Unable to create config file');
  }

  const file = `${process.cwd()}/.zapiergraphql`;
  await fs.writeFileSync(file, contents);

  // Need to be sure to update the default Zapier config to include our config file in builds
  const zapierConfigFile = `${process.cwd()}/.zapierapprc`;
  const zapierConfig = JSON.parse(fs.readFileSync(zapierConfigFile, 'utf8'));
  zapierConfig.includeInBuild = zapierConfig.includeInBuild || [];
  zapierConfig.includeInBuild.push('.zapiergraphql');
  await fs.writeFileSync(zapierConfigFile, JSON.stringify(zapierConfig, null, 2));

  return { file, contents };
}


/**
 * Creates or updates the query file and imports it into the main Zapier index.js, assigning
 * it to the triggers object, if it doesn't already exist.
 *
 * @param {String} query
 */
const addTriggerQuery = async (query) => {
  const zapierApp = require(process.cwd() + '/index.js');

  if (zapierApp.triggers[query]) {
    console.log(`Triggers "${query}" query already configured in Zapier index.js entry file`);
    return;
  }

  const { file } = await createActionFile('trigger', query);
  await createTestFile('trigger', query);

  console.log(`Adding triggers "${query}" query to index.js`);
  await updateEntryFile(
    `./index.js`,
    `${query}Trigger`,
    `${path.parse(file).dir}/${path.parse(file).name}`,
    'trigger',
    query,
  );
}


/**
 * Creates or updates the query file and imports it into the main Zapier index.js, assigning
 * it to the searches object, if it doesn't already exist.
 *
 * @param {String} query
 */
const addSearchQuery = async (query) => {
  const zapierApp = require(process.cwd() + '/index.js');

  if (zapierApp.searches[query]) {
    console.log(`Searches "${query}" query already configured in Zapier index.js entry file`);
    return;
  }

  const definition = await getQueryDefinition(query);
  if (!definition.args.length) {
    throw new Error(`Unable to add "${query}" search query.  It must have at least one argument.`);
  }

  const { file } = await createActionFile('search', query);
  await createTestFile('search', query);

  console.log(`Adding searches "${query}" query to index.js`);
  await updateEntryFile(
    `./index.js`,
    `${query}Search`,
    `${path.parse(file).dir}/${path.parse(file).name}`,
    'search',
    query,
  );
}


/**
 * Creates or updates the mutation file and imports it into the main Zapier index.js, assigning
 * it to the creates object, if it doesn't already exist.
 *
 * @param {String} mutation
 */
const addCreateMutation = async (mutation) => {
  const zapierApp = require(process.cwd() + '/index.js');

  if (zapierApp.creates[mutation]) {
    console.log(`Creates "${mutation}" mutation already configured in Zapier index.js entry file.`);
    return;
  }

  const { file } = await createActionFile('create', mutation);
  await createTestFile('create', mutation);

  console.log(`Adding create "${mutation}" mutation to index.js`);
  await updateEntryFile(
    `./index.js`,
    `${mutation}Create`,
    `${path.parse(file).dir}/${path.parse(file).name}`,
    'create',
    mutation,
  );
}


/**
 * Updates all of the operations configured as triggers, searches, and creates within Zapier.
 */
const updateConfiguredOperations = async () => {
  const zapierApp = require(process.cwd() + '/index.js');

  for (const [key, query] of Object.entries(zapierApp.triggers)) {
    await createActionFile('trigger', key);
  }

  for (const [key, query] of Object.entries(zapierApp.searches)) {
    await createActionFile('search', key);
  }

  for (const [key, mutation] of Object.entries(zapierApp.creates)) {
    await createActionFile('create', key);
  }
}


/**
 * Cleans up all the Zapier specific triggers, creates, and searches directories and files.
 * This could be useful when re-generating configured files/modules for the Zapier integration.
 */
const removeAllZapierFiles = () => {
  const directories = [
    'triggers',
    'searches',
    'creates',
    'test/triggers',
    'test/searches',
    'test/creates',
  ];

  // Remove all the directories
  directories.forEach((dir) => {
    try {
      fs.rmSync(`${process.cwd()}/${dir}`, { recursive: true, force: true });
    } catch (e) {
      throw new Error(`Unable to remove directory: ${dir}: ${e.message}`);
    }
  });
}


module.exports = {
  addTriggerQuery,
  addSearchQuery,
  addCreateMutation,
  updateConfiguredOperations,
  createActionFile,
  createDefaultConfigFile,
  getConfig,
  setConfig,
  removeAllZapierFiles,
};
