import { createCssVariablesTheme } from 'shiki/core';

const THEME_VARIABLE_PREFIX = '--notes-';

export const shikiTheme = createCssVariablesTheme({
  name: 'css-variables',
  variablePrefix: THEME_VARIABLE_PREFIX,
  variableDefaults: {},
  fontStyle: true,
});
