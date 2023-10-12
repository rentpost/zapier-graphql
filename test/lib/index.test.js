'use strict';

const fs = require('fs');
const path = require('path');

const {
  createDefaultConfigFile,
  setConfig,
  createActionFile,
} = require('../../lib');
const Config = require('../../lib/Config');

process.env.TEST_ENV_VAR = 'https://spacex-production.up.railway.app';

const spaceXSchema = require('../fixture/space-x-schema.json');
let sampleConfig = require('../../etc/.zapiergraphql.sample');
sampleConfig.request.urlEnvVar = 'TEST_ENV_VAR';
sampleConfig.scalarMap = {
  ...sampleConfig.scalarMap,
  uuid: 'string',
  timestamptz: 'string',
};

setConfig(new Config(sampleConfig));

// Mocks
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  rmdirSync: jest.fn(),
}));

// Just return the Space X schema
global.fetch = jest.fn().mockReturnValue({
  ...jest.requireActual('node-fetch'),
  status: 200,
  json: () => spaceXSchema,
});

// Ignore console.log output
console.log = jest.fn();


// Tests
describe('createConfigFile', () => {
  it('should return the contents of our sample config with passed env variable', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(`{}`);

    const { file, contents } = await createDefaultConfigFile('TEST_ENV_VAR');

    expect(path.basename(file)).toEqual('.zapiergraphql');
    expect(contents).toEqual(expect.stringContaining('TEST_ENV_VAR'));
  });
});


describe('createActionFile', () => {
  it('should create the trigger query file', async () => {
    await createActionFile('trigger', 'dragon');
  });

  it('should create the search query file', async () => {
    await createActionFile('search', 'dragon');
  });

  it('should create the create mutation file', async () => {
    await createActionFile('create', 'delete_users');
  });
});
