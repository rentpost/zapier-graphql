# Zapier GraphQL

Zapier Platform CLI is primarily designed for REST APIs.  That does present some organizational questions when it comes to designing a Zapier CLI app.  Further, REST APIs are huge question marks, in general.  Whereas, GraphQL
APIs all have an accessible typed schema.  This CLI app is designed to make use of a GraphQL API's schema for
automatic configuration of a Zapier CLI app.

This lib started out as an experiment to simplify all the necessary boilerplate and maintenance required for a Zapier CLI app.  Virtually everything required to be "coded" was already defined in a GraphQL schema.  So, why not use the schema to generate the boilerplate code?  The experiment was a success and this lib was born.

The goal of this lib is to be able to generate base GraphQL operation modules that can be extended and customized for use with your Zapier app.  At present, this lib will generate valid, tested and compliant modules ("actions") for your Zapier app.  In fact, you can run something like the following to add a new GraphQL operation as a live Zapier action:

```bash
zapier-graphql scaffold searches contacts && zapier push
```

That's it.  This will generate a new GraphQL module in your project at, `./graphql/query/contacts.js`.  It will create an "extension module" within the standard [zapier-platform-cli](https://github.com/zapier/zapier-platform-cli) directrory, `./searches/contacts.js`.  It will import the extension module into your `index.js` entry file and register the new action with the `searches` export.  It will also generate a `./test/searches/contacts.js` test file for your new action.  Finally, the `zapier push` command will push the new action to your Zapier app.

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

## Configuration

Upon first use of the CLI app, you'll be prompted to create a `.zapiergraphql` config file.  This file is used to configure the CLI app and is required for use.  If you'd like to go ahead and generate one and configure it properly, just execute `zapier-graphql init`.

The config file that's created for you is a JavaScript module that exports an object - the config.  The config file has some documentation and includes all configurable directives.  See below for additional configuration details.

## Design Principals

It's important to discuss the overall design, motivations, and recommendations for your Zapier CLI app, when used in conjunction with this lib.

### GraphQL Base Operation Modules

A design choice was made to generate "base modules", for your GraphQL operations, that can be updated as your schema changes, with much less concern for how it'll affect your Zapier app.  These "base modules" are entirely generated from your schema, and make a best effort attempt to populate default values.

In many cases, you'll want to update these, or they simply will not work, as-is.  For those cases, we have 2 separate approaches to address this issue.

- [Zapier Extension Modules](#zapier-extension-modules)

- `.zapiergraphql` config file

  The main config file for `zapier-graphql` provides a few different directives to improve the generated output code of your base operation modules.

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

    It's entirely possible that this directive becomes burdensome to use and you'd prefer to customize
    the sample values directly.  Due to the extension design for our GraphQL operation modules, we can modify the [Zapier Extension Modules](#zapier-extension-modules) directly.

You could also decide to update these "base modules" directly and import them into your Zapier app `index.js`, assigning them to the respective action.  There really isn't anything wrong with this approach.  It just means you won't be able to easily update them as your schema changes.  Maybe that's okay with you, and if so, you can go that route and skip the next section for [Zapier Extension Modules](#zapier-extension-modules).  You can also make use of git diff, if you want to be able to update these "base modules" and apply back your changes.  This might be cumbersome though, and if they diverge too much, it'll probably become a nightmare to maintain.  For that reason, we recommend using the configuration directives and the [extension modules](#zapier-extension-modules).

### Zapier Extension Modules

Extension modules provide access to the GraphQL operation module and export the same object.  The act as a middleware of sorts.  Anything that was defined in the [GraphQL base operation modules](#graphql-base-operation-modules) can be overridden in the extension modules.  This is the recommended approach for customizing your Zapier app.

Here is an example extension module:

```js
'use strict';

const addUserMutation = require('../graphql/mutation/add-user');

// Customize the `addUserMutation` before exporting
addUserMutation.display.description = 'My custom desctipion for the addUserMutation';
addUserMutation.operation.sample.whateverField = 'Whatever';

module.exports = addUserMutation;
```

To assist with customizing extension modules, we provide some utility functions that can be imported from `zapier-graphql/utils`:

- `addDynamicDropdowns(inputFields, triggerMapping)`
  - `inputFields` - An array of input field objects from the GraphQL operation module
  - `triggerMapping` - An object with key/value pairs where the key is the input field key (all required to be unique) and the value is a dot-separated string concatenation for the trigger value, following this Zapier pattern (`countries.key.name` or `users.email.fullName`):
    - The key of the trigger you want to use to power the dropdown. required
    - The value to be made available in bundle.inputData. required
    - The human friendly value to be shown on the left of the dropdown in bold. optional

  ```js Example
  const addUserMutation = require('../graphql/mutation/add-user');
  const { addDynamicDropdowns } = require('zapier-graphql/utils');

  addUserMutation.operation.inputFields = addDynamicDropdowns(addUserMutation.operation.inputFields, {
    country: 'countries.key.name',
    typeKey: 'userTypes.key.name',
  });
  ```

### Tests

Tests are also created when using the `scaffold` command and can be run using the `zapier test` command.

From your `.zapiergraphql` config file, you can define the `testBundle` (Zapier's "bundle") used for tests.

```js
testBundle: {
  authData: {
    apiKey: process.env.API_KEY,
  },
}
```

## Issues / Bugs / Questions

Please feel free to raise an issue against this repository if you have any questions or problems.

## Contributing

New contributors to this project are welcome. PRs are open.

## Authors and Maintainers

- Jacob Thomason jacob@rentpost.com

## License

This library is released under the [Apache-2.0 license](https://github.com/rentpost/zapier-graphql/blob/master/LICENSE).
