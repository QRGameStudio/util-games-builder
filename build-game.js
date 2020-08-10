const fs = require('fs');

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
String.prototype.replaceAll = function(search, replace){
    return this.replace(new RegExp(escapeRegExp(search), 'g'), replace)
}

const TRANSLATION_TABLE = {
    ':0': '(',
    ':1': ')',
    ':2': '<',
    ':3': '>',
    ':4': '[',
    ':5': ']',
    ':6': 'for',
    ':7': 'while',
    ':8': 'if',
    ':9': 'else',
    ':A': 'const',
    ':B': 'let',
    ':C': 'var',
    ':D': 'function',
    ':E': '()=>',
    ':F': '()',
    ':G': '=>',
    ':H': '=',
    ':J': ';',
    ':K': '<=',
    ':L': '>=',
    ':M': '===',
    ':N': '!==',
    ':O': 'null',
    ':P': '!',
    ':Q': 'true',
    ':R': 'false',
    ':S': '{',
    ':T': '}',
    ':U': '"',
    ':V': "'",
    ':W': ',',
    ':X': '`',
    ':Y': '?',
    ':Z': '&&',
    '::A': '||'
}

const VALID_CHARACTERS = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
    'U', 'V', 'W', 'X', 'Y', 'Z',
    ' ', '$', '%', '*', '+', '-', '.', '/', ':'
]

let minified = fs.readFileSync(process.argv[2], 'utf8');

const translationTableReversed = {};
const translationTableReversedKeysSorted = [];
Object.keys(TRANSLATION_TABLE).forEach(k => {
    const v = TRANSLATION_TABLE[k];
    translationTableReversed[v]= k;
    translationTableReversedKeysSorted.push(v);
});
translationTableReversedKeysSorted.sort((a, b) => b.length - a.length);
minified = minified.replaceAll(':', ':::');
translationTableReversedKeysSorted.forEach(k => minified = minified.replaceAll(k, translationTableReversed[k]));
minified = minified.trim().toUpperCase();

const invalidCh = minified.split('').find(ch => VALID_CHARACTERS.indexOf(ch) === -1);
if (invalidCh) {
    console.error(`Invalid character found: ${invalidCh}`);
    process.exit(1);
}

fs.writeFileSync(process.argv[2] + '.min.js', minified);

