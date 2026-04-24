const { URL } = require('url');
const url = new URL('https://yougikou.github.io/real-cards/?preview=true');
console.log(url.search);
