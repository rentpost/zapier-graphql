'use strict'

const {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLScalarType,
  GraphQLEnumType,
  GraphQLUnionType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInterfaceType,
} = require('graphql');

/**
 * Describes the details of a GraphQL type
 *
 * @template {{
 *  fieldName: String|null,
 *  typeName: String,
 *  type: GraphQLObjectType|GraphQLInputObjectType|GraphQLScalarType|GraphQLEnumType|GraphQLUnionType|GraphQLInterfaceType,
 *  scalarType: String|null,
 *  isList: Boolean,
 *  isRequired: Boolean,
 *  description: String|null,
 *  enumValues: Array<String>,
 *  children: Array<Object>,
 * }} TypeDetails
 *
 * @property {String} fieldName   Only used in certain cases where we need to know the field name
 *                                for which a type is being described
 */
class TypeDetails {

  /**
   * @param {TypeDetails} param0
   */
  constructor({
    fieldName,
    typeName,
    type,
    scalarType,
    isList,
    isRequired,
    description,
    enumValues,
    children
  }) {
    this.fieldName = fieldName;
    this.typeName = typeName;
    this.type = type;
    this.scalarType = scalarType;
    this.isList = isList;
    this.isRequired = isRequired;
    this.description = description;
    this.enumValues = enumValues;
    this.children = children;
  }
}

module.exports = TypeDetails;
