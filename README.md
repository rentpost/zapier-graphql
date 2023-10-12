# Zapier GraphQL

[![NPM Version](http://img.shields.io/npm/v/zapier-graphql.svg?style=flat)](https://www.npmjs.org/package/zapier-graphql)
[![NPM Downloads](https://img.shields.io/npm/dm/zapier-graphql.svg?style=flat)](https://npmcharts.com/compare/zapier-graphql?minimal=true)
![CI](https://github.com/rentpost/zapier-graphql/actions/workflows/node.js.yml/badge.svg)

Zapier Platform CLI is primarily designed for REST APIs.  That does present some organizational questions when it comes to designing a Zapier CLI app.  Further, REST APIs are huge question marks, in general.  Whereas, GraphQL
APIs all have an accessible typed schema.  This CLI app is designed to make use of a GraphQL API's schema for
automatic configuration of a Zapier CLI app.

This lib started out as an experiment to simplify all the necessary boilerplate and maintenance required for a Zapier CLI app.  Virtually everything required to be "coded" was already defined in a GraphQL schema.  So, why not use the schema to generate the boilerplate code?  The experiment was a success and this lib was born.

At present, this lib will generate valid, tested and compliant modules ("actions") for your Zapier app.  In fact, you can run something like the following to add a new GraphQL operation as a live Zapier action:

```bash
zapier-graphql scaffold search contacts && zapier push
```

That's it.  This will generate a new GraphQL module in your project at, `./searches/contacts.js`.  It will also generate a `./test/searches/contacts.js` test file for your new action.  Finally, the `zapier push` command will push the new action to your Zapier app.

## Requirements

- [Node.js](https://nodejs.org/en/) >= 18.3.0
- [Zapier Platform CLI](https://github.com/zapier/zapier-platform/tree/main/packages/cli)

## Installation

This lib can be installed globally, or locally.  We recommend installing it locally, so you can make use of the `utils` module as well.

```bash
npm install --save zapier-graphql
```

*Ensure that `./node_modules/.bin/` is added to your PATH (`export PATH=$PWD/node_modules/.bin:$PATH`) so you don't have to reference the CLI script directly, `./node_modules/.bin/zapier-graphql ...`*

## Usage

```bash
zapier-graphql --help
```

## Design Principals

Originally this lib was designed to generate base and extension files, allowing for base files to be updated as your schema changes.  However, the extension files ended up with code that wasn't very
enjoyable to work with and the base files were left with generated code that was undesirable.  Therefore,
the decision was made to only "scaffold" the Zapier "action" files.

As a result, the API for the `zapier-graphql` command and the overall functionality, is similar to
that of the `zapier` CLI command (see [Usage](#usage) above).

## Configuration

Upon first use of the CLI app, you'll be prompted to create a `.zapiergraphql` config file.  This file is used to configure the CLI app and is required for use.  If you'd like to go ahead and generate one and configure it properly, just execute `zapier-graphql init`.

*This will also include the file in your `.zapierapprc` config as an `includeInBuild` item.*

The config file that's created for you is a JavaScript module that exports an object - the config.  The config file has some documentation and includes all configurable directives.  See below for additional configuration details.

The main config file for `zapier-graphql` provides a few different directives to improve the generated output code of your action files.

- `request` - An object that configures the request.  Currently there are two properties:
  - `urlEnvVar` - An environment variable that includes the full base url of your GraphQL API.
  - `headers` - Headers to include for every request.  By default `Content-Type: application/json` and `Accept: application/json` are included.

  ```js

- `scalarMap` - An object of GraphQL scalar type to Zapier type property/values.  This is useful for mapping GraphQL `DateTime` scalars to Zapier `datetime` types, for example.

  ```js
  scalarMap: {
    DateTime: 'datetime',
    Date: 'datetime',
    Email: 'string',
    PhoneNumber: 'string',
    Url: 'string',
  }
  ```

- `idMap` - Zapier requires that every action return an `id` property.  They do this for caching reasons.  And unfortunately, you cannot customize what the actual identifier keys are.  To hack around this ridiculousness, we provide an `idMap` that allows you to define the identifier key for each GraphQL Type.  Under the hood, this will return an additional `id` property in the response from the mapped identifier value.

  ```js
  idMap: {
    Contact: "pk",
    WidgetType: "key",
  }
  ```

- `sampleFieldValues` - Guessing good sample values to provide for fields is pretty difficult, if not impossible.  We're not even going to attempt this madness.  Some rudimentary attempts are made to provide sample values, based on the GraphQL field type.  But, they're hardly satisfactory in many cases.  To get around this, we provide this directive.  There are a few different ways to configure these sample values.

  The `sampleFieldValues` directive is an object with key/value pairs where the property/key is the GraphQL field/Zapier input field name, and the value is whatever you'd like to display as a sample value.  There are 3 properties of the `sampleFieldValues` object: `exact`, `startingWith` and `endingWith`.  Exact will just be an exact match for field name.  The other two, `startingWith` and `endingWith`, function like you'd expect, with the property/key being a string that matches the start or end of a field name.  The field names and directive keys are evaluated as case-insensitive.

  ```js
  sampleFieldValues: {
    exact: {
      id: 'abcd8a33-13fb-4174-a136-c9bf5302f572', // Applies to `id` only
    },
    startingWith: {
      'name_': 'John Doe', // Applies to something like `name_full` (Hopefully your API isn't that bad)
    }
    endingWith: {
      'amount': '100.00', // Applies to `amount` or `totalAmount`
      'email': 'j.doe@example.com', // Would apply for `email` or `userEmail`
    }
  }
  ```

- `testBundle` - Zapier's "bundle" object that's passed to tests.  This is helpful to include the `authData`, or any other input data used globally for all tests.

## Tests

Tests are also created when using the `scaffold` command and can be run using the `zapier test` command.

From your `.zapiergraphql` config file, you can define the `testBundle` (Zapier's "bundle") used for tests.  This is helpful for `authData`.  For action specific bundle `inputData`, you should modify the test file directly.

```js
testBundle: {
  authData: {
    apiKey: process.env.API_KEY,
  },
}
```

*Test files are never updated after the intial scaffold.*

## Issues / Bugs / Questions

Please feel free to raise an issue against this repository if you have any questions or problems.

## Contributing

New contributors to this project are welcome. PRs are open.

## Authors and Maintainers

- Jacob Thomason jacob@rentpost.com

## License

This library is released under the [Apache-2.0 license](https://github.com/rentpost/zapier-graphql/blob/master/LICENSE).
