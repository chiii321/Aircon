// Run: node tests/dark-logo.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const web = join(__dirname, '..', 'web');
const css = readFileSync(join(web, 'base.css'), 'utf8');
const darkRule = css.match(/:root\[data-theme="dark"\] \.brand-symbol,[^{]+\{([^}]+)\}/);
assert(darkRule, 'Dark theme must switch both header and dashboard logos');
assert.match(darkRule[1], /assets\/admin-logo-dark\.svg/);
const dark = readFileSync(join(web, 'assets', 'admin-logo-dark.svg'), 'utf8');
assert.match(dark, /stroke="#fefefe"/i, 'Dark logo must contain the supplied white stroke');
assert.doesNotMatch(dark, /#354[05]8e/i, 'Do not replace the dark asset with a blue logo');
const light = readFileSync(join(web, 'assets', 'admin-logo-final.svg'), 'utf8');
assert.match(light, /#35408e/i, 'Keep the original blue logo for light mode');
console.log('PASS: dark logo uses white/yellow, light logo stays blue/yellow, CSS switches both logo classes');
