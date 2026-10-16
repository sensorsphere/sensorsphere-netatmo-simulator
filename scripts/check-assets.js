import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
if(!css.trimStart().startsWith(':root')||css.includes('<!doctype')||css.length<4000||!css.includes('.integration-status'))throw Error('Invalid CSS: appears overwritten or incomplete');
if(!html.trimStart().startsWith('<!doctype html>')||!html.includes('/ui/style.css'))throw Error('Invalid HTML');
console.log('Static assets validated');
