'use strict';

const path = require('path');

const { setConfig, createActionFile } = require('../../lib');
const Config = require('../../lib/Config');

process.env.TEST_ENV_VAR = 'https://library.example.com/graphql';

const bookConnectionSchema = require('../fixture/book-connection-schema.json');
let sampleConfig = require('../../etc/.zapiergraphql.sample');
sampleConfig.request.urlEnvVar = 'TEST_ENV_VAR';

setConfig(new Config(sampleConfig));

// Mocks
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

global.fetch = jest.fn().mockReturnValue({
  status: 200,
  json: () => bookConnectionSchema,
});

// Ignore console.log output
console.log = jest.fn();


/**
 * Loads a generated action module, resolving its zapier-graphql imports to this package
 *
 * @param {String} contents
 *
 * @returns {Object}
 */
const loadAction = (contents) => {
  const modules = {
    'zapier-graphql': require('../../lib'),
    'zapier-graphql/lib/utils': require('../../lib/utils'),
  };
  const module = { exports: {} };

  new Function('require', 'module', 'exports', contents)((name) => modules[name], module, module.exports);

  return module.exports;
}


describe('createActionFile for a connection query', () => {
  it('selects the output fields on the nodes', async () => {
    const { file, contents } = await createActionFile('search', 'books');

    expect(path.basename(file)).toEqual('books.js');
    expect(contents).toMatch(/nodes \{\s+id\s+title\s+pageCount\s+publishedAt\s+\}/);
    expect(contents).not.toMatch(/totalCount/);
  });

  it('describes the action by the node type', async () => {
    const { contents } = await createActionFile('search', 'books');
    const action = loadAction(contents);

    expect(action.noun).toEqual('Book');
    expect(action.display.label).toEqual('Finds Books');
    expect(action.operation.outputFields.map(f => f.key)).toEqual(['id', 'title', 'pageCount', 'publishedAt']);
    expect(Object.keys(action.operation.sample)).toEqual(['id', 'title', 'pageCount', 'publishedAt']);
    expect(action.operation.inputFields.map(f => f.key)).toEqual(['first', 'after', 'title']);
  });

  it('returns the nodes', async () => {
    const { contents } = await createActionFile('trigger', 'books');
    const action = loadAction(contents);

    const nodes = [{ id: '1', title: 'Dune', pageCount: 412, publishedAt: null }];
    const z = {
      request: jest.fn().mockResolvedValue({
        data: { data: { books: { nodes, pageInfo: { hasNextPage: false } } } },
      }),
    };

    const results = await action.operation.perform(z, { inputData: { first: 10 } });

    expect(results).toEqual(nodes);
    expect(z.request.mock.calls[0][0].json.query).toMatch(/books\(\s+first: 10\s+after: null\s+title: null\s+\) \{\s+nodes \{/);
  });

  it('leaves a single object query unchanged', async () => {
    const { contents } = await createActionFile('search', 'book');
    const action = loadAction(contents);

    const book = { id: '1', title: 'Dune', pageCount: 412, publishedAt: null };
    const z = { request: jest.fn().mockResolvedValue({ data: { data: { book } } }) };

    expect(contents).not.toMatch(/nodes/);
    expect(await action.operation.perform(z, { inputData: { id: '1' } })).toEqual([book]);
  });
});
