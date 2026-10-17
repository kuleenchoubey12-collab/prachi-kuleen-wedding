import fs from 'node:fs';
const [projectUrl,siteUrl]=process.argv.slice(2);
if(!projectUrl||!siteUrl)throw Error('Usage: node tools/configure-site.mjs https://PROJECT.supabase.co https://USERNAME.github.io/REPOSITORY/');
const project=new URL(projectUrl),site=new URL(siteUrl);
if(project.protocol!=='https:'||!project.hostname.endsWith('.supabase.co')||project.username||project.password)throw Error('Use your Supabase project URL, without credentials.');
if(site.protocol!=='https:'||site.username||site.password)throw Error('Use the public HTTPS website URL.');
const config={apiUrl:project.origin+'/functions/v1/wedding',defaultCountryCode:'91'};
fs.writeFileSync(new URL('../docs/config.js',import.meta.url),'// Public configuration. No secret keys.\nwindow.WEDDING_CONFIG = Object.freeze('+JSON.stringify(config,null,2)+');\n');
console.log('Public website configured. In Supabase secrets set ALLOWED_ORIGINS to: '+site.origin);
